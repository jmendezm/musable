import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  MagnifyingGlassIcon,
  MusicalNoteIcon,
  UserIcon,
  RectangleStackIcon,
  QueueListIcon,
  XMarkIcon,
  ClockIcon,
  PlayIcon
} from '@heroicons/react/24/outline';
import { useDebounce } from 'use-debounce';
import { apiService } from '../services/api';
import { Song, Artist, Album, Playlist, User } from '../types';
import { usePlayerStore } from '../stores/playerStore';
import clsx from 'clsx';

interface SearchResult {
  type: 'song' | 'artist' | 'album' | 'playlist' | 'user';
  id: number;
  title: string;
  subtitle?: string;
  artwork?: string;
  imageUrl?: string;
  songCount?: number;
  fullSongData?: Song; // Store full song data for playback
  username?: string; // For user type
}

const GlobalSearchBar: React.FC = () => {
  const navigate = useNavigate();
  const playSong = usePlayerStore(state => state.play);
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Update dropdown position when results are shown
  const updateDropdownPosition = useCallback(() => {
    if (showResults && searchContainerRef.current) {
      const rect = searchContainerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    } else {
      setDropdownPosition(null);
    }
  }, [showResults]);

  useEffect(() => {
    updateDropdownPosition();

    // Update position on scroll and resize
    window.addEventListener('scroll', updateDropdownPosition);
    window.addEventListener('resize', updateDropdownPosition);

    return () => {
      window.removeEventListener('scroll', updateDropdownPosition);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  }, [updateDropdownPosition]);

  // Fetch search results
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [songsRes, artistsRes, albumsRes, playlistsRes, usersRes] = await Promise.all([
        apiService.getSongs({ search: searchQuery, limit: 5 }),
        apiService.getArtists(searchQuery),
        apiService.getAlbums({ search: searchQuery }),
        apiService.searchPlaylists(searchQuery),
        apiService.searchUsers(searchQuery)
      ]);

      const searchResults: SearchResult[] = [];

      // Add songs
      songsRes.data.songs?.forEach((song: Song) => {
        searchResults.push({
          type: 'song',
          id: song.id,
          title: song.title,
          subtitle: `${song.artist_name}${song.album_title ? ' • ' + song.album_title : ''}`,
          artwork: song.artwork_path,
          fullSongData: song
        });
      });

      // Add artists
      artistsRes.data.artists?.forEach((artist: Artist) => {
        searchResults.push({
          type: 'artist',
          id: artist.id,
          title: artist.name,
          subtitle: `${artist.song_count || 0} songs`,
          imageUrl: artist.image_path,
          songCount: artist.song_count
        });
      });

      // Add albums
      albumsRes.data.albums?.forEach((album: Album) => {
        searchResults.push({
          type: 'album',
          id: album.id,
          title: album.title,
          subtitle: album.artist_name,
          artwork: album.artwork_path
        });
      });

      // Add playlists
      playlistsRes.data.playlists?.forEach((playlist: Playlist) => {
        searchResults.push({
          type: 'playlist',
          id: playlist.id,
          title: playlist.name,
          subtitle: `${playlist.username} • ${playlist.song_count || 0} songs`,
          songCount: playlist.song_count
        });
      });

      // Add users
      usersRes.data.users?.forEach((user: User) => {
        searchResults.push({
          type: 'user',
          id: user.id,
          title: user.username,
          subtitle: user.is_admin ? 'Admin' : 'User',
          imageUrl: user.profile_picture,
          username: user.username
        });
      });

      setResults(searchResults.slice(0, 10)); // Limit to 10 results total
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    performSearch(debouncedQuery);
  }, [debouncedQuery, performSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is outside both the search container AND the results dropdown
      const isOutsideSearch = !searchContainerRef.current?.contains(target);
      const isOutsideResults = !resultsRef.current?.contains(target);

      if (isOutsideSearch && isOutsideResults) {
        setShowResults(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle result click
  const handleResultClick = useCallback((result: SearchResult) => {
    setShowResults(false);

    switch (result.type) {
      case 'song':
        // Play the song instead of navigating
        if (result.fullSongData) {
          playSong(result.fullSongData);
        }
        break;
      case 'artist':
        navigate(`/artist/${result.id}`);
        break;
      case 'album':
        navigate(`/album/${result.id}`);
        break;
      case 'playlist':
        navigate(`/playlist/${result.id}`);
        break;
      case 'user':
        if (result.username) {
          navigate(`/profile/${result.username}`);
        }
        break;
    }
  }, [navigate, playSong]);

  // Scroll selected item into view
  const scrollSelectedItemIntoView = useCallback((index: number) => {
    if (!resultsRef.current) return;

    // Find all result buttons in the dropdown
    const resultButtons = resultsRef.current.querySelectorAll('button[data-result-index]');
    const selectedButton = resultButtons[index] as HTMLElement;

    if (selectedButton) {
      selectedButton.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showResults || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        const newIndexDown = selectedIndex < results.length - 1 ? selectedIndex + 1 : selectedIndex;
        setSelectedIndex(newIndexDown);
        // Scroll the selected item into view
        setTimeout(() => scrollSelectedItemIntoView(newIndexDown), 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        const newIndexUp = selectedIndex > 0 ? selectedIndex - 1 : -1;
        setSelectedIndex(newIndexUp);
        if (newIndexUp >= 0) {
          setTimeout(() => scrollSelectedItemIntoView(newIndexUp), 0);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleResultClick(results[selectedIndex]);
        } else if (query.trim()) {
          navigate(`/search?q=${encodeURIComponent(query)}`);
          setShowResults(false);
        }
        break;
      case 'Escape':
        setShowResults(false);
        setSelectedIndex(-1);
        break;
    }
  }, [showResults, results, selectedIndex, query, navigate, handleResultClick, scrollSelectedItemIntoView]);

  // Get icon for result type
  const getResultIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'song':
        return MusicalNoteIcon;
      case 'artist':
        return UserIcon;
      case 'album':
        return RectangleStackIcon;
      case 'playlist':
        return QueueListIcon;
      case 'user':
        return UserIcon;
    }
  };

  // Get type label
  const getTypeLabel = (type: SearchResult['type']) => {
    switch (type) {
      case 'song':
        return 'Song';
      case 'artist':
        return 'Artist';
      case 'album':
        return 'Album';
      case 'playlist':
        return 'Playlist';
      case 'user':
        return 'User';
    }
  };

  return (
    <div ref={searchContainerRef} className="relative w-full">
      {/* Search Input */}
      <div className="relative group">
        <MagnifyingGlassIcon className="absolute left-2 sm:left-2.5 md:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-focus-within:text-primary transition-colors" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => {
            if (query.trim()) setShowResults(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search..."
          className={clsx(
            'w-full pl-7 pr-7 py-1.5 sm:py-2 sm:pl-9 sm:pr-9 md:py-2.5 md:pl-10 md:pr-10 bg-gray-800/80 border border-gray-700 rounded-full',
            'text-white placeholder-gray-400 text-xs sm:text-sm',
            'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary',
            'transition-all duration-200',
            'hover:bg-gray-800'
          )}
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              setShowResults(false);
              inputRef.current?.focus();
            }}
            className="absolute right-2 sm:right-2.5 md:right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        )}
      </div>

      {/* Search Results Dropdown - rendered via portal for proper backdrop blur */}
      {showResults && dropdownPosition && (query.trim() || isLoading) && createPortal(
        <div
          ref={resultsRef}
          className="fixed bg-gray-800/80 backdrop-blur-md border border-gray-700/50 rounded-xl shadow-2xl overflow-hidden z-[100] animate-fade-in"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            maxHeight: '400px'
          }}
        >
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8 space-x-3">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-400 text-sm">Searching...</span>
            </div>
          )}

          {/* No Results */}
          {!isLoading && query.trim() && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <MagnifyingGlassIcon className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">No results found for "{query}"</p>
              <p className="text-xs mt-1">Try different keywords</p>
            </div>
          )}

          {/* Results List */}
          {!isLoading && results.length > 0 && (
            <>
              {/* Recent Searches / Quick Actions */}
              {query.length === 0 && (
                <div className="p-2 border-b border-gray-700">
                  <button
                    onClick={() => navigate('/search')}
                    className="w-full flex items-center space-x-3 px-3 py-2 text-left text-gray-300 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
                  >
                    <ClockIcon className="w-5 h-5" />
                    <span className="text-sm">Advanced Search</span>
                  </button>
                </div>
              )}

              {/* Search Results */}
              <div className="max-h-96 overflow-y-auto scrollbar-hide">
                {results.map((result, index) => {
                  const Icon = getResultIcon(result.type);
                  const isSelected = selectedIndex === index;

                  return (
                    <button
                      key={`${result.type}-${result.id}`}
                      data-result-index={index}
                      onClick={() => handleResultClick(result)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={clsx(
                        'w-full flex items-center space-x-3 px-4 py-3 text-left transition-colors',
                        'hover:bg-gray-700/50',
                        isSelected && 'bg-gray-700/70',
                        index === 0 && 'border-t-0'
                      )}
                    >
                      {/* Icon or Artwork */}
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-700 flex-shrink-0 flex items-center justify-center">
                        {result.artwork ? (
                          <img
                            src={apiService.getArtworkUrl(result.artwork)}
                            alt={result.title}
                            className="w-full h-full object-cover"
                          />
                        ) : result.imageUrl ? (
                          <img
                            src={apiService.getArtistImageUrl(result.imageUrl)}
                            alt={result.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Icon className="w-6 h-6 text-gray-400" />
                        )}
                      </div>

                      {/* Result Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-white font-medium text-sm truncate">{result.title}</p>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
                            {getTypeLabel(result.type)}
                          </span>
                        </div>
                        {result.subtitle && (
                          <p className="text-gray-400 text-xs truncate">{result.subtitle}</p>
                        )}
                      </div>

                      {/* Action Icon */}
                      <div className="flex-shrink-0">
                        {result.type === 'song' ? (
                          <PlayIcon className="w-4 h-4 text-primary" />
                        ) : (
                          <Icon className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </button>
                  );
                })}

                {/* View All Results Link */}
                <button
                  onClick={() => {
                    navigate(`/search?q=${encodeURIComponent(query)}`);
                    setShowResults(false);
                  }}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 text-left text-primary hover:text-white hover:bg-gray-700/50 transition-colors border-t border-gray-700/50"
                >
                  <MagnifyingGlassIcon className="w-4 h-4" />
                  <span className="text-sm font-medium">View all results for "{query}"</span>
                </button>
              </div>
            </>
          )}
        </div>
      , document.body)}
    </div>
  );
};

export default GlobalSearchBar;

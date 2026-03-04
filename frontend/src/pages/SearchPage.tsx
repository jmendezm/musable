import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MagnifyingGlassIcon, PlayIcon, MusicalNoteIcon, UserIcon, RectangleStackIcon } from '@heroicons/react/24/outline';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { useRoomStore } from '../stores/roomStore';
import { handleRoomAwarePlayback } from '../utils/roomPlayback';
import { useContextMenu } from '../hooks/useContextMenu';
import ContextMenu from '../components/ContextMenu';
import { useToast } from '../contexts/ToastContext';
import { copyToClipboard } from '../utils/clipboard';
import EditSongModal from '../components/EditSongModal';
import AddToPlaylistModal from '../components/AddToPlaylistModal';
import { apiService } from '../services/api';
import { searchExtensionManager, SearchResultItem } from '../services/searchExtensions';
import { Song, Artist, Album, User, Playlist } from '../types';
import { useDebounce } from 'use-debounce';
import clsx from 'clsx';

interface SearchResults {
  songs: Song[];
  artists: Artist[];
  albums: Album[];
  users: User[];
  playlists: Playlist[];
  extensionResults: Map<string, SearchResultItem[]>;
}

const SearchPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { play, setQueue, addToQueue } = usePlayerStore();
  const { user } = useAuthStore();
  const roomStore = useRoomStore();
  const { showSuccess, showError } = useToast();
  const {
    contextMenu,
    closeContextMenu,
    handleContextMenu,
    handleTouchStart,
    handleTouchEnd,
    handleTouchMove,
    handleClick
  } = useContextMenu();

  // Initialize state from URL params
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'songs' | 'artists' | 'albums' | 'playlists'>(
    (searchParams.get('category') as 'all' | 'songs' | 'artists' | 'albums' | 'playlists') || 'all'
  );

  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [results, setResults] = useState<SearchResults>({
    songs: [],
    artists: [],
    albums: [],
    users: [],
    playlists: [],
    extensionResults: new Map()
  });
  const [isLocalLoading, setIsLocalLoading] = useState(false);
  const [isLoadingExtensions, setIsLoadingExtensions] = useState(false);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [addToPlaylistModalOpen, setAddToPlaylistModalOpen] = useState(false);
  const [selectedSongForPlaylist, setSelectedSongForPlaylist] = useState<Song | null>(null);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults({
        songs: [],
        artists: [],
        albums: [],
        users: [],
        playlists: [],
        extensionResults: new Map()
      });
      return;
    }

    console.log('[SearchPage] 🔍 Performing search for:', query);

    // Clear extension results and set loading state immediately
    setResults(prev => ({
      ...prev,
      extensionResults: new Map()
    }));
    setIsLoadingExtensions(true);

    // Load local results first (fast)
    setIsLocalLoading(true);
    try {
      const [songsRes, artistsRes, albumsRes, usersRes, playlistsRes] = await Promise.all([
        apiService.getSongs({ search: query, limit: 20 }),
        apiService.getArtists(query),
        apiService.getAlbums({ search: query }),
        apiService.searchUsers(query),
        apiService.searchPlaylists(query)
      ]);

      setResults(prev => ({
        ...prev,
        songs: songsRes.data.songs || [],
        artists: artistsRes.data.artists || [],
        albums: albumsRes.data.albums || [],
        users: usersRes.data.users || [],
        playlists: playlistsRes.data.playlists || []
      }));
    } catch (error) {
      console.error('[SearchPage] ❌ Local search error:', error);
      setResults(prev => ({
        ...prev,
        songs: [],
        artists: [],
        albums: [],
        users: [],
        playlists: []
      }));
    }
    setIsLocalLoading(false);

    // Load extension results independently (can be slow)
    try {
      const extensionResults = await searchExtensionManager.searchAll(query);

      console.log('[SearchPage] 📦 Extension results:', extensionResults);
      console.log('[SearchPage] 📊 Extension results entries:', Array.from(extensionResults.entries()));

      setResults(prev => ({
        ...prev,
        extensionResults
      }));
    } catch (error) {
      console.error('[SearchPage] ❌ Extension search error:', error);
      setResults(prev => ({
        ...prev,
        extensionResults: new Map()
      }));
    }
    setIsLoadingExtensions(false);
  }, []);

  useEffect(() => {
    performSearch(debouncedQuery);
  }, [debouncedQuery, performSearch]);

  useEffect(() => {
    // Update URL params when search query or category changes
    if (debouncedQuery) {
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.set('q', debouncedQuery);
        if (selectedCategory !== 'all') {
          newParams.set('category', selectedCategory);
        } else {
          newParams.delete('category');
        }
        return newParams;
      });
    } else {
      // Clear URL params when search is empty
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.delete('q');
        newParams.delete('category');
        return newParams;
      });
    }
  }, [debouncedQuery, selectedCategory]);

  const handlePlaySong = (song: Song, songList: Song[] = [song]) => {
    handleRoomAwarePlayback(song, songList);
  };

  const handleAlbumClick = (albumId: number) => {
    navigate(`/album/${albumId}`);
  };

  const handleArtistClick = (artistId: number) => {
    navigate(`/artist/${artistId}`);
  };

  // Favorites functionality
  const fetchUserFavorites = useCallback(async () => {
    try {
      const response: any = await apiService.getFavorites();
      const favoriteIds = new Set(response.data?.songs?.map((song: Song) => song.id) || []);
      setFavorites(favoriteIds as Set<number>);
    } catch (error) {
      console.error('Error fetching favorites:', error);
    }
  }, []);

  const toggleFavorite = async (songId: number) => {
    try {
      await apiService.toggleFavorite(songId);
      setFavorites(prev => {
        const newFavorites = new Set(prev);
        if (newFavorites.has(songId)) {
          newFavorites.delete(songId);
        } else {
          newFavorites.add(songId);
        }
        return newFavorites;
      });
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  // Context menu handlers
  const handleContextMenuPlay = (song: Song) => {
    handlePlaySong(song, filteredResults.songs);
  };

  const handleContextMenuAddToQueue = (song: Song) => {
    addToQueue(song);
  };

  const handleContextMenuAddToPlaylist = (song: Song) => {
    console.log('Add to playlist:', song.title);
    setSelectedSongForPlaylist(song);
    setAddToPlaylistModalOpen(true);
    closeContextMenu();
  };

  const handleContextMenuToggleFavorite = (song: Song) => {
    toggleFavorite(song.id);
  };

  const handleContextMenuShare = async (song: Song) => {
    try {
      const response = await apiService.createShareToken(song.id);
      const shareUrl = response.data.shareUrl;

      await copyToClipboard(shareUrl);
      showSuccess('Share URL copied to clipboard!');
    } catch (err) {
      console.error('Failed to create share URL:', err);
      showError('Failed to copy share URL. Please try again.');
    }
  };

  const handleContextMenuEdit = (song: Song) => {
    setEditingSong(song);
    setEditModalOpen(true);
    closeContextMenu();
  };

  const handleContextMenuDelete = (song: Song) => {
    console.log('Delete song:', song.title);
    // TODO: Implement delete song functionality with confirmation
  };

  // Fetch favorites on component mount
  useEffect(() => {
    fetchUserFavorites();
  }, [fetchUserFavorites]);

  // Edit modal handlers
  const handleCloseEditModal = () => {
    setEditModalOpen(false);
    setEditingSong(null);
  };

  // Add to playlist modal handlers
  const handleCloseAddToPlaylistModal = () => {
    setAddToPlaylistModalOpen(false);
    setSelectedSongForPlaylist(null);
  };

  const handleSongUpdated = (updatedSong: Song) => {
    // Update the song in search results
    setResults(prev => ({
      ...prev,
      songs: prev.songs.map(song => 
        song.id === updatedSong.id ? updatedSong : song
      )
    }));
  };

  const filteredResults = {
    songs: selectedCategory === 'all' || selectedCategory === 'songs' ? results.songs : [],
    artists: selectedCategory === 'all' || selectedCategory === 'artists' ? results.artists : [],
    albums: selectedCategory === 'all' || selectedCategory === 'albums' ? results.albums : [],
    playlists: selectedCategory === 'all' || selectedCategory === 'playlists' ? results.playlists : []
  };

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Search</h1>
        <p className="text-gray-400">Find your favorite music</p>
      </div>
      
      {/* Search Input */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search for songs, artists, albums, or playlists..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 md:py-4 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
        />
      </div>

      {/* Category Filters */}
      <div className="flex gap-2 md:gap-4 overflow-x-auto pb-2">
        {[
          { key: 'all', label: 'All', icon: MagnifyingGlassIcon },
          { key: 'songs', label: 'Songs', icon: MusicalNoteIcon },
          { key: 'playlists', label: 'Playlists', icon: MusicalNoteIcon },
          { key: 'albums', label: 'Albums', icon: RectangleStackIcon },
          { key: 'artists', label: 'Artists', icon: UserIcon }
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => {
              const newCategory = key as 'all' | 'songs' | 'artists' | 'albums' | 'playlists';
              setSelectedCategory(newCategory);

              // Update URL params immediately when category changes
              setSearchParams(prev => {
                const newParams = new URLSearchParams(prev);
                if (searchQuery) {
                  newParams.set('q', searchQuery);
                }
                if (newCategory !== 'all') {
                  newParams.set('category', newCategory);
                } else {
                  newParams.delete('category');
                }
                return newParams;
              });
            }}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-full transition-all whitespace-nowrap',
              selectedCategory === key
                ? 'bg-primary text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>

      {/* Loading State */}
      {isLocalLoading && (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Search Results */}
      {!isLocalLoading && searchQuery && (
        <div className="space-y-6 md:space-y-8">
          {/* Playlists Section */}
          {filteredResults.playlists.length > 0 && (selectedCategory === 'all' || selectedCategory === 'playlists') && (
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <MusicalNoteIcon className="w-6 h-6" />
                Playlists ({filteredResults.playlists.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredResults.playlists.map((playlist) => (
                  <div
                    key={playlist.id}
                    className="bg-gray-800/50 p-4 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/playlist/${playlist.id}`)}
                  >
                    <div className="relative w-full rounded-lg overflow-hidden bg-gray-700 mb-3" style={{ paddingBottom: '100%' }}>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <MusicalNoteIcon className="w-12 h-12 text-gray-400" />
                      </div>
                    </div>
                    <h3 className="text-white font-medium truncate">{playlist.name}</h3>
                    <p className="text-gray-400 text-sm truncate">{playlist.username}</p>
                    <p className="text-gray-500 text-xs">{playlist.song_count || 0} songs</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Albums and Artists - Responsive shared space */}
          {(filteredResults.albums.length > 0 || filteredResults.artists.length > 0) && selectedCategory === 'all' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              {/* Albums */}
              {filteredResults.albums.length > 0 && (
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-white mb-4 flex items-center gap-2">
                    <RectangleStackIcon className="w-6 h-6" />
                    Albums ({filteredResults.albums.length})
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filteredResults.albums.slice(0, 8).map((album) => (
                      <div
                        key={album.id}
                        className="bg-gray-800/50 p-3 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer group"
                        onClick={() => handleAlbumClick(album.id)}
                      >
                        <div className="relative w-full rounded-lg overflow-hidden bg-gray-700 mb-2" style={{ paddingBottom: '100%' }}>
                          <div className="absolute inset-0 flex items-center justify-center">
                            {album.artwork_path ? (
                              <img
                                src={apiService.getArtworkUrl(album.artwork_path)}
                                alt={album.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <MusicalNoteIcon className="w-8 h-8 text-gray-400" />
                            )}
                          </div>
                        </div>
                        <h3 className="text-white text-sm font-medium truncate">{album.title}</h3>
                        <p className="text-gray-400 text-xs truncate">{album.artist_name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Artists */}
              {filteredResults.artists.length > 0 && (
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-white mb-4 flex items-center gap-2">
                    <UserIcon className="w-6 h-6" />
                    Artists ({filteredResults.artists.length})
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filteredResults.artists.slice(0, 8).map((artist) => (
                      <div
                        key={artist.id}
                        className="bg-gray-800/50 p-3 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer group"
                        onClick={() => handleArtistClick(artist.id)}
                      >
                        <div className="relative w-full rounded-lg overflow-hidden bg-gray-700 mb-2" style={{ paddingBottom: '100%' }}>
                          <div className="absolute inset-0 flex items-center justify-center">
                            {artist.image_path ? (
                              <img
                                src={apiService.getArtistImageUrl(artist.image_path)}
                                alt={artist.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  console.error('Failed to load artist image:', artist.image_path);
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <UserIcon className="w-8 h-8 text-gray-400" />
                            )}
                          </div>
                        </div>
                        <h3 className="text-white text-sm font-medium truncate">{artist.name}</h3>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Songs Section */}
          {filteredResults.songs.length > 0 && (selectedCategory === 'all' || selectedCategory === 'songs') && (
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <MusicalNoteIcon className="w-6 h-6" />
                Songs ({filteredResults.songs.length})
              </h2>
              <div className="space-y-2">
                {filteredResults.songs.map((song) => (
                  <div
                    key={song.id}
                    data-song-context-menu
                    className="flex items-center p-3 md:p-4 bg-gray-800/50 rounded-lg hover:bg-gray-700 transition-colors group cursor-pointer select-none"
                    onClick={(e) => handleClick(e, () => handlePlaySong(song, filteredResults.songs))}
                    onContextMenu={(e) => handleContextMenu(e, song)}
                    onTouchStart={(e) => handleTouchStart(e, song)}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchMove}
                  >
                    {/* Artwork */}
                    <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden bg-gray-700 flex-shrink-0">
                      {song.artwork_path ? (
                        <img
                          src={apiService.getArtworkUrl(song.artwork_path)}
                          alt={song.album_title || 'Album artwork'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <MusicalNoteIcon className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center">
                        <PlayIcon className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>

                    {/* Song Info */}
                    <div className="flex-1 min-w-0 ml-3 md:ml-4">
                      <h3 className="text-white font-medium truncate">{song.title}</h3>
                      <p className="text-gray-400 text-sm truncate">
                        {song.artist_name} {song.album_title && `• ${song.album_title}`}
                      </p>
                    </div>

                    {/* Duration */}
                    <div className="text-gray-400 text-sm ml-2">
                      {song.duration ? `${Math.floor(song.duration / 60)}:${(song.duration % 60).toString().padStart(2, '0')}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Albums Section - Show when filtering specifically for albums */}
          {filteredResults.albums.length > 0 && selectedCategory === 'albums' && (
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <RectangleStackIcon className="w-6 h-6" />
                Albums ({filteredResults.albums.length})
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {filteredResults.albums.map((album) => (
                  <div
                    key={album.id}
                    className="bg-gray-800/50 p-4 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer group"
                    onClick={() => handleAlbumClick(album.id)}
                  >
                    <div className="relative w-full rounded-lg overflow-hidden bg-gray-700 mb-3" style={{ paddingBottom: '100%' }}>
                      <div className="absolute inset-0 flex items-center justify-center">
                        {album.artwork_path ? (
                          <img
                            src={apiService.getArtworkUrl(album.artwork_path)}
                            alt={album.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <MusicalNoteIcon className="w-8 h-8 text-gray-400" />
                        )}
                      </div>
                    </div>
                    <h3 className="text-white font-medium truncate">{album.title}</h3>
                    <p className="text-gray-400 text-sm truncate">{album.artist_name}</p>
                    {album.release_year && (
                      <p className="text-gray-500 text-xs">{album.release_year}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Artists Section - Show when filtering specifically for artists */}
          {filteredResults.artists.length > 0 && selectedCategory === 'artists' && (
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-white mb-4 flex items-center gap-2">
                <UserIcon className="w-6 h-6" />
                Artists ({filteredResults.artists.length})
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {filteredResults.artists.map((artist) => (
                  <div
                    key={artist.id}
                    className="bg-gray-800/50 p-4 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer group"
                    onClick={() => handleArtistClick(artist.id)}
                  >
                    <div className="relative w-full rounded-lg overflow-hidden bg-gray-700 mb-3" style={{ paddingBottom: '100%' }}>
                      <div className="absolute inset-0 flex items-center justify-center">
                        {artist.image_path ? (
                          <img
                            src={apiService.getArtistImageUrl(artist.image_path)}
                            alt={artist.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              console.error('Failed to load artist image:', artist.image_path);
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <UserIcon className="w-8 h-8 text-gray-400" />
                        )}
                      </div>
                    </div>
                    <h3 className="text-white font-medium truncate">{artist.name}</h3>
                    <p className="text-gray-400 text-sm">
                      {artist.song_count || 0} songs
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extension Results (Plugin songs) */}
          {selectedCategory === 'all' && (
            <>
              {/* Show loading state for extensions while they fetch */}
              {isLoadingExtensions && results.extensionResults.size === 0 && (
                <div className="flex flex-col items-center justify-center py-8 space-y-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {/* Show extension results when loaded */}
              {Array.from(results.extensionResults.entries()).map(([extensionId, extensionItems]) => {
                if (extensionItems.length === 0) return null;

                const extension = searchExtensionManager.getExtension(extensionId);
                if (!extension) return null;

                const ExtensionComponent = extension.renderComponent;
                if (!ExtensionComponent) return null;

                return (
                  <div key={extensionId}>
                    <ExtensionComponent
                      results={extensionItems}
                      apiService={apiService}
                      onToast={(type: 'success' | 'error', message: string) => {
                        if (type === 'success') {
                          showSuccess(message);
                        } else {
                          showError(message);
                        }
                      }}
                      onDownloadComplete={() => {
                        performSearch(debouncedQuery);
                      }}
                    />
                  </div>
                );
              })}
            </>
          )}

        </div>
      )}

      {/* No Results */}
      {!isLocalLoading && !isLoadingExtensions && searchQuery && filteredResults.songs.length === 0 && filteredResults.artists.length === 0 && filteredResults.albums.length === 0 && filteredResults.playlists.length === 0 && Array.from(results.extensionResults.values()).every(results => results.length === 0) && (
        <div className="text-center py-12">
          <MagnifyingGlassIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No results found</h3>
          <p className="text-gray-400">Try searching with different keywords</p>
        </div>
      )}

      {/* Empty State */}
      {!searchQuery && (
        <div className="text-center py-12">
          <MagnifyingGlassIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Start searching</h3>
          <p className="text-gray-400">Enter a song, artist, album, or playlist name above</p>
        </div>
      )}

      {/* Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={closeContextMenu}
        song={contextMenu.song}
        isAdmin={Boolean(user?.is_admin)}
        isFavorited={contextMenu.song ? favorites.has(contextMenu.song.id) : false}
        onPlay={handleContextMenuPlay}
        onAddToQueue={handleContextMenuAddToQueue}
        onAddToPlaylist={handleContextMenuAddToPlaylist}
        onToggleFavorite={handleContextMenuToggleFavorite}
        onShare={handleContextMenuShare}
        onEdit={user?.is_admin ? handleContextMenuEdit : undefined}
        onDelete={user?.is_admin ? handleContextMenuDelete : undefined}
      />

      {/* Edit Song Modal */}
      <EditSongModal
        isOpen={editModalOpen}
        onClose={handleCloseEditModal}
        song={editingSong}
        onSongUpdated={handleSongUpdated}
      />

      {/* Add to Playlist Modal */}
      <AddToPlaylistModal
        isOpen={addToPlaylistModalOpen}
        onClose={handleCloseAddToPlaylistModal}
        song={selectedSongForPlaylist}
      />
    </div>
  );
};

export default SearchPage;
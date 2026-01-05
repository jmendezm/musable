import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PlayIcon, MusicalNoteIcon, ClockIcon, CalendarIcon, HeartIcon, ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { PlayIcon as PlayIconSolid, PauseIcon, HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';
import { usePlayerStore } from '../stores/playerStore';
import { useFollowedAlbumsStore } from '../stores/followedAlbumsStore';
import { useRoomStore } from '../stores/roomStore';
import { handleRoomAwarePlayback } from '../utils/roomPlayback';
import { useToast } from '../contexts/ToastContext';
import { apiService } from '../services/api';
import { Album, Song } from '../types';
import clsx from 'clsx';
import SongMenuBottomSheet from '../components/SongMenuBottomSheet';

const AlbumPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { play, setQueue, addToQueue, currentSong, isPlaying } = usePlayerStore();
  const { isFollowing, toggleFollow, loadFollowedAlbums } = useFollowedAlbumsStore();
  const roomStore = useRoomStore();
  const { showSuccess } = useToast();
  const [album, setAlbum] = useState<Album | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllArtists, setShowAllArtists] = useState(false);
  const [selectedSongForMenu, setSelectedSongForMenu] = useState<Song | null>(null);
  const [showSongMenu, setShowSongMenu] = useState(false);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!id) {
      navigate('/');
      return;
    }

    const fetchAlbum = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await apiService.getAlbum(Number(id));

        if (response.success) {
          setAlbum(response.data.album);
          setSongs(response.data.songs);
        } else {
          setError('Failed to load album');
        }
      } catch (error) {
        console.error('Error fetching album:', error);
        setError('Failed to load album');
      } finally {
        setIsLoading(false);
      }
    };

    const fetchFavorites = async () => {
      try {
        const response = await apiService.getFavorites();
        const favoriteIds = new Set(response.data?.songs?.map((song: Song) => song.id) || []);
        setFavorites(favoriteIds);
      } catch (error) {
        console.error('Error fetching favorites:', error);
      }
    };

    fetchAlbum();
    fetchFavorites();
    loadFollowedAlbums();
  }, [id, navigate, loadFollowedAlbums]);

  const handlePlayAlbum = () => {
    if (songs.length > 0) {
      handleRoomAwarePlayback(songs[0], songs);
    }
  };

  const handlePlaySong = (song: Song, index: number) => {
    handleRoomAwarePlayback(song, songs);
  };

  const handleToggleFollow = async () => {
    if (album) {
      try {
        const isNowFollowing = await toggleFollow(album);
        showSuccess(isNowFollowing ? 'Album followed!' : 'Album unfollowed!');
      } catch (error) {
        console.error('Failed to toggle album follow:', error);
      }
    }
  };

  const handleMenuAction = (song: Song) => {
    setSelectedSongForMenu(song);
    setShowSongMenu(true);
  };

  const handleToggleFavorite = async (song: Song) => {
    try {
      await apiService.toggleFavorite(song.id);
      setFavorites(prev => {
        const newFavorites = new Set(prev);
        if (newFavorites.has(song.id)) {
          newFavorites.delete(song.id);
        } else {
          newFavorites.add(song.id);
        }
        return newFavorites;
      });
      showSuccess(favorites.has(song.id) ? 'Removed from favorites' : 'Added to favorites');
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const handleAddToQueue = (song: Song) => {
    addToQueue(song);
    showSuccess(`Added "${song.title}" to queue`);
  };

  const handleAddToPlaylist = (song: Song) => {
    // For now, just show a message. You can integrate with AddToPlaylistModal later
    showSuccess('Add to playlist feature coming soon!');
  };

  const formatDuration = (duration: number): string => {
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatTotalDuration = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} hr ${minutes} min`;
    }
    return `${minutes} min`;
  };

  const totalDuration = songs.reduce((acc, song) => acc + (song.duration || 0), 0);

  // Parse artists from the artist_name string (assuming comma or similar separation)
  const artists = album?.artist_name ? album.artist_name.split(',').map(a => a.trim()) : [];
  const MAX_INITIAL_ARTISTS = 3;
  const displayArtists = showAllArtists ? artists : artists.slice(0, MAX_INITIAL_ARTISTS);
  const hasMoreArtists = artists.length > MAX_INITIAL_ARTISTS;

  // Handle artist click - search for artist and navigate
  const handleArtistClick = async (artistName: string) => {
    try {
      const response = await apiService.getArtists(artistName);
      if (response.success && response.data.artists.length > 0) {
        navigate(`/artist/${response.data.artists[0].id}`);
      }
    } catch (error) {
      console.error('Failed to find artist:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="text-center py-24">
        <MusicalNoteIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">Album not found</h3>
        <p className="text-gray-400 mb-6">{error || 'The album you\'re looking for doesn\'t exist.'}</p>
        <button
          onClick={() => navigate('/search')}
          className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-secondary transition-colors"
        >
          Back to Search
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-24 md:pb-8">
      {/* Album Header */}
      <div className="px-4 md:px-0">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4 md:gap-6">
          {/* Album Info - Mobile First */}
          <div className="flex-1 text-center lg:text-left order-1 lg:order-2">
            {/* Back Button - Mobile */}
            <button
              onClick={() => navigate('/library')}
              className="lg:hidden flex items-center text-gray-400 hover:text-white mb-3"
            >
              <ArrowLeftIcon className="w-5 h-5 mr-2" />
              Back to Library
            </button>
            <p className="text-xs md:text-sm uppercase text-gray-400 tracking-wider mb-1 md:mb-2">Album</p>

            {/* Album Artwork - Mobile Only */}
            <div className="lg:hidden w-48 h-48 mx-auto mb-4">
              <div className="w-full h-full rounded-lg overflow-hidden bg-gray-800 shadow-2xl">
                {album.artwork_path ? (
                  <img
                    src={apiService.getArtworkUrl(album.artwork_path)}
                    alt={album.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <MusicalNoteIcon className="w-16 h-16 text-gray-400" />
                  </div>
                )}
              </div>
            </div>

            <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-5xl font-bold text-white mb-2 md:mb-4 leading-tight break-words">
              {album.title}
            </h1>
            <div className="mb-4 md:mb-6">
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-2 gap-y-1">
                {displayArtists.map((artist, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && <span className="text-gray-600">•</span>}
                    <button
                      onClick={() => handleArtistClick(artist)}
                      className="text-sm md:text-lg font-semibold text-gray-300 hover:text-primary transition-colors text-left"
                    >
                      {artist}
                    </button>
                  </React.Fragment>
                ))}
                {hasMoreArtists && (
                  <button
                    onClick={() => setShowAllArtists(!showAllArtists)}
                    className="flex items-center gap-1 text-sm md:text-lg text-primary hover:text-primary/80 transition-colors"
                  >
                    {showAllArtists ? (
                      <>
                        <span>Show less</span>
                        <ChevronUpIcon className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        <span>+{artists.length - MAX_INITIAL_ARTISTS} more</span>
                        <ChevronDownIcon className="w-4 h-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center lg:justify-start gap-2 md:gap-4 text-xs md:text-sm text-gray-400">
                {album.release_year && (
                  <div className="flex items-center gap-1">
                    <CalendarIcon className="w-3 h-3 md:w-4 md:h-4" />
                    <span>{album.release_year}</span>
                  </div>
                )}
                <span className="hidden sm:inline">•</span>
                <div className="flex items-center gap-1">
                  <MusicalNoteIcon className="w-3 h-3 md:w-4 md:h-4" />
                  <span>{songs.length} song{songs.length !== 1 ? 's' : ''}</span>
                </div>
                {totalDuration > 0 && (
                  <>
                    <span className="hidden sm:inline">•</span>
                    <div className="flex items-center gap-1">
                      <ClockIcon className="w-3 h-3 md:w-4 md:h-4" />
                      <span>{formatTotalDuration(totalDuration)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons - Mobile Only (show on mobile, hide on desktop) */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 lg:hidden mb-4">
              <button
                onClick={handlePlayAlbum}
                disabled={songs.length === 0}
                className={clsx(
                  'flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 rounded-full text-black font-semibold transition-all text-sm md:text-base',
                  songs.length > 0
                    ? 'bg-primary hover:bg-secondary hover:scale-105'
                    : 'bg-gray-600 cursor-not-allowed'
                )}
              >
                <PlayIconSolid className="w-4 h-4 md:w-5 md:h-5" />
                <span>Play Album</span>
              </button>

              <button
                onClick={handleToggleFollow}
                className={clsx(
                  'flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 md:py-3 rounded-full border-2 transition-all text-sm md:text-base',
                  isFollowing(album?.id || 0)
                    ? 'border-primary text-primary hover:bg-primary hover:text-black'
                    : 'border-gray-400 text-gray-400 hover:border-white hover:text-white'
                )}
                title={isFollowing(album?.id || 0) ? 'Unfollow Album' : 'Follow Album'}
              >
                {isFollowing(album?.id || 0) ? (
                  <HeartIconSolid className="w-4 h-4 md:w-5 md:h-5" />
                ) : (
                  <HeartIcon className="w-4 h-4 md:w-5 md:h-5" />
                )}
                <span className="font-medium hidden sm:inline">
                  {isFollowing(album?.id || 0) ? 'Following' : 'Follow'}
                </span>
              </button>
            </div>
          </div>

          {/* Album Artwork - Desktop Only */}
          <div className="hidden lg:block w-64 h-64 flex-shrink-0 order-1 lg:order-1">
            <div className="w-full h-full rounded-lg overflow-hidden bg-gray-800 shadow-2xl">
              {album.artwork_path ? (
                <img
                  src={apiService.getArtworkUrl(album.artwork_path)}
                  alt={album.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <MusicalNoteIcon className="w-20 h-20 text-gray-400" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Action Buttons */}
      <div className="hidden lg:flex px-4 md:px-0">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handlePlayAlbum}
            disabled={songs.length === 0}
            className={clsx(
              'flex items-center gap-2 px-6 py-3 rounded-full text-black font-semibold transition-all text-base',
              songs.length > 0
                ? 'bg-primary hover:bg-secondary hover:scale-105'
                : 'bg-gray-600 cursor-not-allowed'
            )}
          >
            <PlayIconSolid className="w-5 h-5" />
            <span>Play Album</span>
          </button>

          <button
            onClick={handleToggleFollow}
            className={clsx(
              'flex items-center gap-2 px-4 py-3 rounded-full border-2 transition-all text-base',
              isFollowing(album?.id || 0)
                ? 'border-primary text-primary hover:bg-primary hover:text-black'
                : 'border-gray-400 text-gray-400 hover:border-white hover:text-white'
            )}
            title={isFollowing(album?.id || 0) ? 'Unfollow Album' : 'Follow Album'}
          >
            {isFollowing(album?.id || 0) ? (
              <HeartIconSolid className="w-5 h-5" />
            ) : (
              <HeartIcon className="w-5 h-5" />
            )}
            <span className="font-medium">
              {isFollowing(album?.id || 0) ? 'Following' : 'Follow'}
            </span>
          </button>
        </div>
      </div>

      {/* Desktop Back Button */}
      <div className="px-4 md:px-0">
        <button
          onClick={() => navigate('/library')}
          className="hidden lg:flex items-center text-gray-400 hover:text-white"
        >
          <ArrowLeftIcon className="w-5 h-5 mr-2" />
          Back to Library
        </button>
      </div>

      {/* Songs List */}
      <div className="px-0 lg:px-4">
        {songs.length > 0 ? (
          <>
            {/* Unified List View */}
            <div className="md:bg-gray-800/80 md:rounded-lg p-0 md:p-6">
              <div className="space-y-2">
                {songs.map((song, index) => {
                  const isCurrentSong = currentSong?.id === song.id;
                  const isSongPlaying = isCurrentSong && isPlaying;

                  return (
                    <div
                      key={song.id}
                      className={clsx(
                        'flex items-center gap-3 md:gap-4 py-3 px-0 md:px-3 rounded-lg hover:bg-gray-800 transition-colors group cursor-pointer',
                        isCurrentSong && 'bg-gray-800'
                      )}
                      onClick={() => handlePlaySong(song, index)}
                    >
                      {/* Track Number / Play Button */}
                      <div className="w-8 h-8 flex items-center justify-center text-gray-400 group-hover:text-white transition-colors flex-shrink-0">
                        {isSongPlaying ? (
                          <PauseIcon className="w-4 h-4 text-primary" />
                        ) : isCurrentSong ? (
                          <PlayIcon className="w-4 h-4 text-primary" />
                        ) : (
                          <>
                            <span className="group-hover:hidden text-sm">
                              {song.track_number || index + 1}
                            </span>
                            <PlayIcon className="w-4 h-4 hidden group-hover:block" />
                          </>
                        )}
                      </div>

                      {/* Song Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className={clsx(
                          'font-medium truncate text-sm md:text-base',
                          isCurrentSong ? 'text-primary' : 'text-white'
                        )}>
                          {song.title}
                        </h3>
                        <p className="text-gray-400 text-xs md:text-sm truncate">
                          {song.artist_name}
                        </p>
                      </div>

                      {/* Duration */}
                      <div className="text-gray-400 text-xs md:text-sm flex-shrink-0">
                        {song.duration ? formatDuration(song.duration) : ''}
                      </div>

                      {/* Menu Button - Mobile Only */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMenuAction(song);
                        }}
                        className="md:hidden flex-shrink-0 p-2 text-gray-400 hover:text-white transition-colors"
                      >
                        <EllipsisHorizontalIcon className="w-6 h-6" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8 md:py-12 bg-gray-800 rounded-lg">
            <MusicalNoteIcon className="w-12 h-12 md:w-16 md:h-16 text-gray-600 mx-auto mb-3 md:mb-4" />
            <h3 className="text-lg md:text-xl font-semibold text-white mb-2">No songs found</h3>
            <p className="text-gray-400 text-sm md:text-base">This album doesn't have any songs.</p>
          </div>
        )}
      </div>

      {/* Mobile Song Menu Bottom Sheet */}
      <SongMenuBottomSheet
        isOpen={showSongMenu}
        song={selectedSongForMenu}
        onClose={() => setShowSongMenu(false)}
        favorites={favorites}
        onToggleFavorite={handleToggleFavorite}
        onAddToQueue={handleAddToQueue}
        onAddToPlaylist={handleAddToPlaylist}
        showSuccess={showSuccess}
        showError={(msg) => console.error(msg)}
      />
    </div>
  );
};

export default AlbumPage;
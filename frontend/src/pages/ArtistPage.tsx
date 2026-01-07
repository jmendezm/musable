import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PlayIcon, MusicalNoteIcon, ClockIcon, UserIcon, RectangleStackIcon, HeartIcon, ChevronDownIcon, ChevronUpIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { PlayIcon as PlayIconSolid, PauseIcon, HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { useRoomStore } from '../stores/roomStore';
import { handleRoomAwarePlayback } from '../utils/roomPlayback';
import { useToast } from '../contexts/ToastContext';
import { useContextMenu } from '../hooks/useContextMenu';
import { apiService } from '../services/api';
import { Artist, Song, Album } from '../types';
import clsx from 'clsx';
import { getBackendUrl } from '../config/config';
import ContextMenu from '../components/ContextMenu';
import SongMenuBottomSheet from '../components/SongMenuBottomSheet';
import { copyToClipboard } from '../utils/clipboard';
import EditSongModal from '../components/EditSongModal';
import AddToPlaylistModal from '../components/AddToPlaylistModal';

const ArtistPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { play, setQueue, addToQueue, currentSong, isPlaying } = usePlayerStore();
  const roomStore = useRoomStore();
  const { user } = useAuthStore();
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
  const [artist, setArtist] = useState<Artist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [selectedSongForMenu, setSelectedSongForMenu] = useState<Song | null>(null);
  const [showSongMenu, setShowSongMenu] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addToPlaylistModalOpen, setAddToPlaylistModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'songs' | 'albums'>(() => {
    // Restore tab state from sessionStorage on component mount
    if (id) {
      const savedTab = sessionStorage.getItem(`artist-tab-${id}`);
      if (savedTab === 'songs' || savedTab === 'albums') {
        return savedTab;
      }
    }
    return 'songs';
  });

  // Save tab state to sessionStorage whenever it changes
  useEffect(() => {
    if (id) {
      sessionStorage.setItem(`artist-tab-${id}`, activeTab);
    }
  }, [activeTab, id]);

  useEffect(() => {
    if (!id) {
      navigate('/');
      return;
    }

    const fetchArtist = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await apiService.getArtist(Number(id));

        if (response.success) {
          setArtist(response.data.artist);
          setSongs(response.data.songs);
          setAlbums(response.data.albums);
        } else {
          setError('Failed to load artist');
        }
      } catch (error) {
        console.error('Error fetching artist:', error);
        setError('Failed to load artist');
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

    fetchArtist();
    fetchFavorites();
  }, [id, navigate]);

  const handlePlayAllSongs = () => {
    if (songs.length > 0) {
      handleRoomAwarePlayback(songs[0], songs);
    }
  };

  const handleMenuAction = (song: Song) => {
    setSelectedSongForMenu(song);
    setShowSongMenu(true);
  };

  const handlePlaySong = (song: Song, index: number) => {
    handleRoomAwarePlayback(song, songs);
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
    setSelectedSongForMenu(song);
    setAddToPlaylistModalOpen(true);
  };

  // Context menu handlers
  const handleContextMenuPlay = (song: Song) => {
    handlePlaySong(song, songs.indexOf(song));
  };

  const handleContextMenuAddToQueue = (song: Song) => {
    addToQueue(song);
    showSuccess(`Added "${song.title}" to queue`);
  };

  const handleContextMenuAddToPlaylist = (song: Song) => {
    setSelectedSongForMenu(song);
    setAddToPlaylistModalOpen(true);
    closeContextMenu();
  };

  const handleContextMenuToggleFavorite = async (song: Song) => {
    await handleToggleFavorite(song);
  };

  const handleContextMenuShare = async (song: Song) => {
    try {
      const response = await apiService.createShareToken(song.id);
      const shareUrl = response.data.shareUrl;

      await copyToClipboard(shareUrl);
      showSuccess('Share link copied to clipboard!');
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !artist) {
    return (
      <div className="text-center py-24">
        <UserIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">Artist not found</h3>
        <p className="text-gray-400 mb-6">{error || 'The artist you\'re looking for doesn\'t exist.'}</p>
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
    <div className="space-y-6 md:space-y-8">
      {/* Artist Header */}
      <div className="flex flex-col md:flex-row gap-6 md:gap-8">
        {/* Artist Image */}
        <div className="w-48 h-48 md:w-64 md:h-64 mx-auto md:mx-0 flex-shrink-0">
          <div className="w-full h-full rounded-full overflow-hidden bg-gray-800 shadow-2xl">
            {artist.image_path ? (
              <img
                src={`${getBackendUrl()}/${artist.image_path}`}
                alt={artist.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <UserIcon className="w-16 h-16 md:w-20 md:h-20 text-gray-400" />
              </div>
            )}
          </div>
        </div>

        {/* Artist Info */}
        <div className="flex-1 text-center md:text-left">
          <p className="text-sm uppercase text-gray-400 tracking-wider mb-2">Artist</p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            {artist.name}
          </h1>
          <div className="flex flex-col md:flex-row items-center md:items-start gap-2 md:gap-4 text-gray-300 mb-6">
            <div className="flex items-center gap-1">
              <MusicalNoteIcon className="w-4 h-4" />
              <span>{songs.length} song{songs.length !== 1 ? 's' : ''}</span>
            </div>
            {albums.length > 0 && (
              <>
                <span className="hidden md:block">•</span>
                <div className="flex items-center gap-1">
                  <RectangleStackIcon className="w-4 h-4" />
                  <span>{albums.length} album{albums.length !== 1 ? 's' : ''}</span>
                </div>
              </>
            )}
            {totalDuration > 0 && (
              <>
                <span className="hidden md:block">•</span>
                <div className="flex items-center gap-1">
                  <ClockIcon className="w-4 h-4" />
                  <span>{formatTotalDuration(totalDuration)}</span>
                </div>
              </>
            )}
          </div>

          {/* Play Button */}
          <button
            onClick={handlePlayAllSongs}
            disabled={songs.length === 0}
            className={clsx(
              'flex items-center gap-2 px-8 py-3 rounded-full text-black font-semibold transition-all',
              songs.length > 0
                ? 'bg-primary hover:bg-secondary hover:scale-105'
                : 'bg-gray-600 cursor-not-allowed'
            )}
          >
            <PlayIconSolid className="w-5 h-5" />
            <span>Play All</span>
          </button>
        </div>
      </div>

      {/* Content Tabs */}
      <div className="border-b border-gray-800">
        <nav className="-mb-px flex gap-8">
          <button
            onClick={() => setActiveTab('songs')}
            className={clsx(
              'py-2 px-1 border-b-2 font-medium text-sm transition-colors',
              activeTab === 'songs'
                ? 'border-primary text-white'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
            )}
          >
            Songs ({songs.length})
          </button>
          {albums.length > 0 && (
            <button
              onClick={() => setActiveTab('albums')}
              className={clsx(
                'py-2 px-1 border-b-2 font-medium text-sm transition-colors',
                activeTab === 'albums'
                  ? 'border-primary text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
              )}
            >
              Albums ({albums.length})
            </button>
          )}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'songs' && (
        <div className="px-0 lg:px-4">
          {songs.length > 0 ? (
            <div className="md:bg-gray-800/80 md:rounded-lg p-0 md:p-6">
              <div className="space-y-2">
                {songs.map((song, index) => {
                  const isCurrentSong = currentSong?.id === song.id;
                  const isSongPlaying = isCurrentSong && isPlaying;

                  return (
                    <div
                      key={song.id}
                      data-song-context-menu
                      className={clsx(
                        'flex items-center gap-3 md:gap-4 py-3 px-0 md:px-3 rounded-lg hover:bg-gray-800 transition-all duration-300 group cursor-pointer select-none',
                        isCurrentSong && 'bg-gray-800'
                      )}
                      onClick={(e) => handleClick(e, () => handlePlaySong(song, index))}
                      onContextMenu={(e) => handleContextMenu(e, song)}
                      onTouchStart={(e) => handleTouchStart(e, song)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={handleTouchMove}
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
                              {index + 1}
                            </span>
                            <PlayIcon className="w-4 h-4 hidden group-hover:block" />
                          </>
                        )}
                      </div>

                      {/* Song Artwork */}
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-700 flex-shrink-0">
                        {song.artwork_path ? (
                          <img
                            src={apiService.getArtworkUrl(song.artwork_path)}
                            alt={song.album_title || 'Album artwork'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <MusicalNoteIcon className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                      </div>

                      {/* Song Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className={clsx(
                          'font-medium truncate',
                          isCurrentSong ? 'text-primary' : 'text-white'
                        )}>
                          {song.title}
                        </h3>
                        {song.album_title && (
                          <p className="text-gray-400 text-sm truncate">
                            {song.album_title}
                          </p>
                        )}
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
          ) : (
            <div className="text-center py-12">
              <MusicalNoteIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No songs found</h3>
              <p className="text-gray-400">This artist doesn't have any songs.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'albums' && albums.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {albums.map((album) => (
            <div
              key={album.id}
              className="bg-gray-800/50 p-4 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer group"
              onClick={() => navigate(`/album/${album.id}`)}
            >
              <div className="w-full aspect-square rounded-lg overflow-hidden bg-gray-700 mb-3">
                {album.artwork_path ? (
                  <img
                    src={apiService.getArtworkUrl(album.artwork_path)}
                    alt={album.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <MusicalNoteIcon className="w-8 h-8 text-gray-400" />
                  </div>
                )}
              </div>
              <h3 className="text-white font-medium truncate mb-1">{album.title}</h3>
              {album.release_year && (
                <p className="text-gray-400 text-sm">{album.release_year}</p>
              )}
            </div>
          ))}
        </div>
      )}

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

      {/* Desktop Context Menu */}
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
        song={editingSong}
        onClose={() => {
          setEditModalOpen(false);
          setEditingSong(null);
        }}
        onSongUpdated={(updatedSong) => {
          setEditModalOpen(false);
          setEditingSong(null);
          // Refresh artist data
          if (id) {
            apiService.getArtist(Number(id)).then(response => {
              if (response.success) {
                setSongs(response.data.songs);
              }
            });
          }
        }}
      />

      {/* Add to Playlist Modal */}
      <AddToPlaylistModal
        isOpen={addToPlaylistModalOpen}
        song={selectedSongForMenu}
        onClose={() => {
          setAddToPlaylistModalOpen(false);
          setSelectedSongForMenu(null);
        }}
      />
    </div>
  );
};

export default ArtistPage;
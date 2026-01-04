import React, { useState, useEffect } from 'react';
import { Song } from '../types';
import apiService from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { handleRoomAwarePlayback } from '../utils/roomPlayback';
import { useContextMenu } from '../hooks/useContextMenu';
import ContextMenu from '../components/ContextMenu';
import EditSongModal from '../components/EditSongModal';
import AddToPlaylistModal from '../components/AddToPlaylistModal';
import { useToast } from '../contexts/ToastContext';
import { copyToClipboard } from '../utils/clipboard';
import {
  MusicalNoteIcon,
  PlayIcon,
  CalendarIcon,
  HeartIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';

const HistoryPage: React.FC = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  const { play, setQueue, addToQueue, currentSong } = usePlayerStore();
  const { user } = useAuthStore();
  const { showSuccess, showError } = useToast();
  const {
    contextMenu,
    closeContextMenu,
    handleContextMenu,
    handleClick
  } = useContextMenu();

  useEffect(() => {
    fetchHistory();
    fetchUserFavorites();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getUserHistory() as {
        data: { history: any[] }
      };

      // Convert history entries to Song objects with played_at
      const songsWithHistory = response.data.history.map((entry: any) => ({
        id: entry.song_id,
        title: entry.song_title || 'Unknown',
        artist_name: entry.artist_name || 'Unknown Artist',
        album_id: entry.album_id,
        album_title: entry.album_title,
        file_path: '',
        duration: entry.song_duration,
        artwork_path: entry.artwork_path,
        source: 'local' as const,
        created_at: entry.played_at,
        updated_at: entry.played_at
      }));

      setHistoryData(response.data.history);
      setSongs(songsWithHistory);
    } catch (err: any) {
      console.error('Failed to fetch history:', err);
      setError(err.message || 'Failed to load listening history');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserFavorites = async () => {
    try {
      const response: any = await apiService.getFavorites();
      const favoriteIds = new Set(response.data?.songs?.map((song: Song) => song.id) || []);
      setFavorites(favoriteIds as Set<number>);
    } catch (error) {
      console.error('Error fetching favorites:', error);
    }
  };

  const handlePlay = (song: Song) => {
    handleRoomAwarePlayback(song, songs);
  };

  const handleContextMenuAction = (song: Song) => {
    setSelectedSong(song);
  };

  const handleAddToQueue = () => {
    if (selectedSong) {
      addToQueue(selectedSong);
      showSuccess(`Added "${selectedSong.title}" to queue`);
    }
  };

  const handleAddToPlaylist = () => {
    setPlaylistModalOpen(true);
  };

  const handleToggleFavorite = async () => {
    if (!selectedSong) return;

    try {
      const response = await apiService.toggleFavorite(selectedSong.id);
      if (response.data.isFavorited) {
        showSuccess(`Added "${selectedSong.title}" to favorites`);
        setFavorites(prev => new Set(Array.from(prev).concat(selectedSong.id)));
      } else {
        showSuccess(`Removed "${selectedSong.title}" from favorites`);
        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(selectedSong.id);
          return newSet;
        });
      }
      closeContextMenu();
    } catch (err: any) {
      console.error('Failed to toggle favorite:', err);
      showError(err.message || 'Failed to update favorites');
    }
  };

  const handleShare = async () => {
    if (!selectedSong) return;

    try {
      const response = await apiService.createShareToken(selectedSong.id);
      await copyToClipboard(response.data.shareUrl);
      showSuccess('Share link copied to clipboard!');
    } catch (err: any) {
      console.error('Failed to create share link:', err);
      showError(err.message || 'Failed to create share link');
    }
  };

  const formatPlayDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
  };

  const isFavorited = (songId: number) => favorites.has(songId);

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Recently Played</h1>
          <p className="text-gray-400">Your listening history</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Recently Played</h1>
          <p className="text-gray-400">Your listening history</p>
        </div>
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (songs.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Recently Played</h1>
          <p className="text-gray-400">Your listening history</p>
        </div>
        <div className="text-center py-12">
          <MusicalNoteIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No listening history yet</p>
          <p className="text-gray-500 text-sm mt-2">Start playing music to see your history here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-white mb-2">Recently Played</h1>
        <p className="text-gray-400">Your listening history</p>
      </div>

      {/* Songs List */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Listening History</h3>
            <p className="text-gray-400 text-sm mt-1">{songs.length} tracks</p>
          </div>
          <button
            onClick={() => handlePlay(songs[0])}
            className="flex items-center gap-2 bg-primary hover:bg-primary/80 text-white px-4 py-2 rounded-full transition-colors"
          >
            <PlayIcon className="w-5 h-5" />
            <span>Play All</span>
          </button>
        </div>

        {/* Song List */}
        <div className="divide-y divide-gray-700">
          {songs.map((song, index) => {
            const historyEntry = historyData[index];
            return (
              <div
                key={`${song.id}-${index}`}
                onClick={(e) => handleClick(e, () => handlePlay(song))}
                onContextMenu={(e) => handleContextMenu(e, song)}
                onDoubleClick={(e) => handleClick(e, () => handlePlay(song))}
                className="flex items-center p-4 hover:bg-gray-700 transition-colors group cursor-pointer"
              >
                {/* Index / Play Button */}
                <div className="w-8 text-center text-gray-400 mr-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClick(e, () => handlePlay(song));
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <PlayIcon className="w-5 h-5 text-white hover:text-primary" />
                  </button>
                  <span className="group-hover:hidden">{index + 1}</span>
                </div>

                {/* Artwork */}
                <div className="w-12 h-12 bg-gray-700 rounded-md overflow-hidden flex-shrink-0 mr-3 relative flex items-center justify-center">
                  {song.artwork_path ? (
                    <img
                      src={apiService.getArtworkUrl(song.artwork_path)}
                      alt={song.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <MusicalNoteIcon className="w-6 h-6 text-gray-500" />
                  )}
                </div>

                {/* Song Info */}
                <div className="flex-1 min-w-0 mr-3">
                  <h4 className="text-white font-medium text-sm truncate mb-1">
                    {song.title}
                  </h4>
                  <div className="flex items-center gap-2">
                    <p className="text-gray-400 text-xs truncate">{song.artist_name}</p>
                    {song.album_title && (
                      <>
                        <span className="text-gray-600">•</span>
                        <p className="text-gray-500 text-xs truncate">{song.album_title}</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Played At */}
                <div className="flex items-center gap-2 text-gray-400 text-xs mr-4 hidden sm:flex">
                  <CalendarIcon className="w-4 h-4" />
                  <span>{formatPlayDate(historyEntry?.played_at)}</span>
                </div>

                {/* Completion Status */}
                <div className="text-gray-400 text-xs mr-4 hidden lg:block">
                  {historyEntry?.duration_played === null ? (
                    <span className="text-gray-500">Unknown</span>
                  ) : historyEntry?.completed === true ? (
                    <span className="text-green-400">Completed</span>
                  ) : (
                    <span className="text-yellow-400">Partial</span>
                  )}
                </div>

                {/* Duration */}
                <div className="text-gray-400 text-xs mr-4 hidden md:block">
                  {song.duration ? `${Math.floor(song.duration / 60)}:${String(song.duration % 60).padStart(2, '0')}` : '--:--'}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSong(song);
                      handleToggleFavorite();
                    }}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    title={isFavorited(song.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {isFavorited(song.id) ? (
                      <HeartIconSolid className="w-5 h-5 text-red-400" />
                    ) : (
                      <HeartIcon className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={closeContextMenu}
        song={contextMenu.song}
        isAdmin={Boolean(user?.is_admin)}
        isFavorited={contextMenu.song ? isFavorited(contextMenu.song.id) : false}
        onPlay={handleContextMenuAction}
        onAddToQueue={handleAddToQueue}
        onAddToPlaylist={handleAddToPlaylist}
        onToggleFavorite={handleToggleFavorite}
        onShare={handleShare}
      />

      {/* Edit Song Modal */}
      <EditSongModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingSong(null);
        }}
        song={editingSong}
        onSongUpdated={(updatedSong) => {
          setSongs(prev => prev.map(s => s.id === updatedSong.id ? updatedSong : s));
          setEditModalOpen(false);
          setEditingSong(null);
        }}
      />

      {/* Add to Playlist Modal */}
      <AddToPlaylistModal
        isOpen={playlistModalOpen}
        onClose={() => {
          setPlaylistModalOpen(false);
          setSelectedSong(null);
          showSuccess(`Added to playlist`);
        }}
        song={selectedSong}
      />
    </div>
  );
};

export default HistoryPage;

import React, { useState, useEffect } from 'react';
import { 
  PlusIcon, 
  MusicalNoteIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  UserIcon,
  LockClosedIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline';
import { apiService } from '../services/api';
import { Song, Playlist } from '../types';
import { useToast } from '../contexts/ToastContext';
import { getArtistNames } from '../utils/formatters';

interface PlaylistWithDetails extends Playlist {
  username: string;
  song_count: number;
}

interface AddToPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  song?: Song | null;
  songs?: Song[] | null;
  headerTitle?: string;
  headerSubtitle?: string;
  headerArtwork?: string;
}

const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({
  isOpen,
  onClose,
  song,
  songs,
  headerTitle,
  headerSubtitle,
  headerArtwork
}) => {
  const items = songs && songs.length > 0 ? songs : (song ? [song] : []);
  const isBatch = Boolean(songs && songs.length > 0);
  const [playlists, setPlaylists] = useState<PlaylistWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadPlaylists();
      setSearchQuery('');
      setIsCreating(false);
      setNewPlaylistName('');
    }
  }, [isOpen]);

  const loadPlaylists = async () => {
    try {
      setLoading(true);
      const response = await apiService.getUserPlaylists();
      if (response.success && response.data) {
        setPlaylists(response.data.playlists || []);
      }
    } catch (error) {
      console.error('Failed to load playlists:', error);
      showError('Failed to load playlists');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToPlaylist = async (playlist: PlaylistWithDetails) => {
    if (items.length === 0) return;

    try {
      if (isBatch) {
        const response = await apiService.addSongsToPlaylist(playlist.id, items.map(s => s.id));
        if (response.success) {
          showSuccess(`Added ${items.length} songs to "${playlist.name}"`);
          onClose();
        }
      } else {
        const response = await apiService.addSongToPlaylist(playlist.id, items[0].id);
        if (response.success) {
          showSuccess(`Added "${items[0].title}" to "${playlist.name}"`);
          onClose();
        }
      }
    } catch (error: any) {
      console.error('Failed to add song(s) to playlist:', error);
      if (!isBatch && error.message?.includes('already exists')) {
        showError(`"${items[0].title}" is already in "${playlist.name}"`);
      } else {
        showError(isBatch ? 'Failed to add songs to playlist' : 'Failed to add song to playlist');
      }
    }
  };

  const handleCreateAndAdd = async () => {
    if (items.length === 0 || !newPlaylistName.trim()) return;

    try {
      // Create the playlist
      const createResponse = await apiService.createPlaylist({
        name: newPlaylistName.trim(),
        description: '',
        is_public: false
      });

      if (createResponse.success && createResponse.data) {
        const newPlaylist = createResponse.data.playlist;

        if (isBatch) {
          const addResponse = await apiService.addSongsToPlaylist(newPlaylist.id, items.map(s => s.id));
          if (addResponse.success) {
            showSuccess(`Created "${newPlaylistName}" and added ${items.length} songs`);
            onClose();
          }
        } else {
          const addResponse = await apiService.addSongToPlaylist(newPlaylist.id, items[0].id);
          if (addResponse.success) {
            showSuccess(`Created "${newPlaylistName}" and added "${items[0].title}"`);
            onClose();
          }
        }
      }
    } catch (error) {
      console.error('Failed to create playlist and add song(s):', error);
      showError('Failed to create playlist');
    }
  };

  const filteredPlaylists = playlists.filter(playlist =>
    playlist.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen || items.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-gray-800 rounded-lg w-full max-w-md max-h-[32rem] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Add to Playlist</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Song / album info */}
        <div className="px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-3">
            {(headerArtwork || items[0].artwork_path) ? (
              <img
                src={apiService.getArtworkUrl(headerArtwork || items[0].artwork_path!)}
                alt={headerTitle || items[0].album_title || 'Album artwork'}
                className="w-10 h-10 rounded object-cover"
              />
            ) : (
              <div className="w-10 h-10 bg-primary/20 rounded flex items-center justify-center">
                <MusicalNoteIcon className="w-5 h-5 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{headerTitle || items[0].title}</p>
              <p className="text-gray-400 text-xs truncate">
                {headerSubtitle || (isBatch ? `${items.length} songs` : getArtistNames(items[0]))}
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-700">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search playlists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Create new playlist option */}
        <div className="px-4 py-2 border-b border-gray-700">
          {!isCreating ? (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-2 text-primary hover:text-primary-hover transition-colors text-sm"
            >
              <PlusIcon className="w-4 h-4" />
              Create new playlist
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Playlist name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateAndAdd()}
                className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-primary text-sm"
                autoFocus
              />
              <button
                onClick={handleCreateAndAdd}
                disabled={!newPlaylistName.trim()}
                className="px-2 py-1 bg-primary hover:bg-primary-hover disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewPlaylistName('');
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Playlist list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : filteredPlaylists.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              {searchQuery ? 'No playlists found' : 'No playlists yet'}
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {filteredPlaylists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => handleAddToPlaylist(playlist)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-700 transition-colors text-left group"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-purple-600/20 rounded-lg flex items-center justify-center group-hover:from-primary/30 group-hover:to-purple-600/30 transition-all duration-200">
                    <MusicalNoteIcon className="w-6 h-6 text-white/80 group-hover:text-white transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm font-medium truncate group-hover:text-primary transition-colors">{playlist.name}</p>
                      {playlist.is_public ? (
                        <GlobeAltIcon className="w-3 h-3 text-green-400 flex-shrink-0" />
                      ) : (
                        <LockClosedIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <UserIcon className="w-3 h-3" />
                      <span>{playlist.username}</span>
                      <span>•</span>
                      <span>{playlist.song_count} songs</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddToPlaylistModal;
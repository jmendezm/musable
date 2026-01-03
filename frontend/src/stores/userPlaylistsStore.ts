import { create } from 'zustand';
import { Playlist } from '../types';
import { apiService } from '../services/api';

interface UserPlaylistsState {
  userPlaylists: Playlist[];
  isLoading: boolean;
  loadUserPlaylists: () => Promise<void>;
  addPlaylist: (playlist: Playlist) => void;
  updatePlaylist: (playlist: Playlist) => void;
  removePlaylist: (playlistId: number) => void;
  refreshPlaylists: () => Promise<void>;
}

export const useUserPlaylistsStore = create<UserPlaylistsState>()((set, get) => ({
  userPlaylists: [],
  isLoading: false,

  loadUserPlaylists: async () => {
    set({ isLoading: true });
    try {
      const response = await apiService.getUserPlaylists();
      const playlists = response?.data?.playlists || [];
      set({ userPlaylists: playlists, isLoading: false });
    } catch (error) {
      console.error('Failed to load user playlists:', error);
      set({ userPlaylists: [], isLoading: false });
    }
  },

  addPlaylist: (playlist: Playlist) => {
    const { userPlaylists } = get();
    set({ userPlaylists: [...userPlaylists, playlist] });
  },

  updatePlaylist: (playlist: Playlist) => {
    const { userPlaylists } = get();
    set({
      userPlaylists: userPlaylists.map(p =>
        p.id === playlist.id ? playlist : p
      )
    });
  },

  removePlaylist: (playlistId: number) => {
    const { userPlaylists } = get();
    set({
      userPlaylists: userPlaylists.filter(p => p.id !== playlistId)
    });
  },

  refreshPlaylists: async () => {
    await get().loadUserPlaylists();
  },
}));

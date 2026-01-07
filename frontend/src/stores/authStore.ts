import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, LoginCredentials, RegisterData } from '../types';
import { apiService } from '../services/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  getProfile: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateProfilePicture: (file: File) => Promise<void>;
  deleteProfilePicture: () => Promise<void>;
  clearError: () => void;
  validateInvite: (token: string) => Promise<boolean>;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // State
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Actions
      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiService.login(credentials);
          const { user, token } = response.data;

          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          set({
            error: error.message || 'Login failed',
            isLoading: false,
            isAuthenticated: false,
            user: null,
            token: null,
          });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiService.register(data);
          const { user, token } = response.data;

          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          set({
            error: error.message || 'Registration failed',
            isLoading: false,
            isAuthenticated: false,
            user: null,
            token: null,
          });
          throw error;
        }
      },

      logout: () => {
        // Call API logout endpoint (fire and forget)
        apiService.logout().catch(console.error);

        // Clear the player when logging out
        const { usePlayerStore } = require('../stores/playerStore');
        const playerStore = usePlayerStore.getState();
        playerStore.stop();
        playerStore.clearQueue();

        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });
      },

      getProfile: async () => {
        const token = get().token;
        if (!token) {
          set({ isAuthenticated: false, user: null, token: null });
          return;
        }

        set({ isLoading: true });
        try {
          const response = await apiService.getProfile();
          const { user } = response.data;

          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: error.message || 'Failed to get profile',
          });
        }
      },

      changePassword: async (currentPassword, newPassword) => {
        set({ isLoading: true, error: null });
        try {
          await apiService.changePassword({
            currentPassword,
            newPassword,
          });
          set({ isLoading: false });
        } catch (error: any) {
          set({
            error: error.message || 'Failed to change password',
            isLoading: false,
          });
          throw error;
        }
      },

      updateProfilePicture: async (file) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiService.updateProfilePicture(file);
          const { user } = response.data;
          
          set({
            user,
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          set({
            error: error.message || 'Failed to update profile picture',
            isLoading: false,
          });
          throw error;
        }
      },

      deleteProfilePicture: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiService.deleteProfilePicture();
          const { user } = response.data;
          
          set({
            user,
            isLoading: false,
            error: null,
          });
        } catch (error: any) {
          set({
            error: error.message || 'Failed to delete profile picture',
            isLoading: false,
          });
          throw error;
        }
      },

      clearError: () => {
        set({ error: null });
      },

      validateInvite: async (token) => {
        try {
          const response = await apiService.validateInvite(token);
          return response.data.valid;
        } catch (error: any) {
          return false;
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      // Custom storage to also sync token to localStorage for API interceptor
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          const str = JSON.stringify(value);
          localStorage.setItem(name, str);

          // Also save token to localStorage for API interceptor
          const state = value.state;
          if (state?.token) {
            localStorage.setItem('authToken', state.token);
          } else if (state?.token === null) {
            localStorage.removeItem('authToken');
          }
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
          localStorage.removeItem('authToken');
        },
      },
    }
  )
);

// Initialize auth state from zustand persist storage on app start
if (typeof window !== 'undefined') {
  // Wait for zustand persist to rehydrate from localStorage
  useAuthStore.persist.onFinishHydration((state) => {
    // If we have a token in the rehydrated state, verify it's still valid
    if (state?.token) {
      useAuthStore.getState().getProfile();
    }
  });
}
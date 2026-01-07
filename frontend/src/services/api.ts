import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { 
  ApiResponse, 
  User, 
  LoginCredentials, 
  RegisterData, 
  Song, 
  Artist, 
  Album, 
  Playlist, 
  CreatePlaylistData, 
  ListenHistory,
  DashboardStats,
  Invite,
  ScanProgress
} from '../types';
import { getApiBaseUrl, getBaseUrl } from '../config/config';

class ApiService {
  private api: AxiosInstance;
  private initialized: boolean = false;

  constructor() {
    this.api = axios.create({
      baseURL: '/api', // Will be updated after config loads
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  async initialize() {
    if (this.initialized) return;

    const apiBaseUrl = getApiBaseUrl();
    this.api.defaults.baseURL = apiBaseUrl;
    this.initialized = true;
  }

  private setupInterceptors() {
    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle errors
    this.api.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Clear both auth-storage and authToken from localStorage
          localStorage.removeItem('auth-storage');
          localStorage.removeItem('authToken');
          // Don't auto-redirect - let components handle 401 errors gracefully
          // Components can check if user is logged in and show appropriate UI
        }
        return Promise.reject(error);
      }
    );
  }

  // Public method for making API requests - updated
  public async request<T>(method: string, url: string, data?: any): Promise<ApiResponse<T>> {
    await this.initialize();
    try {
      const response = await this.api.request({
        method,
        url,
        data,
      });
      return response.data;
    } catch (error: any) {
      const apiError = new Error(error.response?.data?.error?.message || error.message || 'An error occurred');
      (apiError as any).statusCode = error.response?.status || 500;
      (apiError as any).details = error.response?.data?.error?.details || null;
      throw apiError;
    }
  }

  // Auth endpoints
  async login(credentials: LoginCredentials): Promise<ApiResponse<{ user: User; token: string }>> {
    return this.request('POST', '/auth/login', credentials);
  }

  async register(data: RegisterData): Promise<ApiResponse<{ user: User; token: string }>> {
    return this.request('POST', '/auth/register', data);
  }

  async getProfile(): Promise<ApiResponse<{ user: User }>> {
    return this.request('GET', '/auth/profile');
  }

  async getUserProfile(username: string): Promise<ApiResponse<{ user: User }>> {
    return this.request('GET', `/auth/profile/${username}`);
  }

  async searchUsers(query: string): Promise<ApiResponse<{ users: User[] }>> {
    return this.request('GET', `/auth/search?q=${encodeURIComponent(query)}`);
  }

  async changePassword(data: { currentPassword: string; newPassword: string }): Promise<ApiResponse<any>> {
    return this.request('PUT', '/auth/password', data);
  }

  async logout(): Promise<ApiResponse<any>> {
    return this.request('POST', '/auth/logout');
  }

  async validateInvite(token: string): Promise<ApiResponse<{ valid: boolean }>> {
    return this.request('GET', `/auth/invite/${token}`);
  }

  async updateProfilePicture(file: File): Promise<ApiResponse<{ user: User }>> {
    await this.initialize();
    
    const formData = new FormData();
    formData.append('profilePicture', file);

    try {
      const response = await this.api.put('/auth/profile-picture', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error: any) {
      const apiError = new Error(error.response?.data?.error?.message || error.message || 'Failed to update profile picture');
      (apiError as any).statusCode = error.response?.status || 500;
      (apiError as any).details = error.response?.data?.error?.details || null;
      throw apiError;
    }
  }

  async deleteProfilePicture(): Promise<ApiResponse<{ user: User }>> {
    return this.request('DELETE', '/auth/profile-picture');
  }

  // Library endpoints
  async getSongs(params?: { 
    search?: string; 
    artist?: number; 
    album?: number; 
    genre?: string; 
    limit?: number; 
    offset?: number;
    includeYTMusic?: string;
  }): Promise<ApiResponse<{ songs: Song[]; total: number; ytMusicResults?: any[]; hasYTMusicResults?: boolean; limit: number; offset: number }>> {
    // Filter out undefined values to prevent them from becoming "undefined" strings
    const filteredParams = params ? Object.fromEntries(
      Object.entries(params).filter(([_, value]) => value !== undefined)
    ) : {};
    const queryString = new URLSearchParams(filteredParams as any).toString();
    return this.request('GET', `/library/songs${queryString ? `?${queryString}` : ''}`);
  }

  async getSong(id: number): Promise<ApiResponse<{ song: Song }>> {
    return this.request('GET', `/library/songs/${id}`);
  }

  async getRandomSongs(limit = 50): Promise<ApiResponse<{ songs: Song[] }>> {
    return this.request('GET', `/library/songs/random?limit=${limit}`);
  }

  async getArtists(search?: string): Promise<ApiResponse<{ artists: Artist[] }>> {
    return this.request('GET', `/library/artists${search ? `?search=${search}` : ''}`);
  }

  async getArtist(id: number): Promise<ApiResponse<{ artist: Artist; songs: Song[]; albums: Album[] }>> {
    return this.request('GET', `/library/artists/${id}`);
  }

  async getAlbums(params?: { search?: string; artist?: number }): Promise<ApiResponse<{ albums: Album[] }>> {
    const queryString = new URLSearchParams(params as any).toString();
    return this.request('GET', `/library/albums${queryString ? `?${queryString}` : ''}`);
  }

  async getAlbum(id: number): Promise<ApiResponse<{ album: Album; songs: Song[] }>> {
    return this.request('GET', `/library/albums/${id}`);
  }

  async getRecentAlbums(limit = 20): Promise<ApiResponse<{ albums: Album[] }>> {
    return this.request('GET', `/library/albums/recent?limit=${limit}`);
  }

  async getGenres(): Promise<ApiResponse<{ genres: string[] }>> {
    return this.request('GET', '/library/genres');
  }

  async getLibraryStats(): Promise<ApiResponse<{ stats: any }>> {
    return this.request('GET', '/library/stats');
  }

  async startLibraryScan(paths?: string[]): Promise<ApiResponse<{ scanId: number }>> {
    return this.request('POST', '/library/scan', { paths });
  }

  async stopLibraryScan(): Promise<ApiResponse<{ message: string }>> {
    return this.request('POST', '/library/scan/stop');
  }

  async getScanStatus(): Promise<ApiResponse<{ currentScan: ScanProgress | null; history: any[]; isScanning: boolean }>> {
    return this.request('GET', '/library/scan/status');
  }

  async rescanAllLibraries(): Promise<ApiResponse<{ message: string; deletedCount: number }>> {
    return this.request('POST', '/admin/library/rescan-all');
  }

  // Playlist endpoints
  async createPlaylist(data: CreatePlaylistData): Promise<ApiResponse<{ playlist: Playlist }>> {
    return this.request('POST', '/playlists', data);
  }

  async getUserPlaylists(): Promise<ApiResponse<{ playlists: Playlist[] }>> {
    return this.request('GET', '/playlists/my');
  }

  async getPublicPlaylists(): Promise<ApiResponse<{ playlists: Playlist[] }>> {
    return this.request('GET', '/playlists/public');
  }

  async getAllPlaylists(): Promise<ApiResponse<{ playlists: Playlist[] }>> {
    return this.request('GET', '/playlists/all');
  }

  async getPlaylist(id: number): Promise<ApiResponse<{ playlist: Playlist; songs: any[] }>> {
    return this.request('GET', `/playlists/${id}`);
  }

  async updatePlaylist(id: number, data: Partial<CreatePlaylistData>): Promise<ApiResponse<{ playlist: Playlist }>> {
    return this.request('PUT', `/playlists/${id}`, data);
  }

  async deletePlaylist(id: number): Promise<ApiResponse<any>> {
    return this.request('DELETE', `/playlists/${id}`);
  }

  async addSongToPlaylist(playlistId: number, songId: number): Promise<ApiResponse<any>> {
    return this.request('POST', `/playlists/${playlistId}/songs`, { songId });
  }

  async removeSongFromPlaylist(playlistId: number, songId: number): Promise<ApiResponse<any>> {
    return this.request('DELETE', `/playlists/${playlistId}/songs/${songId}`);
  }

  async reorderPlaylistSongs(playlistId: number, songIds: number[]): Promise<ApiResponse<any>> {
    return this.request('PUT', `/playlists/${playlistId}/songs/reorder`, { songIds });
  }

  async searchPlaylists(query: string): Promise<ApiResponse<{ playlists: Playlist[] }>> {
    return this.request('GET', `/playlists/search?q=${encodeURIComponent(query)}`);
  }

  async getUserPublicPlaylists(username: string): Promise<ApiResponse<{ playlists: Playlist[] }>> {
    return this.request('GET', `/playlists/user/${username}`);
  }

  // History endpoints
  async trackPlay(data: { songId: number; durationPlayed?: number; completed?: boolean }): Promise<ApiResponse<any>> {
    return this.request('POST', '/history/track', data);
  }

  async sendHeartbeat(data: { songId: number; durationPlayed: number }): Promise<ApiResponse<any>> {
    return this.request('POST', '/history/heartbeat', data);
  }

  async getUserHistory(params?: { limit?: number; offset?: number }): Promise<ApiResponse<{ history: ListenHistory[] }>> {
    const queryString = new URLSearchParams(params as any).toString();
    return this.request('GET', `/history${queryString ? `?${queryString}` : ''}`);
  }

  async getRecentlyPlayed(limit = 20): Promise<ApiResponse<{ songs: Song[] }>> {
    return this.request('GET', `/history/recent?limit=${limit}`);
  }

  async getMostPlayed(limit = 20): Promise<ApiResponse<{ songs: Song[] }>> {
    return this.request('GET', `/history/most-played?limit=${limit}`);
  }

  async getListeningStats(): Promise<ApiResponse<{ stats: any; trends: any[]; topArtists: any[]; topAlbums: any[] }>> {
    return this.request('GET', '/history/stats');
  }

  async clearHistory(): Promise<ApiResponse<any>> {
    return this.request('DELETE', '/history');
  }

  // Admin endpoints
  async getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
    return this.request('GET', '/admin/dashboard');
  }

  async getCurrentlyPlaying(): Promise<ApiResponse<{ currentlyPlaying: any[] }>> {
    return this.request('GET', '/admin/currently-playing');
  }
   async getActiveRooms(): Promise<ApiResponse<{ activeRooms: any[] }>> {
    return this.request('GET', '/admin/active-rooms');
  }

  async getAllUsers(): Promise<ApiResponse<{ users: User[] }>> {
    return this.request('GET', '/admin/users');
  }

  async updateUser(id: number, data: Partial<User>): Promise<ApiResponse<{ user: User }>> {
    return this.request('PUT', `/admin/users/${id}`, data);
  }

  async deleteUser(id: number): Promise<ApiResponse<any>> {
    return this.request('DELETE', `/admin/users/${id}`);
  }

  async getUserActivity(id: number): Promise<ApiResponse<any>> {
    return this.request('GET', `/admin/users/${id}/activity`);
  }

  async createInvite(expiresInHours = 24): Promise<ApiResponse<{ invite: Invite }>> {
    return this.request('POST', '/admin/invites', { expiresInHours });
  }

  async getAllInvites(): Promise<ApiResponse<{ invites: Invite[] }>> {
    return this.request('GET', '/admin/invites');
  }

  async revokeInvite(id: number): Promise<ApiResponse<any>> {
    return this.request('DELETE', `/admin/invites/${id}`);
  }

  async cleanupExpiredInvites(): Promise<ApiResponse<any>> {
    return this.request('POST', '/admin/invites/cleanup');
  }

  async resetAllUserData(): Promise<ApiResponse<any>> {
    return this.request('POST', '/admin/reset-all-data');
  }

  async getAllHistory(params?: { limit?: number; offset?: number; user?: number }): Promise<ApiResponse<{ history: ListenHistory[] }>> {
    const queryString = new URLSearchParams(params as any).toString();
    return this.request('GET', `/admin/history${queryString ? `?${queryString}` : ''}`);
  }

  async getAdminListeningStats(userId?: number): Promise<ApiResponse<any>> {
    return this.request('GET', `/admin/stats/listening${userId ? `?user=${userId}` : ''}`);
  }

  async updateSong(id: number, data: any): Promise<ApiResponse<Song>> {
    return this.request('PUT', `/admin/songs/${id}`, data);
  }

  async deleteSong(id: number, deleteFile?: boolean): Promise<ApiResponse<any>> {
    const url = deleteFile
      ? `/admin/songs/${id}?deleteFile=true`
      : `/admin/songs/${id}`;
    return this.request('DELETE', url);
  }

  async getLibraryPaths(): Promise<ApiResponse<{ paths: any[] }>> {
    return this.request('GET', '/admin/library/paths');
  }

  async addLibraryPath(path: string): Promise<ApiResponse<{ path: any }>> {
    return this.request('POST', '/admin/library/paths', { path });
  }

  async updateLibraryPath(id: number, data: { path?: string; is_active?: boolean }): Promise<ApiResponse<{ path: any }>> {
    return this.request('PUT', `/admin/library/paths/${id}`, data);
  }

  async deleteLibraryPath(id: number): Promise<ApiResponse<any>> {
    return this.request('DELETE', `/admin/library/paths/${id}`);
  }

  // Favorites
  async getFavorites(): Promise<ApiResponse<{ songs: Song[]; count: number }>> {
    return this.request('GET', '/favorites');
  }

  async toggleFavorite(songId: number): Promise<ApiResponse<{ songId: number; isFavorited: boolean; message: string }>> {
    return this.request('POST', `/favorites/${songId}/toggle`);
  }

  async checkFavoriteStatus(songId: number): Promise<ApiResponse<{ songId: number; isFavorited: boolean }>> {
    return this.request('GET', `/favorites/${songId}/status`);
  }

  async addToFavorites(songId: number): Promise<ApiResponse<{ songId: number; isFavorited: boolean; message: string }>> {
    return this.request('POST', `/favorites/${songId}`);
  }

  async removeFromFavorites(songId: number): Promise<ApiResponse<{ songId: number; isFavorited: boolean; message: string }>> {
    return this.request('DELETE', `/favorites/${songId}`);
  }

  // Sharing
  async createShareToken(songId: number, options?: { maxAccess?: number; expiresInHours?: number }): Promise<ApiResponse<{ token: string; shareUrl: string }>> {
    const response = await this.request('POST', '/share/create', {
      songId,
      maxAccess: options?.maxAccess,
      expiresInHours: options?.expiresInHours
    }) as any;

    // Construct the full share URL using BASE_URL from config
    const baseUrl = getBaseUrl();
    response.data.shareUrl = `${baseUrl}/share/${response.data.token}`;

    return response;
  }

  // System Settings (Admin)
  async getAllSystemSettings(): Promise<ApiResponse<{ settings: any }>> {
    return this.request('GET', '/admin/settings');
  }

  async getSystemSetting(key: string): Promise<ApiResponse<{ key: string; value: string }>> {
    return this.request('GET', `/admin/settings/${key}`);
  }

  async setSystemSetting(key: string, value: string | boolean): Promise<ApiResponse<{ key: string; value: string }>> {
    return this.request('PUT', `/admin/settings/${key}`, { value: String(value) });
  }

  // Library Scan Reports (Admin)
  async getAllScanReports(limit: number = 100): Promise<ApiResponse<{ reports: any[] }>> {
    return this.request('GET', `/admin/library/scans?limit=${limit}`);
  }

  async deleteScanReport(reportId: number): Promise<ApiResponse<{ message: string }>> {
    return this.request('DELETE', `/admin/library/scans/${reportId}`);
  }

  // System Statistics
  async getSystemStats(): Promise<ApiResponse<{
    uptime: number;
    cpu: { usage: number; cores: number; loadAverage: string[] };
    memory: { total: number; used: number; free: number; usage: number };
    platform: string;
    architecture: string;
    nodeVersion: string;
    hostname: string;
  }>> {
    return this.request('GET', '/system/stats');
  }

  // Album following endpoints
  async toggleAlbumFollow(albumId: number): Promise<ApiResponse<{ isFollowing: boolean; message: string }>> {
    return this.request('POST', `/library/albums/${albumId}/toggle-follow`);
  }

  async followAlbum(albumId: number): Promise<ApiResponse<{ message: string }>> {
    return this.request('POST', `/library/albums/${albumId}/follow`);
  }

  async unfollowAlbum(albumId: number): Promise<ApiResponse<{ message: string }>> {
    return this.request('DELETE', `/library/albums/${albumId}/follow`);
  }

  async getAlbumFollowStatus(albumId: number): Promise<ApiResponse<{ isFollowing: boolean }>> {
    return this.request('GET', `/library/albums/${albumId}/follow-status`);
  }

  async getFollowedAlbums(): Promise<ApiResponse<{ albums: any[] }>> {
    return this.request('GET', `/library/albums/followed`);
  }

  async getAlbumsWithFollowStatus(): Promise<ApiResponse<{ albums: any[] }>> {
    return this.request('GET', `/library/albums/with-follow-status`);
  }

  // Playlist following endpoints
  async togglePlaylistFollow(playlistId: number): Promise<ApiResponse<{ isFollowing: boolean; message: string }>> {
    return this.request('POST', `/playlists/${playlistId}/toggle-follow`);
  }

  async followPlaylist(playlistId: number): Promise<ApiResponse<{ message: string }>> {
    return this.request('POST', `/playlists/${playlistId}/follow`);
  }

  async unfollowPlaylist(playlistId: number): Promise<ApiResponse<{ message: string }>> {
    return this.request('DELETE', `/playlists/${playlistId}/follow`);
  }

  async getPlaylistFollowStatus(playlistId: number): Promise<ApiResponse<{ isFollowing: boolean }>> {
    return this.request('GET', `/playlists/${playlistId}/follow-status`);
  }

  async getFollowedPlaylists(): Promise<ApiResponse<{ playlists: any[] }>> {
    return this.request('GET', `/playlists/followed`);
  }

  async getPlaylistsWithFollowStatus(): Promise<ApiResponse<{ playlists: any[] }>> {
    return this.request('GET', `/playlists/with-follow-status`);
  }

  // Admin profile picture management
  async adminUpdateUserProfilePicture(userId: number, file: File): Promise<ApiResponse<{ user: User }>> {
    await this.initialize();
    
    const formData = new FormData();
    formData.append('profilePicture', file);

    try {
      const response = await this.api.put(`/admin/users/${userId}/profile-picture`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error: any) {
      const apiError = new Error(error.response?.data?.error?.message || error.message || 'Failed to update user profile picture');
      (apiError as any).statusCode = error.response?.status || 500;
      (apiError as any).details = error.response?.data?.error?.details || null;
      throw apiError;
    }
  }

  async adminDeleteUserProfilePicture(userId: number): Promise<ApiResponse<{ user: User }>> {
    return this.request('DELETE', `/admin/users/${userId}/profile-picture`);
  }

  // Stream endpoint
  getStreamUrl(songId: number): string {
    const apiBaseUrl = getApiBaseUrl();
    return `${apiBaseUrl}/stream/${songId}`;
  }

  getArtworkUrl(path: string): string {
    if (!path) return '';

    // Use backend URL for static files (uploads, artwork, etc)
    const backendUrl = getApiBaseUrl().replace('/api', '');
    // Ensure path starts with / to avoid missing slash
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${backendUrl}${normalizedPath}`;
  }

  getArtistImageUrl(path: string): string {
    if (!path) return '';

    // Use backend URL for static files (uploads, artwork, etc)
    const backendUrl = getApiBaseUrl().replace('/api', '');
    // Ensure path starts with / to avoid missing slash
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${backendUrl}${normalizedPath}`;
  }

  // YouTube Music download endpoints
  async downloadYTMusicSong(videoId: string): Promise<ApiResponse<{ downloadId: string; message: string }>> {
    return this.request('POST', `/plugins/youtube/music/download/${videoId}`);
  }

  async getDownloadProgress(downloadId: string): Promise<ApiResponse<{
    id: string;
    status: 'downloading' | 'processing' | 'completed' | 'error';
    progress: number;
    error?: string;
  }>> {
    return this.request('GET', `/plugins/youtube/music/download/${downloadId}/progress`);
  }

  async getActiveDownloads(): Promise<ApiResponse<any[]>> {
    return this.request('GET', `/plugins/youtube/music/downloads`);
  }
}

export const apiService = new ApiService();
export default apiService;
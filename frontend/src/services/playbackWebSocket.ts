import { io, Socket } from 'socket.io-client';
import { getWebSocketUrl } from '../config/config';
import { useAuthStore } from '../stores/authStore';

class PlaybackWebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  async connect(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const token = useAuthStore.getState().token;

      if (!token) {
        reject(new Error('No authentication token'));
        return;
      }

      try {
        // Disconnect existing socket
        if (this.socket) {
          this.socket.disconnect();
        }

        const baseWebSocketUrl = getWebSocketUrl();

        this.socket = io(baseWebSocketUrl, {
          auth: {
            token: token
          },
          transports: ['websocket', 'polling'],
        });

        this.socket.on('connect', () => {
          console.log('🎵 Playback tracker connected');
          this.reconnectAttempts = 0;
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('🎵 Playback tracker connection error:', error);

          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            setTimeout(() => {
              this.reconnectAttempts++;
              this.connect();
            }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts));
          } else {
            reject(error);
          }
        });

        this.socket.on('disconnect', () => {
          console.log('🎵 Playback tracker disconnected');
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  // Emit playback events
  emitPlay(songId: number, currentTime: number, duration: number): void {
    if (!this.socket || !this.socket.connected) {
      console.warn('🎵 PlaybackWebSocket: Not connected');
      return;
    }
    console.log('🎵 Emitting playback_play:', { songId, currentTime, duration });
    this.socket.emit('playback_play', { songId, currentTime, duration });
  }

  emitPause(currentTime: number): void {
    if (!this.socket || !this.socket.connected) {
      return;
    }
    console.log('🎵 Emitting playback_pause:', { currentTime });
    this.socket.emit('playback_pause', { currentTime });
  }

  emitSeek(currentTime: number): void {
    if (!this.socket || !this.socket.connected) {
      return;
    }
    console.log('🎵 Emitting playback_seek:', { currentTime });
    this.socket.emit('playback_seek', { currentTime });
  }

  emitProgress(currentTime: number): void {
    if (!this.socket || !this.socket.connected) {
      return;
    }
    // Don't spam console for progress updates
    this.socket.emit('playback_progress', { currentTime });
  }

  emitSongChange(songId: number, currentTime: number, duration: number): void {
    if (!this.socket || !this.socket.connected) {
      return;
    }
    console.log('🎵 Emitting playback_song_change:', { songId, currentTime, duration });
    this.socket.emit('playback_song_change', { songId, currentTime, duration });
  }

  // Get the socket instance for other components to listen to events
  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// Create singleton instance
export const playbackWebSocketService = new PlaybackWebSocketService();
export default playbackWebSocketService;

import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { UserWithoutPassword, UserModel } from '../models/User';
import { SongModel } from '../models/Song';
import config from '../config/config';

interface AuthenticatedSocket extends Socket {
  user?: UserWithoutPassword;
}

interface PlaybackState {
  userId: number;
  username: string;
  songId: number;
  songTitle: string;
  artistName: string;
  artworkPath: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isPaused: boolean;
  lastUpdate: Date;
  socketId: string;
  isIdle: boolean; // New field to track if user is idle (connected but not playing)
  connectionId: string; // Unique ID for each connection (to distinguish multiple tabs/devices)
  deviceInfo: string; // Device/browser info (e.g., "Chrome on Windows", "Safari on iPhone")
}

export class PlaybackTracker {
  private io: Server;
  private playbackStates: Map<string, PlaybackState> = new Map(); // Key is socketId, not userId
  private roomServiceSockets: Set<string> = new Set(); // Track room service sockets to exclude from "Currently Using"
  private readonly CLEANUP_INTERVAL = 30000; // 30 seconds
  private readonly STATE_TIMEOUT = 60000; // 1 minute timeout

  // Parse User-Agent to get device/browser info
  private parseDeviceInfo(userAgent: string | undefined): string {
    if (!userAgent) return 'Unknown Device';

    const ua = userAgent.toLowerCase();

    // Detect mobile devices
    if (/iphone/.test(ua)) return 'Safari on iPhone';
    if (/ipad/.test(ua)) return 'Safari on iPad';
    if (/android/.test(ua)) {
      if (/chrome/.test(ua)) return 'Chrome on Android';
      return 'Android Browser';
    }

    // Detect browsers on desktop
    if (/edg/.test(ua)) return 'Edge on Windows';
    if (/chrome/.test(ua)) {
      if (/windows/.test(ua)) return 'Chrome on Windows';
      if (/macintosh|mac os x/.test(ua)) return 'Chrome on Mac';
      if (/linux/.test(ua)) return 'Chrome on Linux';
      return 'Chrome';
    }
    if (/firefox/.test(ua)) {
      if (/windows/.test(ua)) return 'Firefox on Windows';
      if (/macintosh|mac os x/.test(ua)) return 'Firefox on Mac';
      if (/linux/.test(ua)) return 'Firefox on Linux';
      return 'Firefox';
    }
    if (/safari/.test(ua) && !/chrome/.test(ua)) {
      if (/macintosh|mac os x/.test(ua)) return 'Safari on Mac';
      return 'Safari';
    }

    return 'Web Browser';
  }

  constructor(io: Server) {
    this.io = io;
    this.setupSocketHandlers();
    this.startCleanupTimer();
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`🎵 PlaybackTracker: Socket ${socket.id} connected`);

      // Authenticate and track user immediately on connection
      this.handleUserConnection(socket);

      // Listen for playback events (will authenticate per-event)
      socket.on('playback_play', (data) => {
        console.log('🎵 Received playback_play event:', data);
        this.handleAuthenticatedEvent(socket, data, this.handlePlay.bind(this));
      });
      socket.on('playback_pause', (data) => {
        console.log('🎵 Received playback_pause event:', data);
        this.handleAuthenticatedEvent(socket, data, this.handlePause.bind(this));
      });
      socket.on('playback_seek', (data) => {
        console.log('🎵 Received playback_seek event:', data);
        this.handleAuthenticatedEvent(socket, data, this.handleSeek.bind(this));
      });
      socket.on('playback_progress', (data) => {
        this.handleAuthenticatedEvent(socket, data, this.handleProgress.bind(this));
      });
      socket.on('playback_song_change', (data) => {
        console.log('🎵 Received playback_song_change event:', data);
        this.handleAuthenticatedEvent(socket, data, this.handleSongChange.bind(this));
      });

      // Handle request for current state (for dashboard initialization)
      socket.on('get_currently_playing', (data) => {
        console.log('🎵 Received get_currently_playing request from socket:', socket.id);
        // Emit directly to this socket with current state
        socket.emit('currently_playing_update', {
          currentlyPlaying: Array.from(this.playbackStates.values())
            .filter(state => !this.roomServiceSockets.has(state.socketId)) // Exclude room service sockets
            .map(state => ({
            user_id: state.userId,
            username: state.username,
            song_id: state.songId,
            song_title: state.songTitle,
            artist_name: state.artistName,
            artwork_path: state.artworkPath,
            current_time: state.currentTime,
            duration: state.duration,
            is_playing: state.isPlaying,
            is_paused: state.isPaused,
            is_idle: state.isIdle,
            progress: state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0,
            connection_id: state.connectionId,
            device_info: state.deviceInfo
          }))
        });
      });

      // Identify room service sockets (to exclude from "Currently Using")
      socket.on('identify_room_service', () => {
        console.log(`🎵 Marking socket ${socket.id} as room service connection (will be excluded from "Currently Using")`);
        this.roomServiceSockets.add(socket.id);
        // Remove from playbackStates if it was already added
        if (this.playbackStates.has(socket.id)) {
          this.playbackStates.delete(socket.id);
          console.log(`🎵 Removed room service socket ${socket.id} from playback tracking`);
          this.emitToAdmins();
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });
  }

  private async handleAuthenticatedEvent(
    socket: Socket,
    data: any,
    handler: (socket: AuthenticatedSocket, data: any) => Promise<void>
  ): Promise<void> {
    try {
      const user = await this.authenticateSocket(socket);
      if (!user) {
        console.warn('🎵 PlaybackTracker: Unauthenticated event rejected from socket:', socket.id);
        return;
      }

      console.log(`🎵 PlaybackTracker: Authenticated user ${user.username} for event`);
      const authSocket: AuthenticatedSocket = socket as AuthenticatedSocket;
      authSocket.user = user;

      await handler(authSocket, data);
    } catch (error) {
      console.error('🎵 PlaybackTracker: Error in authenticated event:', error);
    }
  }

  private async handleUserConnection(socket: Socket): Promise<void> {
    try {
      const user = await this.authenticateSocket(socket);
      if (!user) {
        console.warn('🎵 PlaybackTracker: Unauthenticated connection from socket:', socket.id);
        return;
      }

      console.log(`🎵 PlaybackTracker: User ${user.username} (ID: ${user.id}) connected via socket ${socket.id}`);

      // Parse device info from User-Agent
      const deviceInfo = this.parseDeviceInfo(socket.handshake.headers['user-agent']);
      console.log(`🎵 Device info: ${deviceInfo}`);

      // Check if this socket already has state (reconnection scenario)
      const existingState = this.playbackStates.get(socket.id);

      if (existingState) {
        // Socket is reconnecting - keep existing state
        console.log(`🎵 PlaybackTracker: Socket ${socket.id} reconnected - preserving existing state`);
        console.log('🎵 Existing state:', JSON.stringify(existingState, null, 2));
        existingState.lastUpdate = new Date();

        // Send current state back to the user so they can resume
        socket.emit('playback_state_restored', {
          songId: existingState.songId,
          currentTime: existingState.currentTime,
          duration: existingState.duration,
          isPlaying: existingState.isPlaying,
          isPaused: existingState.isPaused,
          isIdle: existingState.isIdle
        });
        console.log('🎵 Sent playback_state_restored to user');
      } else {
        // New connection - create new state (user can have multiple connections)
        console.log(`🎵 PlaybackTracker: New connection for ${user.username} - tracking as idle`);

        // Generate a unique connection ID (short random string for display)
        const connectionId = Math.random().toString(36).substring(2, 6).toUpperCase();

        const state: PlaybackState = {
          userId: user.id,
          username: user.username,
          songId: 0,
          songTitle: '',
          artistName: '',
          artworkPath: null,
          currentTime: 0,
          duration: 0,
          isPlaying: false,
          isPaused: false,
          lastUpdate: new Date(),
          socketId: socket.id,
          isIdle: true,
          connectionId,
          deviceInfo
        };

        this.playbackStates.set(socket.id, state);
        console.log(`🎵 Created new idle state for socket: ${socket.id} (Connection ID: ${connectionId}, Device: ${deviceInfo})`);
      }

      console.log('🎵 About to emit to admins with total states:', this.playbackStates.size);
      this.emitToAdmins();
      console.log('🎵 Finished emitting to admins');
    } catch (error) {
      console.error('🎵 PlaybackTracker: Error handling user connection:', error);
    }
  }

  private async authenticateSocket(socket: Socket): Promise<UserWithoutPassword | null> {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;

      if (!token) {
        console.warn('🎵 PlaybackTracker: No token in handshake');
        return null;
      }

      const decoded = jwt.verify(token, config.jwtSecret) as any;
      console.log('🎵 PlaybackTracker: Decoded token for user ID:', decoded.id);

      const userModel = new UserModel();
      const user = await userModel.findById(decoded.id);

      if (!user) {
        console.warn('🎵 PlaybackTracker: User not found for ID:', decoded.id);
        return null;
      }

      console.log('🎵 PlaybackTracker: Authenticated user:', user.username);
      return user;
    } catch (error) {
      console.error('🎵 PlaybackTracker: Authentication error:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  private async handlePlay(socket: AuthenticatedSocket, data: { songId: number; currentTime: number; duration: number }): Promise<void> {
    if (!socket.user) return;

    try {
      const songModel = new SongModel();
      const song = await songModel.findWithDetails(data.songId);

      if (!song) {
        console.error(`Song ${data.songId} not found`);
        return;
      }

      const existingState = this.playbackStates.get(socket.id);
      const connectionId = existingState?.connectionId || Math.random().toString(36).substring(2, 6).toUpperCase();
      const deviceInfo = existingState?.deviceInfo || this.parseDeviceInfo(socket.handshake.headers['user-agent']);

      const state: PlaybackState = {
        userId: socket.user.id,
        username: socket.user.username,
        songId: data.songId,
        songTitle: song.title,
        artistName: song.artist_name || 'Unknown Artist',
        artworkPath: song.artwork_path || null,
        currentTime: data.currentTime,
        duration: data.duration,
        isPlaying: true,
        isPaused: false,
        lastUpdate: new Date(),
        socketId: socket.id,
        isIdle: false,
        connectionId,
        deviceInfo
      };

      this.playbackStates.set(socket.id, state);
      this.emitToAdmins();

      console.log(`▶️ ${socket.user.username} (socket: ${socket.id}, ID: ${connectionId}, Device: ${deviceInfo}) is playing: ${song.title}`);
    } catch (error) {
      console.error('Error handling play event:', error);
    }
  }

  private async handlePause(socket: AuthenticatedSocket, data: { currentTime: number }): Promise<void> {
    if (!socket.user) return;

    const existingState = this.playbackStates.get(socket.id);
    if (!existingState) return;

    existingState.currentTime = data.currentTime;
    existingState.isPlaying = false;
    existingState.isPaused = true;
    existingState.lastUpdate = new Date();

    this.emitToAdmins();

    console.log(`⏸️ ${socket.user.username} (socket: ${socket.id}) paused: ${existingState.songTitle}`);
  }

  private async handleSeek(socket: AuthenticatedSocket, data: { currentTime: number }): Promise<void> {
    if (!socket.user) return;

    const existingState = this.playbackStates.get(socket.id);
    if (!existingState) return;

    existingState.currentTime = data.currentTime;
    existingState.lastUpdate = new Date();

    this.emitToAdmins();

    console.log(`⏭️ ${socket.user.username} (socket: ${socket.id}) seeked to ${data.currentTime}s in ${existingState.songTitle}`);
  }

  private async handleProgress(socket: AuthenticatedSocket, data: { currentTime: number }): Promise<void> {
    if (!socket.user) return;

    const existingState = this.playbackStates.get(socket.id);
    if (!existingState) return;

    existingState.currentTime = data.currentTime;
    existingState.lastUpdate = new Date();

    // Only emit progress updates every 5 seconds to reduce traffic
    if (existingState.isPlaying) {
      this.emitToAdmins();
    }
  }

  private async handleSongChange(socket: AuthenticatedSocket, data: { songId: number; currentTime: number; duration: number }): Promise<void> {
    if (!socket.user) return;

    try {
      const songModel = new SongModel();
      const song = await songModel.findWithDetails(data.songId);

      if (!song) {
        console.error(`Song ${data.songId} not found`);
        return;
      }

      const existingState = this.playbackStates.get(socket.id);
      const connectionId = existingState?.connectionId || Math.random().toString(36).substring(2, 6).toUpperCase();
      const deviceInfo = existingState?.deviceInfo || this.parseDeviceInfo(socket.handshake.headers['user-agent']);

      const state: PlaybackState = {
        userId: socket.user.id,
        username: socket.user.username,
        songId: data.songId,
        songTitle: song.title,
        artistName: song.artist_name || 'Unknown Artist',
        artworkPath: song.artwork_path || null,
        currentTime: data.currentTime,
        duration: data.duration,
        isPlaying: true,
        isPaused: false,
        lastUpdate: new Date(),
        socketId: socket.id,
        isIdle: false,
        connectionId,
        deviceInfo
      };

      this.playbackStates.set(socket.id, state);
      this.emitToAdmins();

      console.log(`🎵 ${socket.user.username} (socket: ${socket.id}, ID: ${connectionId}, Device: ${deviceInfo}) changed to: ${song.title}`);
    } catch (error) {
      console.error('Error handling song change event:', error);
    }
  }

  private handleDisconnect(socket: Socket): void {
    // Remove from room service sockets set if it was a room service connection
    if (this.roomServiceSockets.has(socket.id)) {
      console.log(`🎵 Room service socket ${socket.id} disconnected - removing from exclusion list`);
      this.roomServiceSockets.delete(socket.id);
      return; // Don't track room service sockets in playback states
    }

    // Remove playback state by socket ID immediately
    const state = this.playbackStates.get(socket.id);

    if (state) {
      console.log(`👋 ${state.username} (socket: ${socket.id}) disconnected - removing from tracking`);
      this.playbackStates.delete(socket.id);
      this.emitToAdmins();
    }
  }

  private emitToAdmins(): void {
    const currentlyPlaying = Array.from(this.playbackStates.values())
      .filter(state => !this.roomServiceSockets.has(state.socketId)) // Exclude room service sockets
      .map(state => ({
        user_id: state.userId,
        username: state.username,
        song_id: state.songId,
        song_title: state.songTitle,
        artist_name: state.artistName,
        artwork_path: state.artworkPath,
        current_time: state.currentTime,
        duration: state.duration,
        is_playing: state.isPlaying,
        is_paused: state.isPaused,
        is_idle: state.isIdle,
        progress: state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0,
        connection_id: state.connectionId,
        device_info: state.deviceInfo
      }));

    console.log(`🎵 Broadcasting currently_playing_update to admins. Count: ${currentlyPlaying.length}`);
    console.log('🎵 Data being sent:', JSON.stringify(currentlyPlaying, null, 2));
    // Broadcast to all connected admin users
    this.io.emit('currently_playing_update', { currentlyPlaying });
  }

  private startCleanupTimer(): void {
    setInterval(() => {
      const now = new Date();
      const toDelete: string[] = [];

      this.playbackStates.forEach((state, socketId) => {
        const timeSinceUpdate = now.getTime() - state.lastUpdate.getTime();
        if (timeSinceUpdate > this.STATE_TIMEOUT) {
          toDelete.push(socketId);
        }
      });

      toDelete.forEach(socketId => {
        const state = this.playbackStates.get(socketId);
        console.log(`🧹 Cleaning up stale playback state for ${state?.username} (socket: ${socketId})`);
        this.playbackStates.delete(socketId);
      });

      if (toDelete.length > 0) {
        this.emitToAdmins();
      }
    }, this.CLEANUP_INTERVAL);
  }

  // Public method to get current playback states (for API endpoint if needed)
  public getPlaybackStates(): PlaybackState[] {
    return Array.from(this.playbackStates.values());
  }
}

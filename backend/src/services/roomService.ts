import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { RoomModel, Room, RoomParticipant } from '../models/Room';
import { UserWithoutPassword, UserModel } from '../models/User';
import config from '../config/config';
import logger from '../utils/logger';

interface AuthenticatedSocket extends Socket {
  user?: UserWithoutPassword;
  currentRoom?: string;
}

interface RoomState {
  id: number;
  current_song_id?: number;
  current_position: number;
  is_playing: boolean;
  play_started_at?: Date;
  last_update: Date;
}

export interface PlaybackSyncEvent {
  type: 'play' | 'pause' | 'seek' | 'song_change';
  song_id?: number;
  position?: number;
  timestamp: number;
  user_id: number;
}

export interface ChatMessage {
  id: string;
  user_id: number;
  username: string;
  message: string;
  timestamp: number;
  type: 'chat' | 'system' | 'song_change';
}

export class RoomService {
  private io: Server;
  private roomStates: Map<number, RoomState> = new Map();
  private socketRooms: Map<string, string> = new Map(); // Track socket ID -> room mapping
  private roomParticipants: Map<number, Set<string>> = new Map(); // Track room ID -> socket IDs

  constructor(io: Server) {
    this.io = io;
    this.setupSocketHandlers();
  }

  // Broadcast active rooms update to all admin users
  private async broadcastActiveRoomsUpdate(): Promise<void> {
    try {
      // Get all rooms from database
      const db = await import('../config/database').then(m => m.Database.getInstance());
      const rooms = await db.query(`
        SELECT
          r.id,
          r.code,
          r.name,
          r.current_song_id,
          r.current_position,
          r.is_playing,
          r.created_at,
          COUNT(rp.user_id) as participant_count
        FROM listening_rooms r
        LEFT JOIN room_participants rp ON r.id = rp.room_id
        GROUP BY r.id
        HAVING participant_count > 0
        ORDER BY participant_count DESC
      `);

      // Import RoomModel
      const { RoomModel } = await import('../models/Room');

      // Get detailed participant info for each room
      const roomsWithParticipants = await Promise.all(
        rooms.map(async (room: any) => {
          const participants = await RoomModel.getParticipants(room.id);

          // Get song info if playing
          let songInfo = null;
          if (room.current_song_id) {
            const song = await db.query(`
              SELECT
                s.id,
                s.title,
                s.duration,
                GROUP_CONCAT(a.name, ', ') as artist_name,
                al.artwork_path
              FROM songs s
              JOIN song_artists sa ON s.id = sa.song_id
              JOIN artists a ON sa.artist_id = a.id
              LEFT JOIN albums al ON s.album_id = al.id
              WHERE s.id = ?
              GROUP BY s.id, al.artwork_path
            `, [room.current_song_id]);

            if (song.length > 0) {
              songInfo = song[0];
            }
          }

          return {
            id: room.id,
            code: room.code,
            name: room.name,
            current_song_id: room.current_song_id,
            current_position: room.current_position,
            is_playing: room.is_playing === 1,
            participant_count: room.participant_count,
            participants: participants.map((p: any) => ({
              user_id: p.user_id,
              username: p.username,
              role: p.role
            })),
            song_info: songInfo
          };
        })
      );

      this.io.emit('active_rooms_update', { activeRooms: roomsWithParticipants });
      logger.debug(`🎵 Broadcasted active_rooms_update. Count: ${roomsWithParticipants.length}`);
    } catch (error) {
      logger.error('Error broadcasting active rooms update:', error);
    }
  }

  // Get all active rooms with participants
  public getActiveRooms(): Array<{
    roomId: number;
    roomCode: string;
    roomName: string;
    isPlaying: boolean;
    currentSongId?: number;
    currentPosition: number;
    participantCount: number;
    participantSockets: string[];
  }> {
    const activeRooms: Array<{
      roomId: number;
      roomCode: string;
      roomName: string;
      isPlaying: boolean;
      currentSongId?: number;
      currentPosition: number;
      participantCount: number;
      participantSockets: string[];
    }> = [];

    this.roomStates.forEach((state, roomId) => {
      const participants = this.roomParticipants.get(roomId) || new Set();
      activeRooms.push({
        roomId: state.id,
        roomCode: '', // Will be filled by controller from RoomModel
        roomName: '', // Will be filled by controller from RoomModel
        isPlaying: state.is_playing,
        currentSongId: state.current_song_id,
        currentPosition: state.current_position,
        participantCount: participants.size,
        participantSockets: Array.from(participants)
      });
    });

    return activeRooms;
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.debug(`🎵 Socket ${socket.id} connected to room service`);

      // Join room
      socket.on('join_room', async (data: { roomCode: string }) => {
        const authSocket = await this.authenticateSocket(socket);
        if (authSocket) {
          await this.handleJoinRoom(authSocket, data.roomCode);
        }
      });

      // Leave room
      socket.on('leave_room', async () => {
        const authSocket = await this.authenticateSocket(socket);
        if (authSocket) {
          await this.handleLeaveRoom(authSocket);
        }
      });

      // Playback controls
      socket.on('room_play', async (data: { song_id?: number; position?: number }) => {
        const authSocket = await this.authenticateSocket(socket);
        if (authSocket) {
          await this.handlePlaybackControl(authSocket, 'play', data);
        }
      });

      socket.on('room_pause', async () => {
        const authSocket = await this.authenticateSocket(socket);
        if (authSocket) {
          await this.handlePlaybackControl(authSocket, 'pause', {});
        }
      });

      socket.on('room_seek', async (data: { position: number }) => {
        const authSocket = await this.authenticateSocket(socket);
        if (authSocket) {
          await this.handlePlaybackControl(authSocket, 'seek', data);
        }
      });

      socket.on('room_song_change', async (data: { song_id: number }) => {
        const authSocket = await this.authenticateSocket(socket);
        if (authSocket) {
          await this.handlePlaybackControl(authSocket, 'song_change', data);
        }
      });

      // Queue management
      socket.on('add_to_queue', async (data: { song_id: number }) => {
        const authSocket = await this.authenticateSocket(socket);
        if (authSocket) {
          await this.handleAddToQueue(authSocket, data.song_id);
        }
      });

      socket.on('add_to_queue_top', async (data: { song_id: number }) => {
        const authSocket = await this.authenticateSocket(socket);
        if (authSocket) {
          await this.handleAddToQueueTop(authSocket, data.song_id);
        }
      });

      socket.on('remove_from_queue', async (data: { queue_item_id: number }) => {
        const authSocket = await this.authenticateSocket(socket);
        if (authSocket) {
          await this.handleRemoveFromQueue(authSocket, data.queue_item_id);
        }
      });

      // Chat
      socket.on('room_chat', async (data: { message: string }) => {
        const authSocket = await this.authenticateSocket(socket);
        if (authSocket) {
          await this.handleChatMessage(authSocket, data.message);
        }
      });

      // Request room sync
      socket.on('request_sync', async () => {
        const authSocket = await this.authenticateSocket(socket);
        if (authSocket) {
          await this.sendRoomSync(authSocket);
        }
      });

      // Disconnect
      socket.on('disconnect', async () => {
        const room = this.socketRooms.get(socket.id);

        if (room) {
          // Try to authenticate and properly leave the room
          const authSocket = await this.authenticateSocket(socket);
          if (authSocket) {
            // Set currentRoom from our tracking
            authSocket.currentRoom = room;
            await this.handleLeaveRoom(authSocket);
          } else {
            // Authentication failed, but we can still clean up the database
            const roomId = parseInt(room.replace('room_', ''));
            try {
              // Remove participant from database without authentication
              const participants = await RoomModel.getParticipants(roomId);
              if (participants.length === 0) {
                await RoomModel.delete(roomId);
                this.roomStates.delete(roomId);
                logger.debug(`🎵 Room ${roomId} auto-deleted on disconnect (last participant)`);
              }
            } catch (error) {
              logger.error('Error cleaning up room on disconnect:', error);
            }
            // Remove from tracking
            this.socketRooms.delete(socket.id);
          }
        }

        logger.debug(`🎵 Socket ${socket.id} disconnected from room service`);
      });
    });
  }

  private async authenticateSocket(socket: Socket): Promise<AuthenticatedSocket | null> {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;

      if (!token) {
        logger.warn('🔍 Room Service: No token provided');
        return null;
      }

      const decoded = jwt.verify(token, config.jwtSecret) as any;

      const userModel = new UserModel();
      const user = await userModel.findById(decoded.id);

      if (!user) {
        logger.warn('🔍 Room Service: User not found');
        return null;
      }

      const authSocket = socket as AuthenticatedSocket;
      authSocket.user = user;
      return authSocket;
    } catch (error) {
      logger.error('🔍 Room Service: Authentication error:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  private async handleJoinRoom(socket: AuthenticatedSocket, roomCode: string): Promise<void> {
    try {
      if (!socket.user) return;

      const room = await RoomModel.findByCode(roomCode);
      if (!room) {
        socket.emit('room_error', { message: 'Room not found' });
        return;
      }

      // Check if room is full
      const participants = await RoomModel.getParticipants(room.id);
      if (participants.length >= room.max_listeners && !participants.some(p => p.user_id === socket.user!.id)) {
        socket.emit('room_error', { message: 'Room is full' });
        return;
      }

      // Leave current room if any
      if (socket.currentRoom) {
        await this.handleLeaveRoom(socket);
      }

      // Join the room
      await RoomModel.addParticipant(room.id, socket.user.id);
      socket.join(`room_${room.id}`);
      socket.currentRoom = `room_${room.id}`;

      // Track socket -> room mapping
      this.socketRooms.set(socket.id, `room_${room.id}`);

      // Track participant in room
      if (!this.roomParticipants.has(room.id)) {
        this.roomParticipants.set(room.id, new Set());
      }
      this.roomParticipants.get(room.id)!.add(socket.id);

      // Update room state if not exists
      if (!this.roomStates.has(room.id)) {
        this.roomStates.set(room.id, {
          id: room.id,
          current_song_id: room.current_song_id,
          current_position: room.current_position,
          is_playing: room.is_playing,
          play_started_at: room.play_started_at ? new Date(room.play_started_at) : undefined,
          last_update: new Date()
        });
      }

      // Send room data to the user
      const roomData = await this.getRoomData(room.id);
      socket.emit('room_joined', roomData);

      // Send sync state
      await this.sendRoomSync(socket);

      // Get updated participants list
      const updatedParticipants = await RoomModel.getParticipants(room.id);
      
      // Notify all participants (including the new one) about the updated participant list
      this.io.to(`room_${room.id}`).emit('participants_updated', {
        participants: updatedParticipants
      });
      
      // Notify other participants about the new user (for chat/toast)
      socket.to(`room_${room.id}`).emit('user_joined', {
        user: {
          id: socket.user.id,
          username: socket.user.username
        }
      });

      // Broadcast active rooms update to admins
      this.broadcastActiveRoomsUpdate();

      logger.debug(`🎵 User ${socket.user.username} joined room ${room.name} (${room.code})`);
    } catch (error) {
      logger.error('Error joining room:', error);
      socket.emit('room_error', { message: 'Failed to join room' });
    }
  }

  private async handleLeaveRoom(socket: AuthenticatedSocket): Promise<void> {
    try {
      if (!socket.user || !socket.currentRoom) return;

      const roomId = parseInt(socket.currentRoom.replace('room_', ''));
      
      // Remove from database
      await RoomModel.removeParticipant(roomId, socket.user.id);

      // Remove participant tracking
      const participants = this.roomParticipants.get(roomId);
      if (participants) {
        participants.delete(socket.id);
        if (participants.size === 0) {
          this.roomParticipants.delete(roomId);
        }
      }

      // Check if this was the last participant
      const remainingParticipants = await RoomModel.getParticipants(roomId);
      logger.debug(`🎵 After ${socket.user.username} left room ${roomId}, remaining participants: ${remainingParticipants.length}`);
      
      if (remainingParticipants.length === 0) {
        // This was the last person - delete the room
        try {
          await RoomModel.delete(roomId);

          // Remove room state
          this.roomStates.delete(roomId);

          // Broadcast active rooms update to admins (room was removed)
          this.broadcastActiveRoomsUpdate();

          logger.debug(`🎵 Room ${roomId} auto-deleted - last participant left`);
        } catch (deleteError) {
          logger.error(`🎵 Failed to auto-delete room ${roomId}:`, deleteError);
        }
      } else {
        // Notify all remaining participants about the updated participant list
        this.io.to(`room_${roomId}`).emit('participants_updated', {
          participants: remainingParticipants
        });

        // Notify other participants about the user leaving (for chat/toast)
        socket.to(socket.currentRoom).emit('user_left', {
          user: {
            id: socket.user.id,
            username: socket.user.username
          }
        });

        // Broadcast active rooms update to admins
        this.broadcastActiveRoomsUpdate();

        logger.debug(`🎵 Notified ${remainingParticipants.length} participants about ${socket.user.username} leaving room ${roomId}`);
      }
      
      // Leave socket room
      socket.leave(socket.currentRoom);
      socket.currentRoom = undefined;

      // Remove from socketRooms tracking
      this.socketRooms.delete(socket.id);

      logger.debug(`🎵 User ${socket.user.username} left room ${roomId}`);
    } catch (error) {
      logger.error('Error leaving room:', error);
    }
  }

  private async handlePlaybackControl(
    socket: AuthenticatedSocket, 
    type: PlaybackSyncEvent['type'], 
    data: any
  ): Promise<void> {
    try {
      if (!socket.user || !socket.currentRoom) return;

      const roomId = parseInt(socket.currentRoom.replace('room_', ''));
      const room = await RoomModel.findById(roomId);
      
      if (!room) return;

      // Check if user is host (only host can control playback)
      if (room.host_id !== socket.user.id) {
        socket.emit('room_error', { message: 'Only the host can control playback' });
        return;
      }

      const now = new Date();
      const timestamp = now.getTime();
      let roomState = this.roomStates.get(roomId);
      
      if (!roomState) {
        roomState = {
          id: roomId,
          current_song_id: room.current_song_id,
          current_position: room.current_position,
          is_playing: room.is_playing,
          play_started_at: room.play_started_at ? new Date(room.play_started_at) : undefined,
          last_update: now
        };
        this.roomStates.set(roomId, roomState);
      }

      // Calculate current position if playing
      if (roomState.is_playing && roomState.play_started_at) {
        const elapsedSeconds = (now.getTime() - roomState.play_started_at.getTime()) / 1000;
        roomState.current_position = Math.max(0, roomState.current_position + elapsedSeconds);
      }

      // Apply the control
      switch (type) {
        case 'play':
          if (data.song_id && data.song_id !== roomState.current_song_id) {
            roomState.current_song_id = data.song_id;
            roomState.current_position = 0;
          }
          if (data.position !== undefined) {
            roomState.current_position = data.position;
          }
          roomState.is_playing = true;
          roomState.play_started_at = now;
          break;
          
        case 'pause':
          roomState.is_playing = false;
          roomState.play_started_at = undefined;
          break;
          
        case 'seek':
          roomState.current_position = data.position;
          if (roomState.is_playing) {
            roomState.play_started_at = now;
          }
          break;
          
        case 'song_change':
          roomState.current_song_id = data.song_id;
          roomState.current_position = 0;
          roomState.is_playing = true;
          roomState.play_started_at = now;
          break;
      }

      roomState.last_update = now;

      // Update database
      await RoomModel.updatePlaybackState(roomId, {
        current_song_id: roomState.current_song_id,
        current_position: roomState.current_position,
        is_playing: roomState.is_playing,
        play_started_at: roomState.play_started_at?.toISOString()
      });

      // Broadcast to all room participants
      const syncEvent: PlaybackSyncEvent = {
        type,
        song_id: roomState.current_song_id,
        position: roomState.current_position,
        timestamp,
        user_id: socket.user.id
      };

      this.io.to(`room_${roomId}`).emit('playback_sync', syncEvent);

      // Update active rooms on dashboard
      await this.broadcastActiveRoomsUpdate();

      logger.debug(`🎵 Room ${roomId} playback control: ${type} by ${socket.user.username}`);
    } catch (error) {
      logger.error('Error handling playback control:', error);
      socket.emit('room_error', { message: 'Failed to control playback' });
    }
  }

  private async handleAddToQueue(socket: AuthenticatedSocket, songId: number): Promise<void> {
    try {
      if (!socket.user || !socket.currentRoom) return;

      const roomId = parseInt(socket.currentRoom.replace('room_', ''));
      
      await RoomModel.addToQueue(roomId, songId, socket.user.id);
      
      // Get updated queue
      const queue = await RoomModel.getQueue(roomId);
      
      // Broadcast updated queue to all participants
      this.io.to(`room_${roomId}`).emit('queue_updated', { queue });
      
      logger.debug(`🎵 Song ${songId} added to room ${roomId} queue by ${socket.user.username}`);
    } catch (error) {
      logger.error('Error adding to queue:', error);
      socket.emit('room_error', { message: 'Failed to add song to queue' });
    }
  }

  private async handleAddToQueueTop(socket: AuthenticatedSocket, songId: number): Promise<void> {
    try {
      if (!socket.user || !socket.currentRoom) return;

      const roomId = parseInt(socket.currentRoom.replace('room_', ''));
      
      await RoomModel.addToQueueTop(roomId, songId, socket.user.id);
      
      // Get updated queue
      const queue = await RoomModel.getQueue(roomId);
      
      // Broadcast updated queue to all participants
      this.io.to(`room_${roomId}`).emit('queue_updated', { queue });
      
      // Automatically play the song that was added to top
      await this.handlePlaybackControl(socket, 'song_change', { song_id: songId });
      
      logger.debug(`🎵 Song ${songId} added to TOP of room ${roomId} queue and playing by ${socket.user.username}`);
    } catch (error) {
      logger.error('Error adding to queue top:', error);
      socket.emit('room_error', { message: 'Failed to add song to queue' });
    }
  }

  private async handleRemoveFromQueue(socket: AuthenticatedSocket, queueItemId: number): Promise<void> {
    try {
      if (!socket.user || !socket.currentRoom) return;

      const roomId = parseInt(socket.currentRoom.replace('room_', ''));
      
      // Get the queue item to check permissions
      const queueItem = await RoomModel.getQueueItem(roomId, queueItemId);
      if (!queueItem) {
        socket.emit('room_error', { message: 'Queue item not found' });
        return;
      }
      
      // Get room to check if user is host
      const room = await RoomModel.findById(roomId);
      if (!room) {
        socket.emit('room_error', { message: 'Room not found' });
        return;
      }
      
      // Permission check: host can delete any item, users can only delete their own
      const isHost = room.host_id === socket.user.id;
      const isOwner = queueItem.added_by === socket.user.id;
      
      if (!isHost && !isOwner) {
        socket.emit('room_error', { message: 'You can only remove songs you added to the queue' });
        return;
      }
      
      await RoomModel.removeFromQueue(roomId, queueItemId);
      
      // Get updated queue
      const queue = await RoomModel.getQueue(roomId);
      
      // Broadcast updated queue to all participants
      this.io.to(`room_${roomId}`).emit('queue_updated', { queue });
      
      logger.debug(`🎵 Queue item ${queueItemId} removed from room ${roomId} by ${socket.user.username} (${isHost ? 'host' : 'owner'})`);
    } catch (error) {
      logger.error('Error removing from queue:', error);
      socket.emit('room_error', { message: 'Failed to remove song from queue' });
    }
  }

  private async handleChatMessage(socket: AuthenticatedSocket, message: string): Promise<void> {
    try {
      if (!socket.user || !socket.currentRoom) return;

      const roomId = parseInt(socket.currentRoom.replace('room_', ''));
      
      const chatMessage: ChatMessage = {
        id: `${Date.now()}_${socket.user.id}`,
        user_id: socket.user.id,
        username: socket.user.username,
        message: message.trim(),
        timestamp: Date.now(),
        type: 'chat'
      };

      // Broadcast to all room participants
      this.io.to(`room_${roomId}`).emit('room_chat', chatMessage);
      
      // TODO: Store in database if needed
    } catch (error) {
      logger.error('Error handling chat message:', error);
    }
  }

  private async sendRoomSync(socket: AuthenticatedSocket): Promise<void> {
    try {
      if (!socket.currentRoom) return;

      const roomId = parseInt(socket.currentRoom.replace('room_', ''));
      const roomState = this.roomStates.get(roomId);
      
      if (!roomState) return;

      const now = new Date();
      let currentPosition = roomState.current_position;
      
      // Calculate current position if playing
      if (roomState.is_playing && roomState.play_started_at) {
        const elapsedSeconds = (now.getTime() - roomState.play_started_at.getTime()) / 1000;
        currentPosition = Math.max(0, roomState.current_position + elapsedSeconds);
      }

      const syncEvent: PlaybackSyncEvent = {
        type: roomState.is_playing ? 'play' : 'pause',
        song_id: roomState.current_song_id,
        position: currentPosition,
        timestamp: now.getTime(),
        user_id: 0 // System sync
      };

      socket.emit('playback_sync', syncEvent);
    } catch (error) {
      logger.error('Error sending room sync:', error);
    }
  }

  private async getRoomData(roomId: number) {
    const room = await RoomModel.findById(roomId);
    const participants = await RoomModel.getParticipants(roomId);
    const queue = await RoomModel.getQueue(roomId);
    
    return {
      room,
      participants,
      queue
    };
  }

  // Periodic sync to keep rooms in sync
  startPeriodicSync(): void {
    setInterval(() => {
      this.roomStates.forEach(async (roomState, roomId) => {
        try {
          if (roomState.is_playing && roomState.play_started_at) {
            const now = new Date();
            const elapsedSeconds = (now.getTime() - roomState.play_started_at.getTime()) / 1000;
            const newPosition = roomState.current_position + elapsedSeconds;

            // Update database every 10 seconds during playback
            if (now.getTime() - roomState.last_update.getTime() > 10000) {
              await RoomModel.updatePlaybackState(roomId, {
                current_position: newPosition
              });
              roomState.current_position = newPosition;
              roomState.play_started_at = now;
              roomState.last_update = now;

              // Broadcast updated active rooms to dashboard
              await this.broadcastActiveRoomsUpdate();
            }
          }
        } catch (error) {
          logger.error('Error in periodic sync:', error);
        }
      });
    }, 5000); // Every 5 seconds
  }
}
import { Song } from '../types';
import { useRoomStore } from '../stores/roomStore';
import { usePlayerStore } from '../stores/playerStore';
import roomWebSocketService from '../services/roomService';
import toast from 'react-hot-toast';

/**
 * Unified playback handler that works both in room and solo mode
 * @param song - The song to play
 * @param songList - Optional list of songs to set as queue (only used in solo mode)
 */
export const handleRoomAwarePlayback = (song: Song, songList: Song[] = [song]) => {
  // Get room state
  const roomStore = useRoomStore.getState();
  const playerStore = usePlayerStore.getState();

  const isInRoom = roomStore.isInRoom();
  const isHost = roomStore.isHost();

  if (isInRoom) {
    if (isHost) {
      // Host: add to top of queue and auto-play for everyone
      roomWebSocketService.addToQueueTop(song.id);
      toast.success(`Playing "${song.title}" for everyone in the room`);

      // Host also plays locally
      playerStore.setQueue(songList, songList.findIndex(s => s.id === song.id));
      playerStore.play(song);

      // Send room play command to synchronize with other users
      // Use setTimeout to ensure the song has started loading locally first
      setTimeout(() => {
        roomWebSocketService.playRoom(song.id, 0);
      }, 100);
    } else {
      // Listeners: add to bottom of queue
      roomWebSocketService.addToQueue(song.id);
      toast.success(`Added "${song.title}" to room queue`);
    }
    return;
  }

  // Not in room: play locally
  playerStore.setQueue(songList, songList.findIndex(s => s.id === song.id));
  playerStore.play(song);
};

/**
 * Simplified version for cases where you don't need queue context
 */
export const playInRoom = (songId: number, songTitle: string) => {
  const roomStore = useRoomStore.getState();
  const isInRoom = roomStore.isInRoom();
  const isHost = roomStore.isHost();
  
  if (isInRoom) {
    if (isHost) {
      roomWebSocketService.addToQueueTop(songId);
      toast.success(`Playing "${songTitle}" for everyone in the room`);
      
      // Send room play command to synchronize with other users
      setTimeout(() => {
        roomWebSocketService.playRoom(songId, 0);
      }, 100);
    } else {
      roomWebSocketService.addToQueue(songId);
      toast.success(`Added "${songTitle}" to room queue`);
    }
    return true; // Handled in room
  }
  
  return false; // Not in room, caller should handle local playback
};

/**
 * Room-aware next song handler that works both in room and solo mode
 * When in a room, only the master host can remove the current song from the queue and play the next one
 * Regular hosts and listeners do nothing - only master host controls queue consumption
 */
export const handleRoomAwareNext = () => {
  const roomStore = useRoomStore.getState();
  const playerStore = usePlayerStore.getState();

  const isInRoom = roomStore.isInRoom();
  const isHost = roomStore.isHost();
  const isMasterHost = roomStore.isMasterHost();

  if (isInRoom) {
    if (isMasterHost) {
      // Host: remove current song from queue and play next song
      const currentSong = playerStore.currentSong;
      const currentQueueItem = roomStore.queue.find(item => item.song_id === currentSong?.id);

      if (currentQueueItem) {
        // Remove the current song from the queue
        try {
          roomWebSocketService.removeFromQueue(currentQueueItem.id);

          // Wait a bit for the queue to update, then check for next song
          setTimeout(() => {
            const updatedQueue = useRoomStore.getState().queue;

            if (updatedQueue.length > 0) {
              // Play the next song (which should now be at the top of the queue)
              const nextSong = updatedQueue[0];
              roomWebSocketService.changeSong(nextSong.song_id);
            } else {
              playerStore.pause();
            }
          }, 200); // Increased timeout to allow backend processing
        } catch (error) {
          console.error('Error removing song from queue:', error);
          // If removal failed, still try to play the next song without removing
          if (roomStore.queue.length > 1) {
            const nextSong = roomStore.queue[1]; // Skip current song
            roomWebSocketService.changeSong(nextSong.song_id);
          } else {
            playerStore.pause();
          }
        }
      } else {
        // If current song is not in queue but queue has items, play the first one
        if (roomStore.queue.length > 0) {
          const nextSong = roomStore.queue[0];
          roomWebSocketService.changeSong(nextSong.song_id);
        } else {
          playerStore.pause();
        }
      }
    }
    // Regular host and listeners do nothing - only master host controls queue consumption
  } else {
    // Not in room: use local next logic
    playerStore.next();
  }
};
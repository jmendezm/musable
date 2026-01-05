import { apiService } from '../services/api';

let heartbeatInterval: NodeJS.Timeout | null = null;
const HEARTBEAT_INTERVAL_MS = 15000; // 15 seconds

export const startHeartbeat = (songId: number, getCurrentTime: () => number) => {
  // Clear any existing heartbeat
  stopHeartbeat();

  // Send initial heartbeat immediately
  sendHeartbeat(songId, getCurrentTime());

  // Set up interval to send heartbeat every 15 seconds
  heartbeatInterval = setInterval(() => {
    sendHeartbeat(songId, getCurrentTime());
  }, HEARTBEAT_INTERVAL_MS);
};

export const stopHeartbeat = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
};

const sendHeartbeat = async (songId: number, currentTime: number) => {
  try {
    const durationPlayed = Math.floor(currentTime);
    await apiService.sendHeartbeat({
      songId,
      durationPlayed
    });
    console.log(`[Heartbeat] Sent for song ${songId}: ${durationPlayed}s`);
  } catch (error) {
    console.error('[Heartbeat] Failed to send heartbeat:', error);
  }
};

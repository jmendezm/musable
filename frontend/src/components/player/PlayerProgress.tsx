import React, { useRef, useState, useEffect } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useRoomStore } from '../../stores/roomStore';
import { useAuthStore } from '../../stores/authStore';
import roomWebSocketService from '../../services/roomService';

const PlayerProgress: React.FC = () => {
  const { currentTime, duration, seek } = usePlayerStore();
  const roomStore = useRoomStore();
  const { user } = useAuthStore();
  const progressRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<number | null>(null);

  // Check if user is in a room and their role
  const isInRoom = roomStore.isInRoom();
  const isHost = roomStore.isHost();

  const calculatePosition = (clientX: number): number => {
    if (!progressRef.current || !duration) return 0;

    const rect = progressRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    return percentage * duration;
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    // Only allow seeking if not in room or if host
    if (isInRoom && !isHost) return;

    setIsDragging(true);
    setDragPosition(calculatePosition(event.clientX));
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      setDragPosition(calculatePosition(event.clientX));
    }
  };

  const handleMouseUp = () => {
    if (isDragging && dragPosition !== null) {
      // Actually seek to the position
      seek(dragPosition);

      // Sync to room after drag completes (if host)
      if (isInRoom && isHost) {
        roomWebSocketService.seekRoom(dragPosition);
      }

      setIsDragging(false);
      setDragPosition(null);
    }
  };

  // Handle click (for non-drag interactions)
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return; // Don't handle click if we just finished dragging

    if (!progressRef.current || !duration) return;

    // Only allow seeking if not in room or if host
    if (isInRoom && !isHost) return;

    const seekTime = calculatePosition(event.clientX);
    seek(seekTime);

    if (isInRoom && isHost) {
      roomWebSocketService.seekRoom(seekTime);
    }
  };

  // Add global mouse event listeners for drag behavior
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setDragPosition(calculatePosition(e.clientX));
      }
    };

    const handleGlobalMouseUp = () => {
      handleMouseUp();
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, duration]);

  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Use drag position while dragging, otherwise use current time
  const displayTime = isDragging && dragPosition !== null ? dragPosition : currentTime;
  const progress = duration ? (displayTime / duration) * 100 : 0;

  return (
    <div className="w-full flex items-center space-x-3 mt-2">
      {/* Current time */}
      <span className="text-xs text-gray-400 w-10 text-right">
        {formatTime(displayTime)}
      </span>

      {/* Progress bar */}
      <div
        ref={progressRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        className={`flex-1 h-1 bg-gray-600 rounded-full group ${
          isInRoom && !isHost ? 'cursor-not-allowed' : 'cursor-pointer'
        }`}
        title={isInRoom && !isHost ? 'Only hosts can seek' : 'Click or drag to seek'}
      >
        <div
          className={`h-full bg-white rounded-full relative group-hover:bg-primary ${
            isDragging ? '' : 'transition-all'
          }`}
          style={{ width: `${progress}%` }}
        >
          <div className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Total duration */}
      <span className="text-xs text-gray-400 w-10">
        {formatTime(duration)}
      </span>
    </div>
  );
};

export default PlayerProgress;
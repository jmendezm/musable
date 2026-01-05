import React, { useState, useEffect, useRef } from 'react';
import { MusicalNoteIcon, ShareIcon, HeartIcon, PlusIcon, QueueListIcon } from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';
import { Song } from '../types';
import { apiService } from '../services/api';

interface SongMenuBottomSheetProps {
  isOpen: boolean;
  song: Song | null;
  onClose: () => void;
  favorites: Set<number>;
  onToggleFavorite: (song: Song) => void;
  onAddToQueue: (song: Song) => void;
  onAddToPlaylist?: (song: Song) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const SongMenuBottomSheet: React.FC<SongMenuBottomSheetProps> = ({
  isOpen,
  song,
  onClose,
  favorites,
  onToggleFavorite,
  onAddToQueue,
  onAddToPlaylist,
  showSuccess,
  showError
}) => {
  const [menuPosition, setMenuPosition] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const bottomSheetRef = useRef<HTMLDivElement>(null);

  // Reset state when menu opens
  useEffect(() => {
    if (isOpen) {
      setMenuPosition(0);
      setIsDragging(false);
    }
  }, [isOpen]);

  // Drag handlers for bottom sheet
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setStartY(e.touches[0].clientY);
    setCurrentY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const touchY = e.touches[0].clientY;
    const deltaY = touchY - startY;

    // Only allow dragging down
    if (deltaY > 0) {
      setCurrentY(touchY);
      setMenuPosition(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;

    const deltaY = currentY - startY;

    // If dragged down more than 100px, close the menu
    if (deltaY > 100) {
      onClose();
    }

    // Reset position
    setIsDragging(false);
    setMenuPosition(0);
    setCurrentY(0);
    setStartY(0);
  };

  const handleShare = async () => {
    if (!song) return;
    try {
      const response = await apiService.createShareToken(song.id);
      await navigator.clipboard.writeText(response.data.shareUrl);
      showSuccess('Share link copied to clipboard!');
      onClose();
    } catch (error: any) {
      // Check if public sharing is disabled
      if (error?.response?.data?.error?.includes('Public sharing is disabled') ||
          error?.message?.includes('Public sharing is disabled')) {
        // Fall back to internal link
        try {
          const baseUrl = window.location.origin;
          const internalUrl = song.album_id
            ? `${baseUrl}/album/${song.album_id}?song=${song.id}`
            : `${baseUrl}/song/${song.id}`;
          await navigator.clipboard.writeText(internalUrl);
          showSuccess('Internal link copied to clipboard!');
          onClose();
        } catch (clipboardError) {
          console.error('Failed to copy internal link:', clipboardError);
          showError('Failed to copy link');
        }
      } else {
        console.error('Failed to create share link:', error);
        showError('Failed to copy share link');
      }
    }
  };

  if (!isOpen || !song) return null;

  return (
    <>
      {/* Backdrop with animation */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden animate-fade-in"
        onClick={onClose}
      />

      {/* Bottom Sheet with animation and drag */}
      <div
        ref={bottomSheetRef}
        className="fixed bottom-0 left-0 right-0 bg-gray-800 rounded-t-2xl z-50 md:hidden animate-slide-up shadow-2xl"
        style={{
          transform: isDragging ? `translateY(${menuPosition}px)` : 'translateY(0)',
          transition: isDragging ? 'none' : 'transform 0.3s ease-out'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing">
          <div className="w-12 h-1.5 bg-gray-600 rounded-full" />
        </div>

        {/* Song Info Header */}
        <div className="flex items-center gap-4 p-4 border-b border-gray-700">
          {/* Album Artwork */}
          <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-700">
            {song.artwork_path ? (
              <img
                src={apiService.getArtworkUrl(song.artwork_path)}
                alt={song.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <MusicalNoteIcon className="w-8 h-8 text-gray-400" />
              </div>
            )}
          </div>

          {/* Song Details */}
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold truncate">{song.title}</h3>
            <p className="text-gray-400 text-sm truncate">{song.artist_name}</p>
            <p className="text-gray-500 text-xs truncate">{song.album_title}</p>
          </div>
        </div>

        {/* Menu Options */}
        <div className="p-2">
          <button
            onClick={handleShare}
            className="w-full flex items-center gap-4 px-4 py-3 text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ShareIcon className="w-5 h-5" />
            <span className="flex-1">Share</span>
          </button>

          <button
            onClick={() => {
              onToggleFavorite(song);
              onClose();
            }}
            className="w-full flex items-center gap-4 px-4 py-3 text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
          >
            {favorites.has(song.id) ? (
              <HeartIconSolid className="w-5 h-5 text-red-400" />
            ) : (
              <HeartIcon className="w-5 h-5" />
            )}
            <span className="flex-1">
              {favorites.has(song.id) ? 'Unlike song' : 'Like song'}
            </span>
          </button>

          <button
            onClick={() => {
              if (onAddToPlaylist) {
                onAddToPlaylist(song);
              } else {
                onClose();
                showSuccess('Add to playlist feature coming soon!');
              }
            }}
            className="w-full flex items-center gap-4 px-4 py-3 text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            <span className="flex-1">Add to playlist</span>
          </button>

          <button
            onClick={() => {
              onAddToQueue(song);
              onClose();
            }}
            className="w-full flex items-center gap-4 px-4 py-3 text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <QueueListIcon className="w-5 h-5" />
            <span className="flex-1">Add to Queue</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default SongMenuBottomSheet;

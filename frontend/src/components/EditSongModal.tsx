import React, { useState, useEffect, useRef } from 'react';
import { XMarkIcon, PhotoIcon, MusicalNoteIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Song } from '../types';
import { apiService } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { imageSearchExtensionManager, SearchImage } from '../services/imageSearchExtensions';

// Lazy import the ImageSearchModal component
const ImageSearchModal = React.lazy(() => import(
  /* webpackChunkName: "image-search-modal" */
  /* webpackMode: "lazy" */
  '../plugins/youtube/components/ImageSearchModal'
).catch(() => ({
  default: () => null // Fallback if plugin doesn't exist
})));

interface EditSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: Song | null;
  onSongUpdated?: (updatedSong: Song) => void;
}

interface EditSongData {
  title: string;
  artist_name: string;
  album_title: string;
  year: number | null;
  genre: string;
  artwork: File | Blob | string | null;
  artworkChanged: boolean;
}

const EditSongModal: React.FC<EditSongModalProps> = ({
  isOpen,
  onClose,
  song,
  onSongUpdated
}) => {
  const { showSuccess, showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isImageSearchOpen, setIsImageSearchOpen] = useState(false);

  const [formData, setFormData] = useState<EditSongData>({
    title: '',
    artist_name: '',
    album_title: '',
    year: null,
    genre: '',
    artwork: null,
    artworkChanged: false
  });

  // Initialize form data when song changes
  useEffect(() => {
    if (song) {
      setFormData({
        title: song.title || '',
        artist_name: song.artist_name || '',
        album_title: song.album_title || '',
        year: song.year || null,
        genre: song.genre || '',
        artwork: null,
        artworkChanged: false  // Reset to false when loading song
      });
      // Set preview to existing artwork if available
      if (song.artwork_path) {
        setPreviewUrl(apiService.getArtworkUrl(song.artwork_path));
      } else {
        setPreviewUrl(null);
      }
    }
  }, [song]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        title: '',
        artist_name: '',
        album_title: '',
        year: null,
        genre: '',
        artwork: null,
        artworkChanged: false
      });
      setPreviewUrl(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleInputChange = (field: keyof EditSongData, value: string | number | null) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleArtworkChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        showError('Please select a valid image file');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        showError('Image file must be smaller than 5MB');
        return;
      }

      setFormData(prev => ({ ...prev, artwork: file, artworkChanged: true }));

      // Create preview URL
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveArtwork = () => {
    setFormData(prev => ({ ...prev, artwork: null, artworkChanged: true }));
    setPreviewUrl(song?.artwork_path ? apiService.getArtworkUrl(song.artwork_path) : null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImageSearchSelect = async (imageBlob: Blob, imageUrl: string) => {
    // Convert blob to File
    const file = new File([imageBlob], 'artwork.jpg', { type: 'image/jpeg' });

    setFormData(prev => ({ ...prev, artwork: file, artworkChanged: true }));

    // Create preview URL from blob
    setPreviewUrl(URL.createObjectURL(imageBlob));

    showSuccess('Artwork selected from search');
  };

  const handleOpenImageSearch = () => {
    if (!imageSearchExtensionManager.hasExtensions()) {
      showError('No image search plugins available. Install a plugin like YouTube to enable this feature.');
      return;
    }
    setIsImageSearchOpen(true);
  };

  const getImageSearchQuery = () => {
    if (!song) return '';
    const parts = [];
    if (song.artist_name) parts.push(song.artist_name);
    if (song.album_title) parts.push(song.album_title);
    return parts.join(' ');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!song) return;

    // Basic validation
    if (!formData.title.trim()) {
      showError('Song title is required');
      return;
    }

    setIsLoading(true);

    try {
      let artworkData: string | null | undefined = undefined;

      // Only process artwork if it was explicitly changed
      if (formData.artworkChanged) {
        // Convert artwork File/Blob to base64 if present
        if (formData.artwork instanceof File) {
          artworkData = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(formData.artwork as File);
          });
        } else if (formData.artwork === null) {
          // Explicitly remove artwork
          artworkData = null;
        } else if (formData.artwork && typeof formData.artwork === 'object') {
          // Handle Blob (or File that wasn't caught by instanceof check)
          const blob = formData.artwork as Blob;
          artworkData = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      }

      const updateData = {
        title: formData.title.trim(),
        artist_name: formData.artist_name.trim(),
        album_title: formData.album_title.trim(),
        genre: formData.genre.trim(),
        year: formData.year || null
      };

      // Only add artwork to update data if it was changed
      if (artworkData !== undefined) {
        (updateData as any).artwork = artworkData;
      }

      const response = await apiService.updateSong(song.id, updateData);

      if (response.success) {
        showSuccess('Song updated successfully');
        onSongUpdated?.(response.data);
        onClose();
      } else {
        const errorMessage = typeof response.error === 'string'
          ? response.error
          : response.error?.message || 'Failed to update song';
        showError(errorMessage);
      }
    } catch (error) {
      console.error('Error updating song:', error);
      showError('Failed to update song. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Edit Song</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            disabled={isLoading}
          >
            <XMarkIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Artwork Section */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Album Artwork
            </label>
            <div className="flex items-center gap-4">
              {/* Artwork Preview */}
              <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-700 flex-shrink-0">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Artwork preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <MusicalNoteIcon className="w-8 h-8 text-gray-400" />
                  </div>
                )}
              </div>

              {/* Artwork Controls */}
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                    disabled={isLoading}
                  >
                    <PhotoIcon className="w-4 h-4" />
                    Upload
                  </button>
                  {imageSearchExtensionManager.hasExtensions() && (
                    <button
                      type="button"
                      onClick={handleOpenImageSearch}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
                      disabled={isLoading}
                      title="Search online for artwork"
                    >
                      <MagnifyingGlassIcon className="w-4 h-4" />
                      Search Online
                    </button>
                  )}
                </div>
                
                {(formData.artwork || previewUrl) && (
                  <button
                    type="button"
                    onClick={handleRemoveArtwork}
                    className="w-full px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg transition-colors"
                    disabled={isLoading}
                  >
                    Remove
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleArtworkChange}
                  className="hidden"
                />
                
                <p className="text-xs text-gray-400">
                  JPG, PNG or GIF. Max 5MB.
                </p>
              </div>
            </div>
          </div>

          {/* Song Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Song Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="Enter song title"
              required
              disabled={isLoading}
            />
          </div>

          {/* Artist Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Artist
            </label>
            <input
              type="text"
              value={formData.artist_name}
              onChange={(e) => handleInputChange('artist_name', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="Enter artist name"
              disabled={isLoading}
            />
          </div>

          {/* Album Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Album
            </label>
            <input
              type="text"
              value={formData.album_title}
              onChange={(e) => handleInputChange('album_title', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="Enter album title"
              disabled={isLoading}
            />
          </div>

          {/* Release Year and Genre Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Year
              </label>
              <input
                type="number"
                min="1900"
                max={new Date().getFullYear() + 5}
                value={formData.year || ''}
                onChange={(e) => handleInputChange('year', e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="2024"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Genre
              </label>
              <input
                type="text"
                value={formData.genre}
                onChange={(e) => handleInputChange('genre', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Pop, Rock, etc."
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary hover:bg-secondary text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>

        {/* Image Search Modal */}
        {isImageSearchOpen && (
          <React.Suspense fallback={null}>
            <ImageSearchModal
              isOpen={isImageSearchOpen}
              onClose={() => setIsImageSearchOpen(false)}
              onImageSelect={handleImageSearchSelect}
              initialQuery={getImageSearchQuery()}
            />
          </React.Suspense>
        )}
      </div>
    </div>
  );
};

export default EditSongModal;
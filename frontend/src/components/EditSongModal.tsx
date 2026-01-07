import React, { useState, useEffect, useRef } from 'react';
import { XMarkIcon, PhotoIcon, MusicalNoteIcon, MagnifyingGlassIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { Song } from '../types';
import { apiService } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { imageSearchExtensionManager } from '../services/imageSearchExtensions';

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
  const [ImageSearchModalComponent, setImageSearchModalComponent] = useState<React.ComponentType<any> | null>(null);

  // Autocomplete states
  const [artistSearchResults, setArtistSearchResults] = useState<Array<{ id: number; name: string }>>([]);
  const [albumSearchResults, setAlbumSearchResults] = useState<Array<{ id: number; title: string; artist_name?: string }>>([]);
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const [showAlbumDropdown, setShowAlbumDropdown] = useState(false);
  const [artistSelectedIndex, setArtistSelectedIndex] = useState(-1);
  const [albumSelectedIndex, setAlbumSelectedIndex] = useState(-1);
  const artistDropdownRef = useRef<HTMLDivElement>(null);
  const albumDropdownRef = useRef<HTMLDivElement>(null);

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

  // Dynamically load ImageSearchModal from any available plugin
  useEffect(() => {
    // Get the modal component from any registered image search extension
    const ModalComponent = imageSearchExtensionManager.getModalComponent();
    if (ModalComponent) {
      setImageSearchModalComponent(() => ModalComponent);
    }
  }, []);

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
      setShowArtistDropdown(false);
      setShowAlbumDropdown(false);
      setArtistSearchResults([]);
      setAlbumSearchResults([]);
    }
  }, [isOpen]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (artistDropdownRef.current && !artistDropdownRef.current.contains(event.target as Node)) {
        setShowArtistDropdown(false);
        setArtistSelectedIndex(-1);
      }
      if (albumDropdownRef.current && !albumDropdownRef.current.contains(event.target as Node)) {
        setShowAlbumDropdown(false);
        setAlbumSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search artists with debounce
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (formData.artist_name.trim().length > 0) {
        try {
          const response = await apiService.request('GET', `/admin/artists?search=${encodeURIComponent(formData.artist_name)}`) as {
            data: { artists: Array<{ id: number; name: string }> }
          };
          setArtistSearchResults(response.data.artists || []);
          setShowArtistDropdown(response.data.artists && response.data.artists.length > 0);
          setArtistSelectedIndex(-1);
        } catch (error) {
          console.error('Error searching artists:', error);
        }
      } else {
        setArtistSearchResults([]);
        setShowArtistDropdown(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [formData.artist_name]);

  // Search albums with debounce
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (formData.album_title.trim().length > 0) {
        try {
          const response = await apiService.request('GET', `/admin/albums?search=${encodeURIComponent(formData.album_title)}`) as {
            data: { albums: Array<{ id: number; title: string; artist_name?: string }> }
          };
          setAlbumSearchResults(response.data.albums || []);
          setShowAlbumDropdown(response.data.albums && response.data.albums.length > 0);
          setAlbumSelectedIndex(-1);
        } catch (error) {
          console.error('Error searching albums:', error);
        }
      } else {
        setAlbumSearchResults([]);
        setShowAlbumDropdown(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [formData.album_title]);

  const handleInputChange = (field: keyof EditSongData, value: string | number | null) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle keyboard navigation for artist dropdown
  const handleArtistKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showArtistDropdown || artistSearchResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setArtistSelectedIndex(prev =>
          prev < artistSearchResults.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setArtistSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (artistSelectedIndex >= 0 && artistSearchResults[artistSelectedIndex]) {
          handleSelectArtist(artistSearchResults[artistSelectedIndex]);
        }
        break;
      case 'Escape':
        setShowArtistDropdown(false);
        setArtistSelectedIndex(-1);
        break;
    }
  };

  // Handle keyboard navigation for album dropdown
  const handleAlbumKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showAlbumDropdown || albumSearchResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setAlbumSelectedIndex(prev =>
          prev < albumSearchResults.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setAlbumSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (albumSelectedIndex >= 0 && albumSearchResults[albumSelectedIndex]) {
          handleSelectAlbum(albumSearchResults[albumSelectedIndex]);
        }
        break;
      case 'Escape':
        setShowAlbumDropdown(false);
        setAlbumSelectedIndex(-1);
        break;
    }
  };

  const handleSelectArtist = (artist: { id: number; name: string }) => {
    setFormData(prev => ({ ...prev, artist_name: artist.name }));
    setShowArtistDropdown(false);
    setArtistSelectedIndex(-1);
  };

  const handleSelectAlbum = (album: { id: number; title: string; artist_name?: string }) => {
    setFormData(prev => ({ ...prev, album_title: album.title }));
    setShowAlbumDropdown(false);
    setAlbumSelectedIndex(-1);
  };

  const handleArtistFocus = () => {
    if (artistSearchResults.length > 0) {
      setShowArtistDropdown(true);
    }
  };

  const handleAlbumFocus = () => {
    if (albumSearchResults.length > 0) {
      setShowAlbumDropdown(true);
    }
  };

  const handleArtistBlur = () => {
    // Delay to allow click events on dropdown items to process
    setTimeout(() => {
      setShowArtistDropdown(false);
      setArtistSelectedIndex(-1);
    }, 200);
  };

  const handleAlbumBlur = () => {
    // Delay to allow click events on dropdown items to process
    setTimeout(() => {
      setShowAlbumDropdown(false);
      setAlbumSelectedIndex(-1);
    }, 200);
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
    if (!ImageSearchModalComponent) {
      showError('Image search modal is not available. Please install a plugin that provides image search functionality.');
      return;
    }
    if (!imageSearchExtensionManager.hasExtensions()) {
      showError('No image search extensions available.');
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
          <div ref={artistDropdownRef} className="relative">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Artist
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.artist_name}
                onChange={(e) => handleInputChange('artist_name', e.target.value)}
                onKeyDown={handleArtistKeyDown}
                onFocus={handleArtistFocus}
                onBlur={handleArtistBlur}
                className="w-full px-3 py-2 pr-10 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Enter artist name"
                disabled={isLoading}
                autoComplete="off"
              />
              {artistSearchResults.length > 0 && (
                <ChevronDownIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              )}
            </div>

            {/* Artist Dropdown */}
            {showArtistDropdown && artistSearchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {artistSearchResults.map((artist, index) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => handleSelectArtist(artist)}
                    onMouseDown={(e) => e.preventDefault()} // Prevent blur from closing dropdown before click
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      index === artistSelectedIndex
                        ? 'bg-primary text-white'
                        : 'text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {artist.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Album Title */}
          <div ref={albumDropdownRef} className="relative">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Album
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.album_title}
                onChange={(e) => handleInputChange('album_title', e.target.value)}
                onKeyDown={handleAlbumKeyDown}
                onFocus={handleAlbumFocus}
                onBlur={handleAlbumBlur}
                className="w-full px-3 py-2 pr-10 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Enter album title"
                disabled={isLoading}
                autoComplete="off"
              />
              {albumSearchResults.length > 0 && (
                <ChevronDownIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              )}
            </div>

            {/* Album Dropdown */}
            {showAlbumDropdown && albumSearchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {albumSearchResults.map((album, index) => (
                  <button
                    key={album.id}
                    type="button"
                    onClick={() => handleSelectAlbum(album)}
                    onMouseDown={(e) => e.preventDefault()} // Prevent blur from closing dropdown before click
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      index === albumSelectedIndex
                        ? 'bg-primary text-white'
                        : 'text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <div>
                      <div className="font-medium">{album.title}</div>
                      {album.artist_name && (
                        <div className="text-xs text-gray-400">{album.artist_name}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
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

        {/* Image Search Modal - dynamically loaded if plugin is available */}
        {isImageSearchOpen && ImageSearchModalComponent && (
          <ImageSearchModalComponent
            isOpen={isImageSearchOpen}
            onClose={() => setIsImageSearchOpen(false)}
            onImageSelect={handleImageSearchSelect}
            initialQuery={getImageSearchQuery()}
          />
        )}
      </div>
    </div>
  );
};

export default EditSongModal;
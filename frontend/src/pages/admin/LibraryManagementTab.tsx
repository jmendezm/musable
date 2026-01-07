import React, { useEffect, useState, useRef } from 'react';
import {
  MusicalNoteIcon,
  FolderIcon,
  PlusIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  PencilIcon,
  XCircleIcon,
  DocumentTextIcon,
  ClockIcon,
  XCircleIcon as XCircleIconSolid,
  DocumentDuplicateIcon,
  ArrowUpTrayIcon
} from '@heroicons/react/24/outline';
import { apiService } from '../../services/api';
import { Song, ScanProgress, ArtistSplitIgnoreFilter } from '../../types';
import clsx from 'clsx';
import EditSongModal from '../../components/EditSongModal';
import ScanReportModal from '../../components/ScanReportModal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';
import { getBackendUrl } from '../../config/config';

type LibrarySubTab = 'overview' | 'duplicates' | 'artist-images' | 'artist-splitting' | 'jobs';

interface DuplicateGroup {
  title: string;
  artist: string;
  songs: Song[];
}

interface LibraryPath {
  id: number;
  path: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  latest_scan?: {
    id: number;
    status: 'running' | 'completed' | 'failed' | 'stopped';
    started_at: string;
    files_scanned: number;
    files_added: number;
    files_updated: number;
    files_skipped: number;
    errors_count: number;
    progress: number;
  };
}

// Artist Images Tab Component
interface Artist {
  id: number;
  name: string;
  image_path?: string;
}

interface ArtistImagesTabContentProps {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const ArtistImagesTabContent: React.FC<ArtistImagesTabContentProps> = ({
  showSuccess,
  showError
}) => {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [filteredArtists, setFilteredArtists] = useState<Artist[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [artistSearchQuery, setArtistSearchQuery] = useState('');
  const [imageResults, setImageResults] = useState<any[]>([]);
  const [searchingImages, setSearchingImages] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pagination for artists
  const [currentPage, setCurrentPage] = useState(1);
  const artistsPerPage = 50;

  // Image crop modal
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState('');
  const [cropArea, setCropArea] = useState({ x: 0, y: 0, size: 200 });
  const [zoom, setZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(3);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const imageCanvasRef = useRef<HTMLDivElement>(null);

  // Fetch artists on mount
  useEffect(() => {
    fetchArtists();
  }, []);

  // Filter artists based on search
  useEffect(() => {
    if (artistSearchQuery) {
      const filtered = artists.filter(artist =>
        artist.name.toLowerCase().includes(artistSearchQuery.toLowerCase())
      );
      setFilteredArtists(filtered);
      setCurrentPage(1); // Reset to page 1 when searching
    } else {
      setFilteredArtists(artists);
    }
  }, [artistSearchQuery, artists]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredArtists.length / artistsPerPage);
  const startIndex = (currentPage - 1) * artistsPerPage;
  const endIndex = startIndex + artistsPerPage;
  const displayedArtists = filteredArtists.slice(startIndex, endIndex);

  const fetchArtists = async () => {
    try {
      const response = await apiService.request('GET', '/admin/artists') as {
        data: { artists: Artist[] }
      };
      setArtists(response.data.artists);
      setFilteredArtists(response.data.artists);
    } catch (err: any) {
      console.error('Failed to fetch artists:', err);
      showError(err.message || 'Failed to fetch artists');
    }
  };

  const searchArtistImages = async (query: string) => {
    if (!query.trim()) {
      showError('Please enter a search term');
      return;
    }

    try {
      setSearchingImages(true);
      const response = await apiService.request('GET', `/admin/artists/search-images?artistName=${encodeURIComponent(query)}`) as {
        data: { results: any[] }
      };
      setImageResults(response.data.results);
    } catch (err: any) {
      console.error('Failed to search artist images:', err);
      showError(err.message || 'Failed to search artist images');
    } finally {
      setSearchingImages(false);
    }
  };

  const handleArtistSelect = (artist: Artist) => {
    setSelectedArtist(artist);
    // Set the search query to artist name and auto-search
    setSearchQuery(artist.name);
    setImageResults([]); // Clear previous results
    // Auto-search for images
    searchArtistImages(artist.name);
  };

  const openCropModal = (imageUrl: string) => {
    setSelectedImageUrl(imageUrl);
    setCropModalOpen(true);
    setZoom(1);
    setCropArea({ x: 0, y: 0, size: 200 });

    // Load image to get dimensions
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      // Center crop area
      const minDimension = Math.min(img.width, img.height);
      setCropArea({
        x: (img.width - minDimension) / 2,
        y: (img.height - minDimension) / 2,
        size: minDimension
      });
      // Calculate max zoom: allow zooming in until we'd sample less than 50px
      const maxZoomValue = Math.min(minDimension / 50, 5); // Cap at 5x for usability
      setMaxZoom(maxZoomValue);
    };
    img.src = imageUrl;
  };

  const handleCropAndSave = async () => {
    if (!selectedArtist || !selectedImageUrl) return;

    try {
      setSavingImage(true);

      // Send image URL and crop data to backend
      const response = await apiService.request('POST', `/admin/artists/${selectedArtist.id}/crop`, {
        imageUrl: selectedImageUrl,
        cropArea: cropArea,
        zoom: zoom
      });

      if (response.success) {
        showSuccess('Artist image cropped and saved successfully');
        setCropModalOpen(false);
        await fetchArtists();

        // Refresh selected artist
        const updatedArtists = await apiService.request('GET', '/admin/artists') as {
          data: { artists: Artist[] }
        };
        const updated = updatedArtists.data.artists.find(a => a.id === selectedArtist.id);
        if (updated) {
          setSelectedArtist(updated);
        }
      }
    } catch (err: any) {
      console.error('Failed to crop and save image:', err);
      showError(err.message || 'Failed to crop and save image');
    } finally {
      setSavingImage(false);
    }
  };

  const handleImageClick = (imageUrl: string) => {
    openCropModal(imageUrl);
  };

  const handleSaveImage = async (imageUrl: string) => {
    if (!selectedArtist) return;

    try {
      setSavingImage(true);
      await apiService.request('POST', `/admin/artists/${selectedArtist.id}/image`, {
        imageUrl
      });
      showSuccess('Artist image saved successfully');
      // Refresh artists to show updated image
      await fetchArtists();
      // Refresh selected artist
      const updatedArtists = await apiService.request('GET', '/admin/artists') as {
        data: { artists: Artist[] }
      };
      const updated = updatedArtists.data.artists.find(a => a.id === selectedArtist.id);
      if (updated) {
        setSelectedArtist(updated);
      }
    } catch (err: any) {
      console.error('Failed to save artist image:', err);
      showError(err.message || 'Failed to save artist image');
    } finally {
      setSavingImage(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !selectedArtist) return;

    try {
      setUploadingImage(true);
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`/api/admin/artists/${selectedArtist.id}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to upload image');
      }

      showSuccess('Artist image uploaded successfully');
      // Refresh artists
      await fetchArtists();
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error('Failed to upload artist image:', err);
      showError(err.message || 'Failed to upload artist image');
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Select Artist */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-white font-semibold mb-4 flex items-center">
          <MusicalNoteIcon className="w-5 h-5 mr-2" />
          Select Artist
        </h3>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={artistSearchQuery}
              onChange={(e) => setArtistSearchQuery(e.target.value)}
              placeholder="Search artists..."
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary"
            />
          </div>

          {/* Artist Grid with Pagination */}
          <div className="space-y-4">
            <div className="grid grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
              {displayedArtists.map(artist => (
                <div key={artist.id} className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => handleArtistSelect(artist)}
                    className={clsx(
                      'w-full rounded-lg overflow-hidden transition-all hover:scale-105 relative',
                      selectedArtist?.id === artist.id
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-gray-800'
                        : 'hover:ring-2 hover:ring-gray-600'
                    )}
                    style={{ paddingBottom: '100%' }}
                  >
                    <div className="absolute inset-0">
                      {artist.image_path ? (
                        <img
                          src={`${getBackendUrl()}/${artist.image_path}`}
                          alt={artist.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                          <MusicalNoteIcon className="w-8 h-8 text-gray-500" />
                        </div>
                      )}
                      {selectedArtist?.id === artist.id && (
                        <div className="absolute inset-0 bg-primary bg-opacity-30 flex items-center justify-center">
                          <CheckCircleIcon className="w-8 h-8 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                  <p className="text-xs text-gray-400 text-center break-words px-1" title={artist.name}>
                    {artist.name}
                  </p>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                <div className="text-sm text-gray-400">
                  Page {currentPage} of {totalPages} ({filteredArtists.length} artists)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setCurrentPage(Math.max(1, currentPage - 1));
                    }}
                    disabled={currentPage === 1}
                    className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    Previous
                  </button>

                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage(pageNum);
                          }}
                          className={clsx(
                            'px-3 py-1 rounded text-sm',
                            currentPage === pageNum
                              ? 'bg-primary text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          )}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setCurrentPage(Math.min(totalPages, currentPage + 1));
                    }}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image Search Results */}
      {selectedArtist && (
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold flex items-center">
              <DocumentDuplicateIcon className="w-5 h-5 mr-2" />
              Images for "{selectedArtist.name}"
            </h3>

            {/* Upload Button */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
              >
                {uploadingImage ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <ArrowUpTrayIcon className="w-4 h-4" />
                    Upload Image
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Current Image */}
          {selectedArtist.image_path && (
            <div className="mb-4 p-4 bg-gray-700 rounded-lg">
              <p className="text-gray-400 text-sm mb-2">Current image:</p>
              <img
                src={`${getBackendUrl()}/${selectedArtist.image_path}`}
                alt={selectedArtist.name}
                className="w-24 h-24 rounded-lg object-cover"
              />
            </div>
          )}

          {/* Search Box */}
          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  searchArtistImages(searchQuery);
                }
              }}
              placeholder="Search for images..."
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => searchArtistImages(searchQuery)}
              disabled={searchingImages}
              className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {searchingImages ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Searching...
                </>
              ) : (
                <>
                  <MagnifyingGlassIcon className="w-4 h-4" />
                  Search
                </>
              )}
            </button>
          </div>

          {/* Search Loading */}
          {searchingImages && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <span className="ml-3 text-gray-400">Searching for images...</span>
            </div>
          )}

          {/* Image Results Grid */}
          {!searchingImages && imageResults.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {imageResults.map((image, index) => (
                <div
                  key={index}
                  className="group relative aspect-square rounded-lg overflow-hidden bg-gray-700 cursor-pointer"
                  onClick={() => handleImageClick(image.url)}
                >
                  <img
                    src={image.url}
                    alt={`Result ${index + 1}`}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center">
                    <CheckCircleIcon className="w-12 h-12 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No Results */}
          {!searchingImages && imageResults.length === 0 && (
            <div className="text-center py-8">
              <DocumentDuplicateIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">
                {searchQuery
                  ? 'No images found. Try a different search term or upload a custom image.'
                  : 'Enter a search term above or upload a custom image.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Image Crop Modal */}
      {cropModalOpen && selectedImageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">Crop Image</h3>
              <button
                type="button"
                onClick={() => setCropModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <XCircleIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Image Canvas with Crop Area */}
            <div className="mb-4 flex justify-center">
              <div
                ref={imageCanvasRef}
                className="relative border-2 border-gray-600 rounded overflow-hidden"
                style={{
                  maxWidth: '100%',
                  maxHeight: '400px'
                }}
              >
                <img
                  src={selectedImageUrl}
                  alt="To crop"
                  className="block"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '400px'
                  }}
                />

                {/* Crop Area Overlay */}
                <div
                  className="absolute border-2 border-white shadow-lg box-content"
                  style={{
                    left: `${(cropArea.x / imageSize.width) * 100}%`,
                    top: `${(cropArea.y / imageSize.height) * 100}%`,
                    width: `${((cropArea.size / zoom) / imageSize.width) * 100}%`,
                    height: `${((cropArea.size / zoom) / imageSize.height) * 100}%`,
                    cursor: 'move',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)'
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startCropArea = { ...cropArea };

                    const handleMouseMove = (moveEvent: MouseEvent) => {
                      const deltaX = moveEvent.clientX - startX;
                      const deltaY = moveEvent.clientY - startY;

                      // Get the current displayed element for proper scaling
                      const target = e.target as HTMLElement;
                      const imageRect = target.parentElement?.getBoundingClientRect();
                      if (!imageRect) return;

                      const scaleX = imageSize.width / imageRect.width;
                      const scaleY = imageSize.height / imageRect.height;

                      // Calculate new position with proper scaling
                      let newX = startCropArea.x + deltaX * scaleX;
                      let newY = startCropArea.y + deltaY * scaleY;

                      // Constrain to image bounds (accounting for zoom)
                      const maxDimension = Math.min(imageSize.width, imageSize.height);
                      const effectiveSize = cropArea.size / zoom;

                      newX = Math.max(0, Math.min(imageSize.width - effectiveSize, newX));
                      newY = Math.max(0, Math.min(imageSize.height - effectiveSize, newY));

                      setCropArea(prev => ({ ...prev, x: newX, y: newY }));
                    };

                    const handleMouseUp = () => {
                      document.removeEventListener('mousemove', handleMouseMove);
                      document.removeEventListener('mouseup', handleMouseUp);
                    };

                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', handleMouseUp);
                  }}
                />
              </div>
            </div>

            {/* Zoom Slider */}
            <div className="mb-4 flex justify-center">
              <div className="flex items-center gap-4 w-full max-w-[400px]">
                <label className="text-white text-sm font-medium whitespace-nowrap">Zoom:</label>
                <input
                  type="range"
                  min="1"
                  max={maxZoom}
                  step="0.1"
                  value={zoom}
                  onChange={(e) => {
                    const newZoom = parseFloat(e.target.value);
                    // Keep crop area centered when zooming
                    const centerSize = cropArea.size / zoom;
                    const newCenterSize = cropArea.size / newZoom;
                    const centerOffset = (centerSize - newCenterSize) / 2;

                    setCropArea(prev => ({
                      ...prev,
                      x: prev.x + centerOffset,
                      y: prev.y + centerOffset
                    }));
                    setZoom(newZoom);
                  }}
                  className="flex-1"
                />
                <span className="text-gray-400 text-sm whitespace-nowrap">{Math.round(zoom * 100)}%</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCropModalOpen(false)}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCropAndSave}
                disabled={savingImage}
                className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {savingImage ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-4 h-4" />
                    Crop & Save
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Duplicates Tab Component
interface DuplicatesTabContentProps {
  songs: Song[];
  setSongs: React.Dispatch<React.SetStateAction<Song[]>>;
  onEditSong: (song: Song) => void;
  onDeleteSong: (song: Song) => void;
  refreshKey: number;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const DuplicatesTabContent: React.FC<DuplicatesTabContentProps> = ({
  onEditSong,
  onDeleteSong,
  refreshKey,
  showSuccess,
  showError
}) => {
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [allDuplicates, setAllDuplicates] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalDuplicates, setTotalDuplicates] = useState(0);
  const [totalDuplicateSongs, setTotalDuplicateSongs] = useState(0);
  const [excludeGenericTracks, setExcludeGenericTracks] = useState(true);
  const [excludeUntitled, setExcludeUntitled] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const duplicatesPerPage = 10;

  useEffect(() => {
    fetchDuplicates();
  }, [refreshKey]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [excludeGenericTracks, excludeUntitled]);

  useEffect(() => {
    applyFilters();
  }, [excludeGenericTracks, excludeUntitled, allDuplicates]);

  const applyFilters = () => {
    let filtered = [...allDuplicates];

    // Filter out generic track names
    if (excludeGenericTracks) {
      const genericPatterns = [
        /^track\s*\d+$/i,
        /^audiotrack\s*\d+$/i,
        /^track\s*[a-z]?$/i,
        /^audio\s*\d+$/i,
        /^untitled\s*\d*$/i,
        /^unknown\s*\d*$/i,
        /^new track$/i,
        /^new recording$/i
      ];

      filtered = filtered.filter(group => {
        return !genericPatterns.some(pattern => pattern.test(group.title));
      });
    }

    // Filter out untitled/unknown songs
    if (excludeUntitled) {
      filtered = filtered.filter(group => {
        const title = group.title.toLowerCase().trim();
        const artist = group.artist.toLowerCase().trim();
        return title !== '' &&
               title !== 'untitled' &&
               title !== 'unknown' &&
               artist !== 'unknown artist' &&
               artist !== 'unknown';
      });
    }

    setDuplicates(filtered);

    // Recalculate totals
    const totalDup = filtered.length;
    const totalSongs = filtered.reduce((sum, group) => sum + group.songs.length, 0);
    setTotalDuplicates(totalDup);
    setTotalDuplicateSongs(totalSongs);
  };

  const fetchDuplicates = async () => {
    try {
      setLoading(true);
      const response = await apiService.request('GET', '/admin/songs/duplicates') as {
        data: {
          duplicates: Song[][];
          total: number;
          totalDuplicateSongs: number;
        }
      };

      // Convert array of song arrays to DuplicateGroup format
      const duplicateGroups: DuplicateGroup[] = response.data.duplicates.map(group => {
        const title = group[0].title;
        const artist = group[0].artist_name || 'Unknown';
        return { title, artist, songs: group };
      });

      setAllDuplicates(duplicateGroups);
      setDuplicates(duplicateGroups); // Initial set, will be filtered by useEffect
    } catch (err: any) {
      console.error('Failed to fetch duplicates:', err);
      showError(err.message || 'Failed to fetch duplicate songs');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSong = (song: Song, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    onDeleteSong(song);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top of duplicates list
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Calculate pagination
  const totalPages = Math.ceil(duplicates.length / duplicatesPerPage);
  const startIndex = (currentPage - 1) * duplicatesPerPage;
  const endIndex = startIndex + duplicatesPerPage;
  const displayedDuplicates = duplicates.slice(startIndex, endIndex);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Options */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-white font-semibold mb-3 flex items-center">
          <MagnifyingGlassIcon className="w-5 h-5 mr-2" />
          Filter Options
        </h3>
        <div className="space-y-3">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeGenericTracks}
              onChange={(e) => setExcludeGenericTracks(e.target.checked)}
              className="w-4 h-4 text-primary bg-gray-700 border-gray-600 rounded focus:ring-primary focus:ring-2"
            />
            <div className="flex-1">
              <span className="text-white font-medium">Exclude generic track names</span>
              <p className="text-gray-400 text-sm">Filters out "Track 1", "AudioTrack 2", etc.</p>
            </div>
          </label>

          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeUntitled}
              onChange={(e) => setExcludeUntitled(e.target.checked)}
              className="w-4 h-4 text-primary bg-gray-700 border-gray-600 rounded focus:ring-primary focus:ring-2"
            />
            <div className="flex-1">
              <span className="text-white font-medium">Exclude untitled/unknown songs</span>
              <p className="text-gray-400 text-sm">Filters out songs with no title or unknown artist</p>
            </div>
          </label>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Duplicate Groups</p>
              <p className="text-white text-2xl font-bold">{totalDuplicates}</p>
            </div>
            <DocumentDuplicateIcon className="w-8 h-8 text-primary" />
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Duplicate Songs</p>
              <p className="text-white text-2xl font-bold">{totalDuplicateSongs}</p>
            </div>
            <MusicalNoteIcon className="w-8 h-8 text-yellow-400" />
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Potential Space Saved</p>
              <p className="text-white text-2xl font-bold">{totalDuplicateSongs - totalDuplicates}</p>
            </div>
            <TrashIcon className="w-8 h-8 text-red-400" />
          </div>
        </div>
      </div>

      {/* Duplicates List */}
      {duplicates.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <DocumentDuplicateIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-white text-xl font-semibold mb-2">No Duplicates Found</h3>
          <p className="text-gray-400">Your library is clean! No duplicate songs were detected.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Results Info */}
          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>
              Showing {startIndex + 1} to {Math.min(endIndex, duplicates.length)} of {duplicates.length} duplicate groups
            </span>
          </div>

          {/* Duplicate Groups */}
          <div className="space-y-4">
            {displayedDuplicates.map((group, groupIndex) => (
              <div key={groupIndex} className="bg-gray-800 rounded-lg p-4">
                {/* Group Header */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700">
                  <div>
                    <h4 className="text-white font-semibold text-lg">{group.title}</h4>
                    <p className="text-gray-400 text-sm">by {group.artist}</p>
                  </div>
                  <span className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-sm font-medium">
                    {group.songs.length} duplicates
                  </span>
                </div>

                {/* Duplicate Songs */}
                <div className="space-y-2">
                  {group.songs.map((song, songIndex) => (
                  <div
                    key={song.id}
                    className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {song.artwork_path ? (
                        <img
                          src={apiService.getArtworkUrl(song.artwork_path)}
                          alt=""
                          className="w-12 h-12 rounded object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-600 rounded flex items-center justify-center flex-shrink-0">
                          <MusicalNoteIcon className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{song.title}</p>
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <span className="truncate">{song.album_title || 'Unknown Album'}</span>
                          {song.duration && (
                            <>
                              <span>•</span>
                              <span>{Math.floor(song.duration / 60)}:{String(song.duration % 60).padStart(2, '0')}</span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{song.file_path}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onEditSong(song);
                        }}
                        className="p-2 text-gray-400 hover:text-primary transition-colors"
                        title="Edit song"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteSong(song, e);
                        }}
                        className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                        title="Delete song"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-700">
              <div className="text-sm text-gray-400">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handlePageChange(currentPage - 1);
                  }}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>

                <div className="flex gap-1">
                  {/* Show page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          handlePageChange(pageNum);
                        }}
                        className={clsx(
                          'px-3 py-2 rounded-lg transition-colors',
                          currentPage === pageNum
                            ? 'bg-primary text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handlePageChange(currentPage + 1);
                  }}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Artist Splitting Tab Component
interface ArtistSplittingTabContentProps {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

interface ArtistSplitSong {
  id: number;
  title: string;
  artist_name: string;
  album_title?: string;
  artwork_path?: string;
}

const ArtistSplittingTabContent: React.FC<ArtistSplittingTabContentProps> = ({
  showSuccess,
  showError
}) => {
  const [songs, setSongs] = useState<ArtistSplitSong[]>([]);
  const [filteredSongs, setFilteredSongs] = useState<ArtistSplitSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [processing, setProcessing] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const songsPerPage = 50;

  // Separators configuration
  const [separators] = useState<string[]>([
    ' & ',
    ', ',
    ';',
    '; ',
    ' ft. ',
    ' ft ',
    ' feat. ',
    ' feat ',
    ' featuring ',
    ' x ',
    ' vs. ',
    ' vs ',
    ' with '
  ]);

  const [customSeparator, setCustomSeparator] = useState('');
  const [selectedSeparators, setSelectedSeparators] = useState<string[]>([' & ', ', ']);
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [disabledSplits, setDisabledSplits] = useState<Map<number, Set<number>>>(new Map());

  // Ignore filters state
  const [ignoreFilters, setIgnoreFilters] = useState<ArtistSplitIgnoreFilter[]>([]);
  const [newIgnorePattern, setNewIgnorePattern] = useState('');

  useEffect(() => {
    fetchSongs();
    fetchIgnoreFilters();
  }, []);

  // Re-filter songs when separators or ignore filters change
  useEffect(() => {
    if (allSongs.length === 0) return;

    if (selectedSeparators.length === 0) {
      // Show all songs when no separators selected
      setSongs(allSongs.map(s => ({
        id: s.id,
        title: s.title,
        artist_name: s.artist_name || '',
        album_title: s.album_title,
        artwork_path: s.artwork_path
      })));
    } else {
      // Filter songs that need splitting
      const filtered = allSongs.filter(song => {
        const artistName = song.artist_name || '';
        const hasSeparator = selectedSeparators.some(separator => artistName.includes(separator));

        // Check if song has artists from junction table
        // @ts-ignore - backend returns artists array
        const junctionArtists = song.artists || [];

        // Don't show if already has 2+ artists in junction table (already split)
        if (junctionArtists.length >= 2) {
          return false;
        }

        // Split the artist name
        const { artists: splitArtists, separators } = splitArtistName(artistName);

        // Apply ignore filters to see how many badges would actually be shown
        const forcedMergeGroups: number[][] = [];
        ignoreFilters.forEach(filter => {
          const pattern = filter.pattern;
          const patternLower = pattern.toLowerCase();

          // Try to match the pattern against consecutive artists
          for (let startIdx = 0; startIdx < splitArtists.length; startIdx++) {
            let reconstructed = '';
            const groupIndices: number[] = [];

            for (let i = startIdx; i < splitArtists.length; i++) {
              // Add separator before this artist (except first)
              if (i > startIdx && i - 1 < separators.length) {
                reconstructed += separators[i - 1];
              }
              reconstructed += splitArtists[i];
              groupIndices.push(i);

              // Check if reconstructed equals the pattern
              if (reconstructed.toLowerCase() === patternLower && groupIndices.length > 1) {
                // Exact match! Add this group
                forcedMergeGroups.push([...groupIndices]);
                break;
              }
            }
          }
        });

        // Calculate final badge count after applying ignore filters
        let badgeCount = splitArtists.length;
        // Subtract the number of merges (each merge reduces count by group length - 1)
        forcedMergeGroups.forEach(group => {
          badgeCount -= (group.length - 1);
        });

        // Don't show if only 1 badge would be shown (already fine, even with ignore filters)
        if (badgeCount <= 1) {
          return false;
        }

        return hasSeparator;
      });

      setSongs(filtered.map(s => ({
        id: s.id,
        title: s.title,
        artist_name: s.artist_name || '',
        album_title: s.album_title,
        artwork_path: s.artwork_path
      })));
    }
  }, [selectedSeparators, allSongs, ignoreFilters]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = songs.filter(song =>
        song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        song.artist_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredSongs(filtered);
    } else {
      setFilteredSongs(songs);
    }
    // Reset to page 1 when search query changes
    setCurrentPage(1);
  }, [searchQuery, songs]);

  const fetchSongs = async () => {
    try {
      setLoading(true);
      const response = await apiService.request('GET', '/admin/songs?limit=999999') as {
        data: { songs: Song[] }
      };

      // Store all songs
      setAllSongs(response.data.songs);

      // Filter songs that need splitting
      const songsNeedingSplit = response.data.songs.filter(song => {
        const artistName = song.artist_name || '';
        const hasSeparator = selectedSeparators.some(separator => artistName.includes(separator));

        // Check if song has artists from junction table
        // @ts-ignore - backend returns artists array
        const junctionArtists = song.artists || [];

        // Don't show if already has 2+ artists in junction table (already split)
        if (junctionArtists.length >= 2) {
          return false;
        }

        // Split the artist name
        const { artists: splitArtists, separators } = splitArtistName(artistName);

        // Apply ignore filters to see how many badges would actually be shown
        const forcedMergeGroups: number[][] = [];
        ignoreFilters.forEach(filter => {
          const pattern = filter.pattern;
          const patternLower = pattern.toLowerCase();

          // Try to match the pattern against consecutive artists
          for (let startIdx = 0; startIdx < splitArtists.length; startIdx++) {
            let reconstructed = '';
            const groupIndices: number[] = [];

            for (let i = startIdx; i < splitArtists.length; i++) {
              // Add separator before this artist (except first)
              if (i > startIdx && i - 1 < separators.length) {
                reconstructed += separators[i - 1];
              }
              reconstructed += splitArtists[i];
              groupIndices.push(i);

              // Check if reconstructed equals the pattern
              if (reconstructed.toLowerCase() === patternLower && groupIndices.length > 1) {
                // Exact match! Add this group
                forcedMergeGroups.push([...groupIndices]);
                break;
              }
            }
          }
        });

        // Calculate final badge count after applying ignore filters
        let badgeCount = splitArtists.length;
        // Subtract the number of merges (each merge reduces count by group length - 1)
        forcedMergeGroups.forEach(group => {
          badgeCount -= (group.length - 1);
        });

        // Don't show if only 1 badge would be shown (already fine, even with ignore filters)
        if (badgeCount <= 1) {
          return false;
        }

        return hasSeparator;
      });

      setSongs(songsNeedingSplit.map(s => ({
        id: s.id,
        title: s.title,
        artist_name: s.artist_name || '',
        album_title: s.album_title,
        artwork_path: s.artwork_path
      })));

      setFilteredSongs(songsNeedingSplit.map(s => ({
        id: s.id,
        title: s.title,
        artist_name: s.artist_name || '',
        album_title: s.album_title,
        artwork_path: s.artwork_path
      })));
    } catch (err: any) {
      console.error('Failed to fetch songs:', err);
      showError(err.message || 'Failed to fetch songs');
    } finally {
      setLoading(false);
    }
  };

  interface ArtistSplitResult {
    artists: string[];
    separators: string[]; // The separator used AFTER each artist (length = artists.length - 1)
  }

  const splitArtistName = (artistName: string): ArtistSplitResult => {
    let parts = [artistName];
    let separators: string[] = [];

    // Apply each separator in sequence
    selectedSeparators.forEach(separator => {
      const newParts: string[] = [];
      const newSeparators: string[] = [];

      parts.forEach((part, partIdx) => {
        const splitResult = part.split(separator);
        splitResult.forEach((subPart, subIdx) => {
          const trimmed = subPart.trim();
          if (trimmed) {
            newParts.push(trimmed);
            // The separator after this part is 'separator' unless it's the last sub-part
            if (subIdx < splitResult.length - 1) {
              newSeparators.push(separator);
            } else if (partIdx < parts.length && separators.length > partIdx) {
              // Keep existing separator for the last sub-part
              newSeparators.push(separators[partIdx]);
            }
          }
        });
      });

      parts = newParts;
      separators = newSeparators;
    });

    // Clean up artist names
    const cleanedArtists = parts.map(name =>
      name.replace(/\s*\(?feat\.?.*?\)?\s*$/gi, '')
          .replace(/\s*\(?ft\.?.*?\)?\s*$/gi, '')
          .replace(/\s*\(?featuring.*?\)?\s*$/gi, '')
          .trim()
    ).filter(name => name.length > 0);

    return { artists: cleanedArtists, separators };
  };

  const getFinalSplitArtists = (songId: number, artistName: string): { artists: string[], merged: boolean[], mergeGroups: number[][], separators: string[] } => {
    const { artists: allArtists, separators: allSeparators } = splitArtistName(artistName);
    const disabledSet = disabledSplits.get(songId) || new Set();

    // Track which artists are first in a merge group
    const merged: boolean[] = new Array(allArtists.length).fill(false);
    const mergeGroups: number[][] = [];

    // Build merge groups from disabled splits
    const groups: number[][] = [];
    let currentGroup: number[] = [0];

    for (let i = 0; i < allArtists.length - 1; i++) {
      if (disabledSet.has(i)) {
        // Merge i with i+1, add i+1 to current group
        currentGroup.push(i + 1);
      } else {
        // Split here, start a new group
        groups.push([...currentGroup]);
        currentGroup = [i + 1];
      }
    }
    groups.push(currentGroup);

    // Build final artists and mark first in each group
    const finalArtists: string[] = [];
    groups.forEach(group => {
      if (group.length > 1) {
        const mergedArtist = group.map(idx => allArtists[idx]).join(' & ');
        finalArtists.push(mergedArtist);
        merged[group[0]] = true;
        mergeGroups.push(group);
      } else {
        finalArtists.push(allArtists[group[0]]);
      }
    });

    return { artists: finalArtists, merged, mergeGroups, separators: allSeparators };
  };

  const toggleSplit = (songId: number, splitIndex: number) => {
    setDisabledSplits(prev => {
      const newMap = new Map(prev);
      const disabledSet = newMap.get(songId) || new Set();
      const newSet = new Set(disabledSet);

      // Find the merge groups to determine if we're merging at a group boundary
      // We need to get the current state of the song
      const song = songs.find(s => s.id === songId);
      if (!song) return prev;

      const { mergeGroups } = getFinalSplitArtists(songId, song.artist_name);

      // Check if this splitIndex is at the end of a merge group
      let groupEndIndex = -1;
      for (const group of mergeGroups) {
        if (group.length > 1 && group[group.length - 1] === splitIndex) {
          groupEndIndex = group[0]; // Store the start of this group
          break;
        }
      }

      if (newSet.has(splitIndex)) {
        // Split is currently disabled (merged), remove it to enable split
        // If it's at the end of a group, we need to remove the split that created this group
        if (groupEndIndex >= 0) {
          newSet.delete(groupEndIndex);
        } else {
          newSet.delete(splitIndex);
        }
      } else {
        // Split is currently enabled, disable it to merge
        // If we're at the end of a group, merge the entire group with the next artist
        if (groupEndIndex >= 0) {
          // Add split at the end of the group to merge it with next artist
          newSet.add(splitIndex);
        } else {
          newSet.add(splitIndex);
        }
      }

      if (newSet.size === 0) {
        newMap.delete(songId);
      } else {
        newMap.set(songId, newSet);
      }

      return newMap;
    });
  };

  const undoSplit = (songId: number, splitIndex: number, mergeGroup?: number[]) => {
    setDisabledSplits(prev => {
      const newMap = new Map(prev);
      const disabledSet = newMap.get(songId) || new Set();
      const newSet = new Set(disabledSet);

      // If a merge group is provided, remove all splits that created it
      if (mergeGroup && mergeGroup.length > 1) {
        // Remove all split points that are part of this merge group
        // For group [0,1,2], the splits are at indices 0 and 1
        for (let i = 0; i < mergeGroup.length - 1; i++) {
          newSet.delete(mergeGroup[i]);
        }
      } else {
        // Otherwise just remove the single split
        newSet.delete(splitIndex);
      }

      if (newSet.size === 0) {
        newMap.delete(songId);
      } else {
        newMap.set(songId, newSet);
      }

      return newMap;
    });
  };

  const handleSplit = async (songId: number, artistName: string) => {
    const { artists } = getFinalSplitArtists(songId, artistName);

    if (artists.length <= 1) {
      showError('This artist name cannot be split with the current separators');
      return;
    }

    try {
      setProcessing(true);
      await apiService.request('POST', `/admin/songs/${songId}/split-artists`, {
        artists
      });

      showSuccess(`Successfully split "${artistName}" into ${artists.length} artists`);

      // Clear disabled splits for this song
      setDisabledSplits(prev => {
        const newMap = new Map(prev);
        newMap.delete(songId);
        return newMap;
      });

      // Remove the song from the list locally instead of refreshing
      setAllSongs(prev => prev.filter(s => s.id !== songId));
      setSongs(prev => prev.filter(s => s.id !== songId));
      setFilteredSongs(prev => prev.filter(s => s.id !== songId));
    } catch (err: any) {
      console.error('Failed to split artists:', err);
      showError(err.message || 'Failed to split artists');
    } finally {
      setProcessing(false);
    }
  };

  const handleSplitAll = async () => {
    if (filteredSongs.length === 0) {
      showError('No songs to split');
      return;
    }

    try {
      setProcessing(true);
      const response = await apiService.request('POST', '/admin/songs/batch-split-artists', {
        songIds: filteredSongs.map(s => s.id),
        separators: selectedSeparators
      }) as {
        data: { processed: number; skipped: number; errors: any[] }
      };

      const processedCount = response.data?.processed || filteredSongs.length;
      showSuccess(`Successfully processed ${processedCount} songs`);

      // Clear the entire list since all songs were processed
      setAllSongs([]);
      setSongs([]);
      setFilteredSongs([]);
    } catch (err: any) {
      console.error('Failed to batch split artists:', err);
      showError(err.message || 'Failed to split artists');
    } finally {
      setProcessing(false);
    }
  };

  const addCustomSeparator = () => {
    if (customSeparator && !selectedSeparators.includes(customSeparator)) {
      setSelectedSeparators([...selectedSeparators, customSeparator]);
      setCustomSeparator('');
    }
  };

  const removeSeparator = (separator: string) => {
    setSelectedSeparators(selectedSeparators.filter(s => s !== separator));
  };

  const toggleSeparator = (separator: string) => {
    if (selectedSeparators.includes(separator)) {
      removeSeparator(separator);
    } else {
      setSelectedSeparators([...selectedSeparators, separator]);
    }
  };

  // Ignore filters functions
  const fetchIgnoreFilters = async () => {
    try {
      const response = await apiService.request('GET', '/admin/artist-split-ignore-filters') as {
        data: { filters: ArtistSplitIgnoreFilter[] }
      };
      setIgnoreFilters(response.data.filters);
    } catch (error: any) {
      console.error('Failed to fetch ignore filters:', error);
      showError('Failed to load ignore filters');
    }
  };

  const addIgnoreFilter = async () => {
    if (!newIgnorePattern.trim()) return;

    try {
      await apiService.request('POST', '/admin/artist-split-ignore-filters', {
        pattern: newIgnorePattern.trim()
      });

      showSuccess(`Ignore filter "${newIgnorePattern.trim()}" added`);
      setNewIgnorePattern('');
      await fetchIgnoreFilters();
    } catch (error: any) {
      console.error('Failed to add ignore filter:', error);
      showError(error.message || 'Failed to add ignore filter');
    }
  };

  const deleteIgnoreFilter = async (id: number) => {
    try {
      await apiService.request('DELETE', `/admin/artist-split-ignore-filters/${id}`);
      showSuccess('Ignore filter deleted');
      await fetchIgnoreFilters();
    } catch (error: any) {
      console.error('Failed to delete ignore filter:', error);
      showError('Failed to delete ignore filter');
    }
  };

  // Calculate pagination
  const totalPages = Math.ceil(filteredSongs.length / songsPerPage);
  const startIndex = (currentPage - 1) * songsPerPage;
  const endIndex = startIndex + songsPerPage;
  const paginatedSongs = filteredSongs.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      {/* Separator Configuration */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Separator Configuration</h3>
        <p className="text-gray-400 text-sm mb-4">
          Select the separators to use when splitting artist names. Songs containing these separators will be shown below.
        </p>

        {/* Common Separators */}
        <div className="mb-4">
          <label className="text-white text-sm font-medium mb-2 block">Common Separators</label>
          <div className="flex flex-wrap gap-2">
            {separators.map(separator => (
              <button
                key={separator}
                type="button"
                onClick={() => toggleSeparator(separator)}
                className={clsx(
                  'px-3 py-1 rounded-full text-sm transition-colors',
                  selectedSeparators.includes(separator)
                    ? 'bg-primary text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                )}
              >
                {`"${separator}"`}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Separator */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customSeparator}
            onChange={(e) => setCustomSeparator(e.target.value)}
            placeholder="Add custom separator (e.g., ' & ')"
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={addCustomSeparator}
            disabled={!customSeparator}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </div>

        {/* Selected Separators */}
        {selectedSeparators.length > 0 && (
          <div className="mt-4">
            <label className="text-white text-sm font-medium mb-2 block">Active Separators</label>
            <div className="flex flex-wrap gap-2">
              {selectedSeparators.map(separator => (
                <span
                  key={separator}
                  className="px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-sm flex items-center gap-2"
                >
                  {`"${separator}"`}
                  <button
                    type="button"
                    onClick={() => removeSeparator(separator)}
                    className="text-gray-400 hover:text-white"
                  >
                    <XCircleIcon className="w-4 h-4" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Ignore Filters */}
        <div className="mt-6 pt-6 border-t border-gray-700">
          <label className="text-white text-sm font-medium mb-2 block">Ignore Filters</label>
          <p className="text-gray-400 text-sm mb-3">
            Add patterns to ignore. Artist names matching these patterns will skip splitting and remain unchanged.
          </p>

          {/* Add new ignore filter */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newIgnorePattern}
              onChange={(e) => setNewIgnorePattern(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addIgnoreFilter()}
              placeholder="Add pattern to ignore (e.g., 'Various Artists')"
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={addIgnoreFilter}
              disabled={!newIgnorePattern.trim()}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add Filter
            </button>
          </div>

          {/* List of ignore filters */}
          {ignoreFilters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {ignoreFilters.map(filter => (
                <span
                  key={filter.id}
                  className="px-3 py-1 bg-red-900/30 text-red-400 rounded-full text-sm flex items-center gap-2 border border-red-800"
                >
                  {filter.pattern}
                  <button
                    type="button"
                    onClick={() => deleteIgnoreFilter(filter.id)}
                    className="text-red-400 hover:text-red-300"
                    title="Remove filter"
                  >
                    <XCircleIcon className="w-4 h-4" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Songs List */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center">
            <MusicalNoteIcon className="w-5 h-5 mr-2" />
            Songs with Multiple Artists ({filteredSongs.length})
          </h3>
          <button
            type="button"
            onClick={handleSplitAll}
            disabled={processing || filteredSongs.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {processing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Processing...
              </>
            ) : (
              <>
                <ArrowPathIcon className="w-4 h-4" />
                Split All ({filteredSongs.length})
              </>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search songs..."
            className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-primary"
          />
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            {/* Songs List */}
            {filteredSongs.length > 0 ? (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {paginatedSongs.map(song => {
                  const { artists: splitArtists, separators: allSeparators } = splitArtistName(song.artist_name);
                  const { artists: finalArtists, merged, mergeGroups, separators } = getFinalSplitArtists(song.id, song.artist_name);
                  const disabledSet = disabledSplits.get(song.id) || new Set();
                  const hasModifications = disabledSet.size > 0;

                  return (
                    <div
                      key={song.id}
                      className="flex items-center gap-4 p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      {/* Album Art */}
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-600 flex-shrink-0">
                        {song.artwork_path ? (
                          <img
                            src={apiService.getArtworkUrl(song.artwork_path)}
                            alt={song.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <MusicalNoteIcon className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                      </div>

                      {/* Song Info */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-medium truncate">{song.title}</h4>
                        <p className="text-gray-400 text-sm truncate">{song.artist_name}</p>
                        {song.album_title && (
                          <p className="text-gray-500 text-xs truncate">{song.album_title}</p>
                        )}
                      </div>

                      {/* Preview */}
                      {splitArtists.length > 1 ? (
                        <div className={clsx(
                          "flex-1 min-w-0",
                          hasModifications && "bg-yellow-500/5 p-2 -m-2 rounded"
                        )}>
                          <p className="text-gray-500 text-xs mb-1">
                            Will be split into:
                            {hasModifications && <span className="text-yellow-500 ml-1">(modified)</span>}
                          </p>
                          <div className="flex flex-wrap items-center gap-1">
                            {(() => {
                              // Build forced merge groups from ignore filters
                              const forcedMergeGroups: number[][] = [];

                              // For each ignore filter, find matching consecutive artists
                              ignoreFilters.forEach(filter => {
                                const pattern = filter.pattern;
                                const patternLower = pattern.toLowerCase();

                                // Try to match the pattern against consecutive artists
                                for (let startIdx = 0; startIdx < splitArtists.length; startIdx++) {
                                  let reconstructed = '';
                                  const groupIndices: number[] = [];

                                  for (let i = startIdx; i < splitArtists.length; i++) {
                                    // Add separator before this artist (except first)
                                    if (i > startIdx && i - 1 < separators.length) {
                                      reconstructed += separators[i - 1];
                                    }
                                    reconstructed += splitArtists[i];
                                    groupIndices.push(i);

                                    // Check if reconstructed equals the pattern
                                    if (reconstructed.toLowerCase() === patternLower && groupIndices.length > 1) {
                                      // Exact match! Add this group
                                      forcedMergeGroups.push([...groupIndices]);
                                      break;
                                    }
                                  }
                                }
                              });

                              // Merge with user-created groups
                              const allMergeGroups = [...mergeGroups];
                              forcedMergeGroups.forEach(forced => {
                                const exists = allMergeGroups.some(g =>
                                  g.length === forced.length && g.every((idx, i) => idx === forced[i])
                                );
                                if (!exists) {
                                  allMergeGroups.push(forced);
                                }
                              });

                              // Render
                              return splitArtists.map((artist, index) => {
                                const mergeGroup = allMergeGroups.find(g => g.includes(index));
                                const isFirstInGroup = mergeGroup && mergeGroup[0] === index;

                                if (!isFirstInGroup && mergeGroup) return null;

                                const groupSize = mergeGroup ? mergeGroup.length : 1;
                                const splitPointIndex = index + groupSize - 1;

                                // Build display text
                                let displayText = artist;
                                if (mergeGroup) {
                                  displayText = mergeGroup.map((groupIdx, i) => {
                                    const artistName = splitArtists[groupIdx];
                                    if (i < mergeGroup!.length - 1 && groupIdx < separators.length) {
                                      return artistName + separators[groupIdx];
                                    }
                                    return artistName;
                                  }).join('');
                                }

                                // Check if from ignore filter
                                const isIgnored = mergeGroup && forcedMergeGroups.some(fg =>
                                  fg.length === mergeGroup.length && fg.every((idx, i) => idx === mergeGroup![i])
                                );

                                return (
                                  <React.Fragment key={index}>
                                    {mergeGroup ? (
                                      isIgnored ? (
                                        <span className="px-2 py-1 text-xs rounded bg-primary/20 text-primary">
                                          {displayText}
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => undoSplit(song.id, index, mergeGroup)}
                                          className="px-2 py-1 text-xs rounded bg-yellow-500/30 text-yellow-500 border border-yellow-500 hover:bg-yellow-500/40 transition-colors cursor-pointer"
                                          title="Click to undo merge"
                                        >
                                          {displayText}
                                        </button>
                                      )
                                    ) : (
                                      <span className="px-2 py-1 text-xs rounded bg-primary/20 text-primary">
                                        {artist}
                                      </span>
                                    )}

                                    {index + groupSize < splitArtists.length && (
                                      <button
                                        type="button"
                                        onClick={() => toggleSplit(song.id, splitPointIndex)}
                                        className={clsx(
                                          "px-1 py-1 text-xs font-mono rounded transition-colors",
                                          disabledSet.has(splitPointIndex)
                                            ? "bg-yellow-500 text-white hover:bg-yellow-600"
                                            : "bg-gray-600 text-gray-300 hover:bg-gray-500"
                                        )}
                                        title={disabledSet.has(splitPointIndex)
                                          ? "Click to enable split"
                                          : "Click to disable split"}
                                      >
                                        |
                                      </button>
                                    )}
                                  </React.Fragment>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      ) : (
                        // Single artist - no split needed
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-500 text-xs">Single artist</p>
                        </div>
                      )}

                      {/* Actions */}
                      <button
                        type="button"
                        onClick={() => handleSplit(song.id, song.artist_name)}
                        disabled={
                          processing ||
                          finalArtists.length <= 1
                        }
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        {processing ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        ) : (
                          <>
                            <PencilIcon className="w-4 h-4" />
                            Split
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <MusicalNoteIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No songs found</h3>
                <p className="text-gray-400">
                  {searchQuery
                    ? 'No songs match your search. Try a different search term.'
                    : 'No songs with multiple artists found. Add more separators or check your library.'}
                </p>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-gray-700 pt-4">
                <div className="text-sm text-gray-400">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredSongs.length)} of {filteredSongs.length} songs
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-white">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

interface JobsTabContentProps {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const JobsTabContent: React.FC<JobsTabContentProps> = ({ showSuccess, showError }) => {
  const [loading, setLoading] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const handleCleanupEmptyArtists = async () => {
    if (loading) return;

    setConfirmDialogOpen(true);
  };

  const handleConfirmCleanup = async () => {
    setConfirmDialogOpen(false);

    try {
      setLoading(true);
      const response = await apiService.request('POST', '/admin/jobs/cleanup-empty-artists') as {
        data: { message: string; deletedCount: number; deletedArtists: number[] }
      };

      showSuccess(response.data.message || `Deleted ${response.data.deletedCount} empty artists`);
    } catch (error: any) {
      console.error('Failed to cleanup empty artists:', error);
      showError(error.message || 'Failed to cleanup empty artists');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Maintenance Jobs</h2>
        <p className="text-gray-400">Run maintenance tasks to keep your library clean and optimized</p>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Available Jobs</h3>
        <div className="space-y-4">
          {/* Cleanup Empty Artists */}
          <div className="border border-gray-700 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="text-white font-medium mb-2">Cleanup Empty Artists</h4>
                <p className="text-gray-400 text-sm mb-3">
                  Remove all artists from the database that have no songs associated with them.
                  This helps keep your artist list clean and removes any artists that were created but never used.
                </p>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">
                    <ArrowPathIcon className="w-4 h-4 inline mr-1" />
                    Maintenance task
                  </span>
                </div>
              </div>
              <button
                onClick={handleCleanupEmptyArtists}
                disabled={loading}
                className={clsx(
                  'px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2'
                )}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Running...
                  </>
                ) : (
                  <>
                    <TrashIcon className="w-4 h-4" />
                    Run Job
                  </>
                )}
              </button>
            </div>
          </div>

          {/* More jobs can be added here in the future */}
          <div className="border border-dashed border-gray-700 rounded-lg p-4 text-center">
            <p className="text-gray-500 text-sm">More maintenance jobs coming soon...</p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        onConfirm={handleConfirmCleanup}
        title="Cleanup Empty Artists"
        message="Are you sure you want to delete all artists that have no songs? This action cannot be undone."
        confirmText="Delete Artists"
        cancelText="Cancel"
      />
    </div>
  );
};

const LibraryManagementTab: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<LibrarySubTab>('overview');
  const [songs, setSongs] = useState<Song[]>([]);
  const [duplicatesRefreshKey, setDuplicatesRefreshKey] = useState(0);
  const [libraryPaths, setLibraryPaths] = useState<LibraryPath[]>([]);
  const [scanStatus, setScanStatus] = useState<ScanProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [newPath, setNewPath] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [scanReportModalOpen, setScanReportModalOpen] = useState(false);
  const [selectedPathForReport, setSelectedPathForReport] = useState<{ id: number; path: string } | null>(null);

  // Delete confirmation dialogs
  const [deleteReportDialogOpen, setDeleteReportDialogOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<{ id: number; path: string } | null>(null);
  const [deleteSongDialogOpen, setDeleteSongDialogOpen] = useState(false);
  const [songToDelete, setSongToDelete] = useState<Song | null>(null);
  const [deleteFileToo, setDeleteFileToo] = useState(false);
  const [rescanAllDialogOpen, setRescanAllDialogOpen] = useState(false);

  // New states for path selector
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<string[]>([]);
  const [isValidPath, setIsValidPath] = useState<boolean | null>(null);
  const [debouncedPath, setDebouncedPath] = useState('');

  const { showSuccess, showError } = useToast();

  const [focusedSuggestionIndex, setFocusedSuggestionIndex] = useState(-1);
  const [isShowingRoot, setIsShowingRoot] = useState(false);
  const [inputHasFocus, setInputHasFocus] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autocompleteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to focused item
  useEffect(() => {
    if (focusedSuggestionIndex >= 0 && dropdownRef.current) {
      const scrollContainer = dropdownRef.current.querySelector('.overflow-y-auto');
      if (scrollContainer) {
        const items = scrollContainer.querySelectorAll('button');
        if (items[focusedSuggestionIndex]) {
          items[focusedSuggestionIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }
  }, [focusedSuggestionIndex]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalSongs, setTotalSongs] = useState(0);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const songsPerPage = 50;

  // Validate path and get autocomplete
  const validateAndAutocompletePath = async (path: string) => {
    // Don't reset validation state for empty paths
    if (path.length > 0) {
      setIsValidPath(null);
    }

    try {
      const response = await apiService.request('GET', `/admin/library/validate-path?path=${encodeURIComponent(path)}`) as {
        data: {
          valid: boolean;
          exists: boolean;
          directories: string[];
          isRoot?: boolean;
        }
      };
      const data = response.data;

      // Set isShowingRoot flag
      setIsShowingRoot(data.isRoot || false);

      if (data.valid) {
        setIsValidPath(true);
        setPathError(null);
        // Show autocomplete if there are directories
        if (data.directories && data.directories.length > 0) {
          setAutocompleteSuggestions(data.directories);
          setShowSuggestions(true);
        } else {
          setAutocompleteSuggestions([]);
        }
      } else {
        setIsValidPath(false);
        // Still show autocomplete for parent directory or root
        if (data.directories && data.directories.length > 0) {
          setAutocompleteSuggestions(data.directories);
          setShowSuggestions(true);
        } else {
          setAutocompleteSuggestions([]);
        }
      }
    } catch (err) {
      console.error('Path validation failed:', err);
      setIsValidPath(false);
      setAutocompleteSuggestions([]);
      setIsShowingRoot(false);
    }
  };

  // Debounced validation
  useEffect(() => {
    if (autocompleteTimeoutRef.current) {
      clearTimeout(autocompleteTimeoutRef.current);
    }

    autocompleteTimeoutRef.current = setTimeout(() => {
      // Empty path with focus - show root/drives
      if (newPath.length === 0 && inputHasFocus) {
        validateAndAutocompletePath('');
        setFocusedSuggestionIndex(-1);
      }
      // Trigger validation for any path with at least 1 character
      else if (newPath.length > 0) {
        validateAndAutocompletePath(newPath);
        setFocusedSuggestionIndex(-1); // Reset focused index when new results come in
      }
    }, 150); // Reduced from 300ms to 150ms for faster response

    return () => {
      if (autocompleteTimeoutRef.current) {
        clearTimeout(autocompleteTimeoutRef.current);
      }
    };
  }, [newPath, inputHasFocus]);

  useEffect(() => {
    fetchLibraryData();
    fetchScanStatus();

    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showSuggestions && !target.closest('.suggestions-dropdown') && !target.closest('input')) {
        setShowSuggestions(false);
        setAutocompleteSuggestions([]);
        setFocusedSuggestionIndex(-1);
        setIsShowingRoot(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (scanStatus?.status === 'running') {
        fetchScanStatus();
        // Don't fetch songs during scanning to avoid flickering
      }
    }, 1000); // Reduced to 1 second for better real-time feel

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanStatus?.status]);

  // Reset to page 1 when search query changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Fetch songs when currentPage changes
  useEffect(() => {
    // Debounced fetch to avoid excessive calls
    const timeoutId = setTimeout(() => {
      fetchSongs(currentPage, searchQuery);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [currentPage, searchQuery]);

  const fetchLibraryData = async () => {
    try {
      setLoading(true);
      setError(null);
      const pathsResponse = await apiService.getLibraryPaths();
      const paths = pathsResponse.data.paths;

      // Fetch latest scan report for each path
      const pathsWithScans = await Promise.all(
        paths.map(async (path: LibraryPath) => {
          try {
            const scanResponse = await apiService.request('GET', `/admin/library/paths/${path.id}/scans/latest`) as {
              data: { report: LibraryPath['latest_scan'] | null }
            };
            return {
              ...path,
              latest_scan: scanResponse.data.report || undefined
            };
          } catch (err) {
            // If no scan report exists, just return the path without latest_scan
            return { ...path, latest_scan: undefined };
          }
        })
      );

      setLibraryPaths(pathsWithScans);
      await fetchSongs();
    } catch (err: any) {
      console.error('Failed to fetch library data:', err);
      setError(err.message || 'Failed to load library data');
    } finally {
      setLoading(false);
    }
  };

  const fetchSongs = async (page: number = 1, search: string = '') => {
    try {
      setLoadingSongs(true);
      const offset = (page - 1) * songsPerPage;
      const songsResponse = await apiService.getSongs({
        limit: songsPerPage,
        offset,
        search: search || undefined
      });
      setSongs(songsResponse.data.songs);
      setTotalSongs(songsResponse.data.total);
      // Don't set currentPage here - it's already set by the component that called this
    } catch (err: any) {
      console.error('Failed to fetch songs:', err);
      setError(err.message || 'Failed to load songs');
    } finally {
      setLoadingSongs(false);
    }
  };

  const fetchScanStatus = async () => {
    try {
      const response = await apiService.getScanStatus();
      const newScanStatus = response.data.currentScan;

      // Check if scan just completed
      if (scanStatus?.status === 'running' && (!newScanStatus || newScanStatus.status !== 'running')) {
        // Scan completed, refresh songs list and library paths (for updated scan reports)
        await fetchSongs(currentPage, searchQuery);
        await fetchLibraryData();
      }

      setScanStatus(newScanStatus);
    } catch (err: any) {
      console.error('Failed to fetch scan status:', err);
    }
  };

  const handleStartScan = async (paths?: string[]) => {
    try {
      await apiService.startLibraryScan(paths);
      await fetchScanStatus();
      // Reset to first page when starting a scan
      if (currentPage !== 1) {
        setCurrentPage(1);
      }
    } catch (err: any) {
      console.error('Failed to start library scan:', err);
      setError(err.message || 'Failed to start library scan');
    }
  };

  const handleStopScan = async () => {
    try {
      await apiService.stopLibraryScan();
      await fetchScanStatus();
    } catch (err: any) {
      console.error('Failed to stop library scan:', err);
      setError(err.message || 'Failed to stop library scan');
    }
  };

  const handleRescanAllLibraries = async () => {
    try {
      const response = await apiService.rescanAllLibraries();
      showSuccess(response.data.message);
      setRescanAllDialogOpen(false);
      await fetchScanStatus();
      // Refresh library overview
      await fetchLibraryData();
      await fetchSongs(currentPage, searchQuery);
    } catch (err: any) {
      console.error('Failed to rescan all libraries:', err);
      showError(err.message || 'Failed to rescan all libraries');
    }
  };

  const handleAddPath = async () => {
    if (newPath.trim()) {
      try {
        setIsValidating(true);
        setPathError(null);

        // Normalize path: replace multiple spaces with single space, then trim
        const normalizedPath = newPath.trim().replace(/\s{2,}/g, ' ');

        await apiService.addLibraryPath(normalizedPath);
        setNewPath('');
        setShowSuggestions(false);
        // Reset validation state
        setIsValidPath(null);
        setPathError(null);
        // Only refresh library paths, not songs
        const pathsResponse = await apiService.getLibraryPaths();
        setLibraryPaths(pathsResponse.data.paths);
        setError(null);
      } catch (err: any) {
        console.error('Failed to add library path:', err);
        const errorMsg = err.response?.data?.error?.message || err.message || 'Failed to add library path';
        setPathError(errorMsg);
        setError(errorMsg);
      } finally {
        setIsValidating(false);
      }
    }
  };

  const handleSelectAutocomplete = (path: string) => {
    setNewPath(path);
    setShowSuggestions(false);
    setAutocompleteSuggestions([]);
    setFocusedSuggestionIndex(-1);
    setIsShowingRoot(false);
    setIsValidPath(true);
    setPathError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (autocompleteSuggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedSuggestionIndex(prev => {
          const newIndex = prev < autocompleteSuggestions.length - 1 ? prev + 1 : prev;
          return newIndex;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedSuggestionIndex(prev => {
          const newIndex = prev > 0 ? prev - 1 : -1;
          return newIndex;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedSuggestionIndex >= 0 && autocompleteSuggestions[focusedSuggestionIndex]) {
          handleSelectAutocomplete(autocompleteSuggestions[focusedSuggestionIndex]);
        } else if (isValidPath === true) {
          handleAddPath();
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setAutocompleteSuggestions([]);
        setFocusedSuggestionIndex(-1);
        break;
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setInputHasFocus(false);
    // Delay hiding dropdown to allow clicking on suggestions
    setTimeout(() => {
      setShowSuggestions(false);
      setAutocompleteSuggestions([]);
      setFocusedSuggestionIndex(-1);
      setIsShowingRoot(false);
    }, 200);
  };

  const handleRemovePath = async (id: number) => {
    try {
      await apiService.deleteLibraryPath(id);
      // Use fetchLibraryData to properly refresh paths with scan stats
      await fetchLibraryData();
      setError(null);
    } catch (err: any) {
      console.error('Failed to delete library path:', err);
      setError(err.message || 'Failed to delete library path');
    }
  };

  const handleTogglePath = async (id: number) => {
    try {
      const path = libraryPaths.find(p => p.id === id);
      if (path) {
        await apiService.updateLibraryPath(id, { is_active: !path.is_active });
        // Use fetchLibraryData to properly refresh paths with scan stats
        await fetchLibraryData();
        setError(null);
      }
    } catch (err: any) {
      console.error('Failed to update library path:', err);
      setError(err.message || 'Failed to update library path');
    }
  };

  const handleDeleteReport = (reportId: number, path: string) => {
    setReportToDelete({ id: reportId, path });
    setDeleteReportDialogOpen(true);
  };

  const handleConfirmDeleteReport = async () => {
    if (!reportToDelete) return;

    try {
      await apiService.deleteScanReport(reportToDelete.id);
      // Refresh library data to update the latest scan info
      await fetchLibraryData();
      showSuccess('Scan report deleted successfully');
    } catch (err: any) {
      console.error('Failed to delete scan report:', err);
      showError(err.message || 'Failed to delete scan report');
    } finally {
      setDeleteReportDialogOpen(false);
      setReportToDelete(null);
    }
  };

  const handleDeleteSong = (song: Song) => {
    setSongToDelete(song);
    setDeleteFileToo(false); // Reset checkbox
    setDeleteSongDialogOpen(true);
  };

  const handleConfirmDeleteSong = async () => {
    if (!songToDelete) return;

    try {
      await apiService.deleteSong(songToDelete.id, deleteFileToo);
      await fetchSongs(currentPage, searchQuery);
      // Trigger duplicates refresh if we're on the duplicates tab
      if (activeSubTab === 'duplicates') {
        setDuplicatesRefreshKey(prev => prev + 1);
      }
      showSuccess(deleteFileToo ? 'Song and file deleted successfully' : 'Song deleted successfully');
    } catch (err: any) {
      console.error('Failed to delete song:', err);
      showError(err.message || 'Failed to delete song');
    } finally {
      setDeleteSongDialogOpen(false);
      setSongToDelete(null);
      setDeleteFileToo(false);
    }
  };

  const handleEditSong = (song: Song) => {
    setEditingSong(song);
    setEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setEditModalOpen(false);
    setEditingSong(null);
  };

  const handleSongUpdated = (updatedSong: Song) => {
    setSongs(prev =>
      prev.map(song => song.id === updatedSong.id ? updatedSong : song)
    );
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const totalPages = Math.ceil(totalSongs / songsPerPage);
  const startIndex = (currentPage - 1) * songsPerPage + 1;
  const endIndex = Math.min(currentPage * songsPerPage, totalSongs);

  // Remove filteredSongs since we're now handling search server-side

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Library Management</h2>
        <p className="text-gray-400">Manage music library paths and scan for new content</p>
      </div>

      {/* Sub-Tab Navigation */}
      <div className="border-b border-gray-700 pt-2">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={clsx(
              'flex items-center space-x-2 py-3 px-1 border-b-2 font-medium text-sm transition-colors',
              activeSubTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
            )}
          >
            <FolderIcon className="w-5 h-5" />
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveSubTab('duplicates')}
            className={clsx(
              'flex items-center space-x-2 py-3 px-1 border-b-2 font-medium text-sm transition-colors',
              activeSubTab === 'duplicates'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
            )}
          >
            <DocumentDuplicateIcon className="w-5 h-5" />
            <span>Duplicates</span>
          </button>
          <button
            onClick={() => setActiveSubTab('artist-images')}
            className={clsx(
              'flex items-center space-x-2 py-3 px-1 border-b-2 font-medium text-sm transition-colors',
              activeSubTab === 'artist-images'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
            )}
          >
            <MusicalNoteIcon className="w-5 h-5" />
            <span>Artist Images</span>
          </button>
          <button
            onClick={() => setActiveSubTab('artist-splitting')}
            className={clsx(
              'flex items-center space-x-2 py-3 px-1 border-b-2 font-medium text-sm transition-colors',
              activeSubTab === 'artist-splitting'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
            )}
          >
            <PencilIcon className="w-5 h-5" />
            <span>Artist Splitting</span>
          </button>
          <button
            onClick={() => setActiveSubTab('jobs')}
            className={clsx(
              'flex items-center space-x-2 py-3 px-1 border-b-2 font-medium text-sm transition-colors',
              activeSubTab === 'jobs'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
            )}
          >
            <ArrowPathIcon className="w-5 h-5" />
            <span>Jobs</span>
          </button>
        </nav>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {activeSubTab === 'overview' && (
      <>
      {/* Library Paths Section */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center">
            <FolderIcon className="w-5 h-5 mr-2" />
            Library Paths
          </h3>
          <div className="flex gap-2">
            {scanStatus?.status === 'running' ? (
              <button
                onClick={() => handleStopScan()}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <XCircleIcon className="w-4 h-4 mr-2" />
                Stop Scan
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleStartScan()}
                  className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <ArrowPathIcon className="w-4 h-4 mr-2" />
                  Scan Library
                </button>
                <button
                  onClick={() => setRescanAllDialogOpen(true)}
                  className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                  title="This will delete all songs from the database and rescan all library paths"
                >
                  <ArrowPathIcon className="w-4 h-4 mr-2" />
                  Rescan All Libraries
                </button>
              </>
            )}
          </div>
        </div>

        {/* Add new path */}
        <div className="mb-4 space-y-3">
          {/* Input row */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={newPath}
                onChange={(e) => {
                  // Prevent multiple spaces that might come from autocorrect
                  const normalizedValue = e.target.value.replace(/\s{2,}/g, ' ');
                  setNewPath(normalizedValue);
                  setPathError(null);
                  setIsValidPath(null);
                }}
                onFocus={() => {
                  setInputHasFocus(true);
                  setShowSuggestions(true);
                  // Always trigger autocomplete on focus to show root/drives if empty
                  if (newPath.length > 0) {
                    validateAndAutocompletePath(newPath);
                  } else {
                    // Show root directories or drive letters when empty
                    validateAndAutocompletePath('');
                  }
                }}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                placeholder="Type a path (e.g., /home/user/Music or C:\Music)"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                className={clsx(
                  "w-full px-3 py-2 pr-10 bg-gray-700 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-colors",
                  pathError ? "border-red-500 focus:ring-red-500" : isValidPath === true ? "border-green-500 focus:ring-green-500" : isValidPath === false ? "border-red-500 focus:ring-red-500" : "border-gray-600 focus:ring-primary"
                )}
              />
              {/* Validation indicator */}
              {isValidPath === true && !isValidating && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <CheckCircleIcon className="w-5 h-5 text-green-500" />
                </div>
              )}
              {isValidPath === false && !isValidating && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <span className="text-red-500 text-xl">✕</span>
                </div>
              )}
              {isValidating && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                </div>
              )}
            </div>

            {/* Add button */}
            <button
              onClick={handleAddPath}
              disabled={!newPath.trim() || isValidating || isValidPath === false}
              className={clsx(
                "px-4 py-2 bg-primary text-white rounded-lg transition-colors",
                (!newPath.trim() || isValidating || isValidPath === false) && "opacity-50 cursor-not-allowed"
              )}
            >
              {isValidating ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <PlusIcon className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Autocomplete dropdown */}
          {showSuggestions && autocompleteSuggestions.length > 0 && (
            <div className="relative" ref={dropdownRef}>
              <div className="absolute top-full left-0 mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50">
                <div className="p-2 max-h-80 overflow-y-auto suggestions-dropdown">
                  <p className="text-xs text-gray-400 px-2 py-1 font-medium">
                    {isShowingRoot ? (
                      <>
                        {navigator.platform.toLowerCase().includes('win') ? 'AVAILABLE DRIVES' : 'ROOT DIRECTORIES'}
                      </>
                    ) : (
                      'DIRECTORIES'
                    )}
                  </p>
                  {autocompleteSuggestions.map((path, index) => (
                    <button
                      key={index}
                      onClick={() => handleSelectAutocomplete(path)}
                      onMouseEnter={() => setFocusedSuggestionIndex(index)}
                      className={clsx(
                        "w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-2",
                        focusedSuggestionIndex === index
                          ? "bg-primary text-white"
                          : "text-gray-300 hover:bg-gray-700"
                      )}
                    >
                      <FolderIcon className="w-4 h-4" />
                      <span className="truncate">{path}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Validation status message */}
          {isValidPath === true && (
            <div className="text-green-400 text-sm flex items-center gap-2">
              <CheckCircleIcon className="w-4 h-4" />
              <span>✓ Valid directory path</span>
            </div>
          )}

          {/* Path error message */}
          {pathError && (
            <div className="text-red-400 text-sm flex items-center gap-2">
              <span>⚠️ {pathError}</span>
            </div>
          )}

          {/* Help text */}
          <p className="text-gray-400 text-xs">
            💡 Click the input to see available drives/root directories. Start typing to autocomplete. Use arrow keys to navigate, Enter to select.
          </p>
        </div>

        {/* Scan Progress */}
        {scanStatus?.status === 'running' && (
          <div className="mb-4 p-4 bg-yellow-900/20 border border-yellow-500 rounded-lg">
            <div className="flex items-center mb-3">
              <ArrowPathIcon className="w-5 h-5 text-yellow-400 animate-spin mr-2" />
              <span className="text-yellow-400 font-medium">Scanning Library...</span>
              {scanStatus.progress !== undefined && scanStatus.progress > 0 && (
                <span className="ml-auto text-yellow-400 font-semibold">
                  {scanStatus.progress}%
                </span>
              )}
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3 mb-3">
              <div
                className="bg-yellow-400 h-3 rounded-full transition-all duration-500 ease-in-out"
                style={{
                  width: `${scanStatus.progress || 0}%`,
                  minWidth: (scanStatus.progress ?? 0) > 0 ? '8px' : '0px'
                }}
              ></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div className="text-center">
                <div className="text-gray-300 font-medium">{scanStatus.filesScanned ?? 0}</div>
                <div className="text-gray-400 text-xs">Scanned</div>
              </div>
              <div className="text-center">
                <div className="text-green-400 font-medium">{scanStatus.filesAdded ?? 0}</div>
                <div className="text-gray-400 text-xs">Added</div>
              </div>
              <div className="text-center">
                <div className="text-blue-400 font-medium">{scanStatus.filesUpdated ?? 0}</div>
                <div className="text-gray-400 text-xs">Updated</div>
              </div>
              <div className="text-center">
                <div className="text-yellow-400 font-medium">{scanStatus.filesSkipped ?? 0}</div>
                <div className="text-gray-400 text-xs">Skipped</div>
              </div>
              <div className="text-center">
                <div className="text-red-400 font-medium">{scanStatus.errorsCount ?? 0}</div>
                <div className="text-gray-400 text-xs">Errors</div>
              </div>
            </div>
            {(scanStatus.totalFiles ?? 0) > 0 && (
              <p className="text-gray-400 text-xs mt-2 text-center">
                Processing {scanStatus.filesScanned ?? 0} of {scanStatus.totalFiles} files
              </p>
            )}
            {scanStatus.currentFile && (
              <p className="text-gray-400 text-xs mt-1 text-center truncate">
                Current: {scanStatus.currentFile}
              </p>
            )}
          </div>
        )}

        {/* Paths list */}
        <div className="space-y-3">
          {libraryPaths.map((path) => (
            <div key={path.id} className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={path.is_active}
                    onChange={() => handleTogglePath(path.id)}
                    className="w-4 h-4 text-primary bg-gray-600 border-gray-500 rounded focus:ring-primary focus:ring-2"
                  />
                  <div className="ml-3 flex-1 min-w-0">
                    <p className={clsx(
                      'font-medium truncate',
                      path.is_active ? 'text-white' : 'text-gray-400'
                    )}>
                      {path.path}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <button
                    onClick={() => {
                      setSelectedPathForReport({ id: path.id, path: path.path });
                      setScanReportModalOpen(true);
                    }}
                    className="p-2 text-gray-400 hover:text-blue-400 transition-colors"
                    title="View scan reports"
                  >
                    <DocumentTextIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleStartScan([path.path])}
                    disabled={scanStatus?.status === 'running' || !path.is_active}
                    className={clsx(
                      'p-2 transition-colors',
                      (scanStatus?.status === 'running' || !path.is_active)
                        ? 'text-gray-600 cursor-not-allowed'
                        : 'text-gray-400 hover:text-green-400'
                    )}
                    title="Scan this path"
                  >
                    <ArrowPathIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRemovePath(path.id)}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                    title="Remove path"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Latest Scan Info */}
              {path.latest_scan ? (
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {path.latest_scan.status === 'completed' && (
                        <CheckCircleIcon className="w-4 h-4 text-green-400" />
                      )}
                      {path.latest_scan.status === 'failed' && (
                        <XCircleIconSolid className="w-4 h-4 text-red-400" />
                      )}
                      {path.latest_scan.status === 'stopped' && (
                        <ClockIcon className="w-4 h-4 text-yellow-400" />
                      )}
                      {path.latest_scan.status === 'running' && (
                        <ClockIcon className="w-4 h-4 text-blue-400 animate-spin" />
                      )}
                      <span className="text-gray-300 text-sm font-medium capitalize">
                        {path.latest_scan.status}
                      </span>
                      <span className="text-gray-500 text-xs">
                        {new Date(path.latest_scan.started_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {path.latest_scan.status === 'running' && (
                        <span className="text-blue-400 text-sm font-medium">
                          {path.latest_scan.progress}%
                        </span>
                      )}
                      {path.latest_scan.status !== 'running' && (
                        <button
                          onClick={() => handleDeleteReport(path.latest_scan!.id, path.path)}
                          className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                          title="Delete scan report"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar for running scans */}
                  {path.latest_scan.status === 'running' && (
                    <div className="w-full bg-gray-600 rounded-full h-1.5 mb-2">
                      <div
                        className="bg-blue-400 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${path.latest_scan.progress}%` }}
                      ></div>
                    </div>
                  )}

                  {/* Scan statistics */}
                  <div className="grid grid-cols-5 gap-2 text-xs">
                    <div>
                      <div className="text-gray-300 font-medium">{path.latest_scan.files_scanned}</div>
                      <div className="text-gray-500">Scanned</div>
                    </div>
                    <div>
                      <div className="text-green-400 font-medium">{path.latest_scan.files_added}</div>
                      <div className="text-gray-500">Added</div>
                    </div>
                    <div>
                      <div className="text-blue-400 font-medium">{path.latest_scan.files_updated}</div>
                      <div className="text-gray-500">Updated</div>
                    </div>
                    <div>
                      <div className="text-yellow-400 font-medium">{path.latest_scan.files_skipped ?? 0}</div>
                      <div className="text-gray-500">Skipped</div>
                    </div>
                    <div>
                      <div className="font-medium text-red-400">
                        {path.latest_scan.errors_count}
                      </div>
                      <div className="text-gray-500">Errors</div>
                    </div>
                  </div>

                  {path.latest_scan.errors_count > 0 && (
                    <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded">
                      <div className="flex items-center gap-1 text-red-400 text-xs">
                        <XCircleIconSolid className="w-3 h-3" />
                        <span>{path.latest_scan.errors_count} error{path.latest_scan.errors_count > 1 ? 's' : ''} during last scan</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-800 rounded-lg p-3 text-center">
                  <p className="text-gray-500 text-sm">No scans yet</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {libraryPaths.length === 0 && (
          <p className="text-gray-400 text-center py-8">
            No library paths configured. Add a path to start scanning for music.
          </p>
        )}
      </div>

      {/* Library Overview */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
          <MusicalNoteIcon className="w-5 h-5 mr-2" />
          Library Overview ({totalSongs.toLocaleString()} songs)
        </h3>

        {/* Search */}
        <div className="mb-4 relative">
          <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search songs, artists, albums..."
            className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {loadingSongs && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            </div>
          )}
        </div>

        {/* Songs table */}
        {songs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 font-medium text-gray-300">Title</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-300">Artist</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-300">Album</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-300">Duration</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-300">Status</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {songs.map((song) => (
                  <tr key={song.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        {song.artwork_path ? (
                          <img
                            src={apiService.getArtworkUrl(song.artwork_path)}
                            alt=""
                            className="w-10 h-10 rounded object-cover mr-3"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center mr-3">
                            <MusicalNoteIcon className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <p className="text-white font-medium">{song.title}</p>
                          {song.genre && (
                            <p className="text-gray-400 text-sm">{song.genre}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-300">{song.artist_name || 'Unknown'}</td>
                    <td className="py-3 px-4 text-gray-300">{song.album_title || 'Unknown'}</td>
                    <td className="py-3 px-4 text-gray-300">
                      {song.duration ? `${Math.floor(song.duration / 60)}:${String(song.duration % 60).padStart(2, '0')}` : 'N/A'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <CheckCircleIcon className="w-4 h-4 text-green-400 mr-1" />
                        <span className="text-green-400 text-sm">Available</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleEditSong(song)}
                          className="p-1 text-gray-400 hover:text-primary transition-colors"
                          title="Edit song"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSong(song)}
                          className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                          title="Remove from library"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-gray-400">
                  Showing {startIndex.toLocaleString()} to {endIndex.toLocaleString()} of {totalSongs.toLocaleString()} songs
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1 || loadingSongs}
                    className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  
                  <div className="flex space-x-1">
                    {/* Show page numbers */}
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNumber = Math.max(1, currentPage - 2) + i;
                      if (pageNumber > totalPages) return null;
                      return (
                        <button
                          key={pageNumber}
                          onClick={() => handlePageChange(pageNumber)}
                          disabled={loadingSongs}
                          className={clsx(
                            'px-3 py-2 rounded-lg transition-colors',
                            pageNumber === currentPage
                              ? 'bg-primary text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          )}
                        >
                          {pageNumber}
                        </button>
                      );
                    })}
                    
                    {totalPages > currentPage + 2 && (
                      <span className="px-2 py-2 text-gray-400">...</span>
                    )}
                    
                    {totalPages > currentPage + 2 && (
                      <button
                        onClick={() => handlePageChange(totalPages)}
                        disabled={loadingSongs}
                        className="px-3 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {totalPages}
                      </button>
                    )}
                  </div>
                  
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages || loadingSongs}
                    className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            {loadingSongs ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-gray-400">Loading songs...</span>
              </div>
            ) : searchQuery ? (
              <p className="text-gray-400">No songs found matching "{searchQuery}"</p>
            ) : (
              <div>
                <MusicalNoteIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 mb-2">No songs in library</p>
                <p className="text-gray-500 text-sm">Add library paths and scan to populate your music collection</p>
              </div>
            )}
          </div>
        )}
      </div>
      </>
      )}

      {activeSubTab === 'duplicates' && (
        <DuplicatesTabContent
          songs={songs}
          setSongs={setSongs}
          onEditSong={handleEditSong}
          onDeleteSong={handleDeleteSong}
          refreshKey={duplicatesRefreshKey}
          showSuccess={showSuccess}
          showError={showError}
        />
      )}

      {activeSubTab === 'artist-images' && (
        <ArtistImagesTabContent
          showSuccess={showSuccess}
          showError={showError}
        />
      )}

      {activeSubTab === 'artist-splitting' && (
        <ArtistSplittingTabContent
          showSuccess={showSuccess}
          showError={showError}
        />
      )}

      {activeSubTab === 'jobs' && (
        <JobsTabContent
          showSuccess={showSuccess}
          showError={showError}
        />
      )}

      {/* Edit Song Modal */}
      <EditSongModal
        isOpen={editModalOpen}
        onClose={handleCloseEditModal}
        song={editingSong}
        onSongUpdated={handleSongUpdated}
      />

      {/* Scan Report Modal */}
      {selectedPathForReport && (
        <ScanReportModal
          isOpen={scanReportModalOpen}
          onClose={() => {
            setScanReportModalOpen(false);
            setSelectedPathForReport(null);
          }}
          pathId={selectedPathForReport.id}
          pathName={selectedPathForReport.path}
        />
      )}

      {/* Delete Scan Report Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteReportDialogOpen}
        onClose={() => setDeleteReportDialogOpen(false)}
        onConfirm={handleConfirmDeleteReport}
        title="Delete Scan Report"
        message={
          reportToDelete ? (
            <div>
              <p className="mb-2">Are you sure you want to delete this scan report?</p>
              <p className="text-sm text-gray-400">
                Path: {reportToDelete.path}
              </p>
              <p className="text-red-400 text-sm mt-3">
                This will permanently delete the report and all associated error logs. This action cannot be undone.
              </p>
            </div>
          ) : (
            'Are you sure you want to delete this scan report?'
          )
        }
        confirmText="Delete Report"
        cancelText="Cancel"
        type="danger"
      />

      {/* Delete Song Confirmation Dialog */}
      {songToDelete && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${deleteSongDialogOpen ? 'block' : 'hidden'}`}>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={() => setDeleteSongDialogOpen(false)}
          />

          {/* Dialog */}
          <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Delete Song</h3>

            <div className="mb-4">
              <p className="text-white mb-2">
                Are you sure you want to delete <span className="font-semibold">{songToDelete.title}</span> by <span className="font-semibold">{songToDelete.artist_name}</span>?
              </p>
              <p className="text-gray-400 text-sm mb-4">
                File path: <span className="font-mono text-xs">{songToDelete.file_path}</span>
              </p>

              {/* Checkbox for deleting file */}
              <label className="flex items-start space-x-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">
                <input
                  type="checkbox"
                  checked={deleteFileToo}
                  onChange={(e) => setDeleteFileToo(e.target.checked)}
                  className="w-4 h-4 text-primary bg-gray-600 border-gray-500 rounded focus:ring-primary focus:ring-2 mt-1"
                />
                <div className="flex-1">
                  <span className="text-white font-medium">Also delete the audio file</span>
                  <p className="text-gray-400 text-sm mt-1">
                    {deleteFileToo
                      ? '⚠️ The file will be permanently deleted from your disk. This cannot be undone!'
                      : 'Only the database entry will be removed. The file will remain on disk.'}
                  </p>
                </div>
              </label>

              {deleteFileToo && (
                <div className="mt-3 p-3 bg-red-900/20 border border-red-500/50 rounded-lg">
                  <p className="text-red-400 text-sm">
                    <span className="font-semibold">Warning:</span> You are about to permanently delete the file <span className="font-mono text-xs">"{songToDelete.file_path}"</span>. This action cannot be undone!
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setDeleteSongDialogOpen(false);
                }}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleConfirmDeleteSong();
                }}
                className={clsx(
                  'px-4 py-2 rounded-lg transition-colors',
                  deleteFileToo
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-yellow-600 text-white hover:bg-yellow-700'
                )}
              >
                {deleteFileToo ? 'Delete Song + File' : 'Delete Song Only'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rescan All Libraries Confirmation Dialog */}
      <ConfirmDialog
        isOpen={rescanAllDialogOpen}
        onClose={() => setRescanAllDialogOpen(false)}
        onConfirm={handleRescanAllLibraries}
        title="Rescan All Libraries"
        message={
          <div>
            <p className="mb-3">Are you sure you want to rescan all libraries?</p>
            <p className="text-sm text-gray-400 mb-2">
              This will:
            </p>
            <ul className="text-sm text-gray-400 list-disc list-inside mb-3 space-y-1">
              <li>Delete ALL songs from the database</li>
              <li>Clear all scan history</li>
              <li>Perform a fresh scan of all library paths</li>
            </ul>
            <p className="text-yellow-400 text-sm mb-2">
              Your music files will NOT be deleted.
            </p>
            <p className="text-red-400 text-sm">
              This action cannot be undone and may take a while depending on your library size.
            </p>
          </div>
        }
        confirmText="Rescan All Libraries"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
};

export default LibraryManagementTab;
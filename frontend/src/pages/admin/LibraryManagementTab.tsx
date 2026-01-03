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
  XCircleIcon as XCircleIconSolid
} from '@heroicons/react/24/outline';
import { apiService } from '../../services/api';
import { Song, ScanProgress } from '../../types';
import clsx from 'clsx';
import EditSongModal from '../../components/EditSongModal';
import ScanReportModal from '../../components/ScanReportModal';

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

const LibraryManagementTab: React.FC = () => {
  const [songs, setSongs] = useState<Song[]>([]);
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

  // New states for path selector
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<string[]>([]);
  const [isValidPath, setIsValidPath] = useState<boolean | null>(null);
  const [debouncedPath, setDebouncedPath] = useState('');
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

  const handleDeleteSong = async (songId: number) => {
    if (!window.confirm('Are you sure you want to delete this song? This will remove it from the database but not delete the file.')) {
      return;
    }

    try {
      await apiService.deleteSong(songId);
      await fetchSongs(currentPage, searchQuery);
    } catch (err: any) {
      console.error('Failed to delete song:', err);
      setError(err.message || 'Failed to delete song');
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

      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

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
              <button
                onClick={() => handleStartScan()}
                className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                <ArrowPathIcon className="w-4 h-4 mr-2" />
                Scan Library
              </button>
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
                    {path.latest_scan.status === 'running' && (
                      <span className="text-blue-400 text-sm font-medium">
                        {path.latest_scan.progress}%
                      </span>
                    )}
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
                          onClick={() => handleDeleteSong(song.id!)}
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
    </div>
  );
};

export default LibraryManagementTab;
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Song, Album, Playlist } from '../types';
import apiService from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { useRoomStore } from '../stores/roomStore';
import { useUserPlaylistsStore } from '../stores/userPlaylistsStore';
import { handleRoomAwarePlayback } from '../utils/roomPlayback';
import { useContextMenu } from '../hooks/useContextMenu';
import ContextMenu from '../components/ContextMenu';
import AddToPlaylistModal from '../components/AddToPlaylistModal';
import { useToast } from '../contexts/ToastContext';
import { copyToClipboard } from '../utils/clipboard';
import { useLayoutContext } from '../components/layout/MainLayout';
import {
  MusicalNoteIcon,
  PlayIcon,
  HeartIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  FolderIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  HomeIcon,
  XMarkIcon,
  Bars3Icon,
  CheckIcon,
  PlusIcon,
  ListBulletIcon,
  ArrowsRightLeftIcon,
  PhotoIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid, CheckIcon as CheckIconSolid } from '@heroicons/react/24/solid';

interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  songCount: number;
}

interface VirtualFolder {
  id: string;
  name: string;
  icon: React.ElementType;
}

const VIRTUAL_FOLDERS: VirtualFolder[] = [
  {
    id: 'all-albums',
    name: 'All Albums',
    icon: PhotoIcon
  },
  {
    id: 'random-songs',
    name: 'Random Songs',
    icon: ArrowsRightLeftIcon
  },
  {
    id: 'all-playlists',
    name: 'All Playlists',
    icon: ListBulletIcon
  },
  {
    id: 'recently-added',
    name: 'Recently Added',
    icon: ClockIcon
  }
];

const LibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [allPlaylists, setAllPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [addToPlaylistModalOpen, setAddToPlaylistModalOpen] = useState(false);
  const [selectedSongForPlaylist, setSelectedSongForPlaylist] = useState<Song | null>(null);
  const [bulkAddSongs, setBulkAddSongs] = useState<Song[]>([]);
  const [selectedSongs, setSelectedSongs] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [createPlaylistModalOpen, setCreatePlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const { setDisablePadding } = useLayoutContext();

  // Navigation state
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [currentVirtualFolder, setCurrentVirtualFolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [albumsPage, setAlbumsPage] = useState(1);
  const [playlistsPage, setPlaylistsPage] = useState(1);
  const perPage = 50;
  const albumsPerPage = 100;
  const playlistsPerPage = 100;

  // Refs for scrollable containers
  const albumsScrollRef = useRef<HTMLDivElement>(null);
  const playlistsScrollRef = useRef<HTMLDivElement>(null);
  const songsScrollRef = useRef<HTMLDivElement>(null);

  const { play, setQueue, currentSong, addToQueue } = usePlayerStore();
  const { user } = useAuthStore();
  const { addPlaylist: addUserPlaylist } = useUserPlaylistsStore();
  const { showSuccess, showError } = useToast();
  const {
    contextMenu,
    closeContextMenu,
    handleContextMenu,
    handleTouchStart,
    handleTouchEnd,
    handleTouchMove,
    handleClick
  } = useContextMenu();

  useEffect(() => {
    fetchLibraryData();
    fetchUserFavorites();

    // Disable padding for LibraryPage
    setDisablePadding(true);

    // Re-enable padding when component unmounts
    return () => {
      setDisablePadding(false);
    };
  }, [setDisablePadding]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setAlbumsPage(1);
    setPlaylistsPage(1);
  }, [currentFolder, currentVirtualFolder, searchQuery]);

  // Scroll to top when switching between folders
  useEffect(() => {
    // Small delay to ensure DOM has updated with new content
    setTimeout(() => {
      if (currentVirtualFolder === 'all-albums') {
        albumsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (currentVirtualFolder === 'all-playlists') {
        playlistsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (currentVirtualFolder === 'recently-added' || currentVirtualFolder === 'random-songs' || !currentVirtualFolder) {
        // For songs views
        songsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 0);
  }, [currentVirtualFolder, currentFolder]);

  // Fetch playlists when user changes (for admin vs non-admin view)
  useEffect(() => {
    if (user) {
      fetchPlaylists();
    }
  }, [user]);

  const fetchUserFavorites = async () => {
    try {
      const response: any = await apiService.getFavorites();
      const favoriteIds = new Set(response.data?.songs?.map((song: Song) => song.id) || []);
      setFavorites(favoriteIds as Set<number>);
    } catch (error) {
      console.error('Error fetching favorites:', error);
    }
  };

  const toggleFavorite = async (songId: number) => {
    try {
      await apiService.toggleFavorite(songId);
      setFavorites(prev => {
        const newFavorites = new Set(prev);
        if (newFavorites.has(songId)) {
          newFavorites.delete(songId);
        } else {
          newFavorites.add(songId);
        }
        return newFavorites;
      });
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const fetchLibraryData = async () => {
    try {
      setLoading(true);
      const response: any = await apiService.getSongs({ limit: 10000 });
      const allSongsData = response.data.songs || [];
      setAllSongs(allSongsData);

      const folderTree = buildFolderTree(allSongsData);
      setFolders(folderTree);

      // Fetch albums and playlists
      fetchAlbums();
      fetchPlaylists();
    } catch (error) {
      console.error('Error fetching library data:', error);
      showError('Failed to load library');
    } finally {
      setLoading(false);
    }
  };

  const fetchAlbums = async () => {
    try {
      const response: any = await apiService.getAlbums();
      setAlbums(response.data.albums || []);
    } catch (error) {
      console.error('Error fetching albums:', error);
    }
  };

  const fetchPlaylists = async () => {
    try {
      const response: any = await apiService.getAllPlaylists();
      // Filter playlists based on user role
      let playlists = response.data.playlists || [];
      if (user && !user.is_admin) {
        // Non-admins only see public playlists
        playlists = playlists.filter((p: Playlist) => p.is_public);
      }
      setAllPlaylists(playlists);
    } catch (error) {
      console.error('Error fetching playlists:', error);
    }
  };

  const buildFolderTree = (songs: Song[]): FolderNode[] => {
    const folderMap = new Map<string, FolderNode>();

    songs.forEach((song, index) => {
      if (!song.file_path) return;

      const normalizedPath = song.file_path.replace(/\\/g, '/');
      const parts = normalizedPath.split('/').filter(p => p && !p.endsWith('.mp3') && !p.endsWith('.flac') && !p.endsWith('.wav') && !p.endsWith('.m4a') && !p.endsWith('.ogg'));

      let currentPath = '';
      parts.forEach((part, partIndex) => {
        // Preserve leading slash for absolute paths (Linux)
        if (currentPath === '' && normalizedPath.startsWith('/')) {
          currentPath = `/${part}`;
        } else {
          currentPath = currentPath ? `${currentPath}/${part}` : part;
        }

        if (!folderMap.has(currentPath)) {
          folderMap.set(currentPath, {
            name: part,
            path: currentPath,
            children: [],
            songCount: 0
          });
        }
      });
    });

    // Count songs for each folder (including all subfolders recursively)
    songs.forEach(song => {
      if (!song.file_path) return;

      const normalizedPath = song.file_path.replace(/\\/g, '/');
      const parts = normalizedPath.split('/').filter(p => p && !p.endsWith('.mp3') && !p.endsWith('.flac') && !p.endsWith('.wav') && !p.endsWith('.m4a') && !p.endsWith('.ogg'));

      // Add count to ALL parent folders
      let currentPath = '';
      parts.forEach((part) => {
        // Preserve leading slash for absolute paths (Linux)
        if (currentPath === '' && normalizedPath.startsWith('/')) {
          currentPath = `/${part}`;
        } else {
          currentPath = currentPath ? `${currentPath}/${part}` : part;
        }
        const node = folderMap.get(currentPath);
        if (node) {
          node.songCount++;
        }
      });
    });

    const rootNodes: FolderNode[] = [];
    const sortedPaths = Array.from(folderMap.keys()).sort();

    sortedPaths.forEach(path => {
      const node = folderMap.get(path)!;
      const parentPath = path.substring(0, path.lastIndexOf('/'));

      if (parentPath && folderMap.has(parentPath)) {
        folderMap.get(parentPath)!.children.push(node);
      } else {
        rootNodes.push(node);
      }
    });

    return rootNodes;
  };

  const filteredSongs = useMemo(() => {
    let result = allSongs;

    if (currentVirtualFolder === 'recently-added') {
      result = [...result].sort((a, b) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
    } else if (currentVirtualFolder === 'random-songs') {
      // Shuffle songs randomly
      result = [...result].sort(() => Math.random() - 0.5);
    }

    if (currentFolder && !currentVirtualFolder) {
      result = result.filter(song => {
        if (!song.file_path) return false;
        const normalizedPath = song.file_path.replace(/\\/g, '/');
        const folderWithSlash = currentFolder.endsWith('/') ? currentFolder : `${currentFolder}/`;
        return normalizedPath.startsWith(folderWithSlash) || normalizedPath.startsWith(currentFolder);
      });
    }

    if (searchQuery && currentVirtualFolder !== 'all-albums' && currentVirtualFolder !== 'all-playlists') {
      const query = searchQuery.toLowerCase();
      result = result.filter(song =>
        song.title?.toLowerCase().includes(query) ||
        song.artist_name?.toLowerCase().includes(query) ||
        song.album_title?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [allSongs, currentFolder, currentVirtualFolder, searchQuery]);

  // Apply pagination
  const paginatedSongs = useMemo(() => {
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    return filteredSongs.slice(startIndex, endIndex);
  }, [filteredSongs, page, perPage]);

  const totalPages = Math.ceil(filteredSongs.length / perPage);

  // Apply pagination for albums
  const paginatedAlbums = useMemo(() => {
    const startIndex = (albumsPage - 1) * albumsPerPage;
    const endIndex = startIndex + albumsPerPage;
    return albums.slice(startIndex, endIndex);
  }, [albums, albumsPage]);

  const totalAlbumsPages = Math.ceil(albums.length / albumsPerPage);

  // Apply pagination for playlists
  const paginatedPlaylists = useMemo(() => {
    const startIndex = (playlistsPage - 1) * playlistsPerPage;
    const endIndex = startIndex + playlistsPerPage;
    return allPlaylists.slice(startIndex, endIndex);
  }, [allPlaylists, playlistsPage]);

  const totalPlaylistsPages = Math.ceil(allPlaylists.length / playlistsPerPage);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlaySong = (song: Song, songList: Song[] = paginatedSongs) => {
    handleRoomAwarePlayback(song, songList);
  };

  const handlePlayAll = (songs: Song[]) => {
    if (songs.length === 0) return;
    handleRoomAwarePlayback(songs[0], songs);
  };

  const toggleFolderExpanded = (folderPath: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath);
      } else {
        newSet.add(folderPath);
      }
      return newSet;
    });
  };

  const handleFolderClick = (folderPath: string) => {
    setCurrentFolder(folderPath);
    setCurrentVirtualFolder(null);
    setSearchQuery('');
    setMobileSidebarOpen(false);
  };

  const handleVirtualFolderClick = (folderId: string) => {
    setCurrentVirtualFolder(folderId);
    setCurrentFolder(null);
    setSearchQuery('');
    setMobileSidebarOpen(false);
  };

  const handleGoHome = () => {
    setCurrentFolder(null);
    setCurrentVirtualFolder(null);
    setSearchQuery('');
    setMobileSidebarOpen(false);
  };

  const renderFolderTree = (nodes: FolderNode[], level: number = 0) => {
    return nodes.map(node => (
      <div key={node.path}>
        <div
          className={`flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-colors ${
            currentFolder === node.path
              ? 'bg-blue-600 text-white'
              : 'hover:bg-gray-700 text-gray-300'
          }`}
          style={{ paddingLeft: `${12 + level * 16}px` }}
          onClick={() => handleFolderClick(node.path)}
        >
          {node.children.length > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFolderExpanded(node.path);
              }}
              className="p-1 hover:bg-gray-600 rounded transition-colors"
            >
              <ChevronDownIcon
                className={`w-4 h-4 transition-transform ${
                  expandedFolders.has(node.path) ? 'rotate-0' : '-rotate-90'
                }`}
              />
            </button>
          ) : (
            <div className="w-6" />
          )}
          <FolderIcon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 truncate text-sm">{node.name}</span>
          <span className="text-xs opacity-60">{node.songCount}</span>
        </div>
        {node.children.length > 0 && expandedFolders.has(node.path) && (
          <div>
            {renderFolderTree(node.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  const getBreadcrumbs = () => {
    if (currentVirtualFolder) {
      return [
        { name: 'Library', onClick: handleGoHome },
        { name: VIRTUAL_FOLDERS.find(f => f.id === currentVirtualFolder)?.name || currentVirtualFolder }
      ];
    }
    if (currentFolder) {
      const parts = currentFolder.split('/').filter(p => p);
      return [
        { name: 'Library', onClick: handleGoHome },
        ...parts.map((part, index) => ({
          name: part,
          onClick: index === parts.length - 1 ? undefined : () => {
            const newPath = parts.slice(0, index + 1).join('/');
            handleFolderClick(newPath);
          }
        }))
      ];
    }
    return [{ name: 'Library' }];
  };

  const handleContextMenuPlay = (song: Song) => {
    handlePlaySong(song, paginatedSongs);
  };

  const handleContextMenuAddToQueue = (song: Song) => {
    addToQueue(song);
  };

  const handleContextMenuAddToPlaylist = (song: Song) => {
    setSelectedSongForPlaylist(song);
    setAddToPlaylistModalOpen(true);
    closeContextMenu();
  };

  const handleContextMenuToggleFavorite = (song: Song) => {
    toggleFavorite(song.id);
  };

  const handleContextMenuShare = async (song: Song) => {
    try {
      const response = await apiService.createShareToken(song.id);
      const shareUrl = response.data.shareUrl;
      await copyToClipboard(shareUrl);
      showSuccess('Share URL copied to clipboard!');
    } catch (err) {
      console.error('Failed to create share URL:', err);
      showError('Failed to copy share URL. Please try again.');
    }
  };

  const handleCloseAddToPlaylistModal = () => {
    setAddToPlaylistModalOpen(false);
    setSelectedSongForPlaylist(null);
    setBulkAddSongs([]);
  };

  // Multi-select handlers
  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedSongs(new Set());
  };

  const toggleSongSelection = (songId: number) => {
    setSelectedSongs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(songId)) {
        newSet.delete(songId);
      } else {
        newSet.add(songId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedSongs.size === paginatedSongs.length) {
      setSelectedSongs(new Set());
    } else {
      setSelectedSongs(new Set(paginatedSongs.map(s => s.id)));
    }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      showError('Please enter a playlist name');
      return;
    }

    if (selectedSongs.size === 0) {
      showError('Please select at least one song');
      return;
    }

    try {
      // Create the playlist
      const response = await apiService.createPlaylist({
        name: newPlaylistName.trim(),
        is_public: false
      });
      const playlist = response.data.playlist;

      // Add to store to update sidebar
      addUserPlaylist(playlist);

      // Add all selected songs to the playlist
      const songIds = Array.from(selectedSongs);
      let addedCount = 0;

      for (const songId of songIds) {
        try {
          await apiService.addSongToPlaylist(playlist.id, songId);
          addedCount++;
        } catch (err) {
          console.error(`Failed to add song ${songId} to playlist:`, err);
        }
      }

      showSuccess(`Playlist "${newPlaylistName}" created with ${addedCount} songs`);
      setNewPlaylistName('');
      setCreatePlaylistModalOpen(false);
      setSelectedSongs(new Set());
      setSelectionMode(false);
    } catch (err) {
      console.error('Failed to create playlist:', err);
      showError('Failed to create playlist. Please try again.');
    }
  };

  const handleAddSelectedToPlaylist = async (playlistId: number) => {
    try {
      let addedCount = 0;
      const songIds = Array.from(selectedSongs);

      for (const songId of songIds) {
        try {
          await apiService.addSongToPlaylist(playlistId, songId);
          addedCount++;
        } catch (err) {
          console.error(`Failed to add song ${songId} to playlist:`, err);
        }
      }

      showSuccess(`Added ${addedCount} song${addedCount !== 1 ? 's' : ''} to playlist`);
      setSelectedSongs(new Set());
      setAddToPlaylistModalOpen(false);
    } catch (err) {
      console.error('Failed to add songs to playlist:', err);
      showError('Failed to add songs to playlist. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="flex gap-4 lg:gap-6 h-full relative flex flex-col lg:flex-row">
      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Mobile & Desktop */}
      <div
        className={`fixed lg:relative inset-y-0 left-0 z-50 w-80 max-w-[85vw] lg:w-64 transform transition-transform duration-300 ease-in-out lg:transform-none ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-full bg-gray-900 overflow-hidden flex flex-col">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center justify-between p-4 border-b border-gray-800">
            <h2 className="text-lg font-semibold text-white">Library</h2>
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <XMarkIcon className="w-6 h-6 text-white" />
            </button>
          </div>

          {/* Sidebar Content */}
          <div className="p-4 pr-0 flex flex-col h-full space-y-6 overflow-y-auto">
            {/* Virtual Folders */}
            <div className="flex-shrink-0">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Access</h3>
              <div className="space-y-1">
                <div
                  onClick={handleGoHome}
                  className={`flex items-center gap-3 py-2 px-3 rounded-lg cursor-pointer transition-colors ${
                    !currentFolder && !currentVirtualFolder
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  <HomeIcon className="w-5 h-5" />
                  <span className="flex-1 text-sm">All Music</span>
                  <span className="text-xs opacity-60">{allSongs.length}</span>
                </div>
                {VIRTUAL_FOLDERS.map(folder => {
                  const Icon = folder.icon;
                  return (
                    <div
                      key={folder.id}
                      onClick={() => handleVirtualFolderClick(folder.id)}
                      className={`flex items-center gap-3 py-2 px-3 rounded-lg cursor-pointer transition-colors ${
                        currentVirtualFolder === folder.id
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-700 text-gray-300'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="flex-1 text-sm">{folder.name}</span>
                      {folder.id === 'all-albums' && (
                        <span className="text-xs text-gray-400">{albums.length}</span>
                      )}
                      {folder.id === 'all-playlists' && (
                        <span className="text-xs text-gray-400">{allPlaylists.length}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Folder Tree */}
            <div className="flex-1 flex flex-col min-h-0">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Folders</h3>
              <div className="flex-1 space-y-1 min-h-0">
                {renderFolderTree(folders)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col h-full space-y-4 lg:space-y-6 overflow-hidden lg:pb-6 lg:pr-6">
        {/* Mobile Hamburger Menu Button */}
        <div className="lg:hidden flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <Bars3Icon className="w-6 h-6 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">
              {currentVirtualFolder
                ? VIRTUAL_FOLDERS.find(f => f.id === currentVirtualFolder)?.name
                : currentFolder
                ? currentFolder.split('/').pop()
                : 'All Music'}
            </h1>
            <p className="text-gray-400 text-sm">{filteredSongs.length} songs</p>
          </div>
        </div>

        {/* Header with Breadcrumbs and Search (Desktop) */}
        <div className="hidden lg:block flex-shrink-0">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 mb-4 text-sm">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={index}>
                {index > 0 && <ChevronRightIcon className="w-4 h-4 text-gray-500" />}
                {crumb.onClick ? (
                  <button
                    onClick={crumb.onClick}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {crumb.name}
                  </button>
                ) : (
                  <span className="text-white font-medium">{crumb.name}</span>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Title and Search */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl lg:text-3xl font-bold text-white">
                {currentVirtualFolder
                  ? VIRTUAL_FOLDERS.find(f => f.id === currentVirtualFolder)?.name
                  : currentFolder
                  ? currentFolder.split('/').pop()
                  : 'All Music'}
              </h1>
              <p className="text-gray-400 mt-1">
                {currentVirtualFolder === 'all-albums' ? `${albums.length} albums` :
                 currentVirtualFolder === 'all-playlists' ? `${allPlaylists.length} playlists` :
                 `${filteredSongs.length} songs`}
              </p>
            </div>

            {/* Search Bar - Only show for songs views */}
            {currentVirtualFolder !== 'all-albums' && currentVirtualFolder !== 'all-playlists' && (
              <div className="relative w-48 lg:w-80">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors text-sm lg:text-base"
                />
              </div>
            )}
          </div>
        </div>

        {/* Mobile Search Bar - Only show for songs views */}
        {currentVirtualFolder !== 'all-albums' && currentVirtualFolder !== 'all-playlists' && (
          <div className="lg:hidden relative flex-shrink-0">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search songs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors text-sm"
            />
          </div>
        )}

        {/* Selection Mode Toggle & Bulk Actions - Only show for songs views */}
        {currentVirtualFolder !== 'all-albums' && currentVirtualFolder !== 'all-playlists' && (
        <div className="flex items-center justify-between flex-shrink-0 gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={toggleSelectionMode}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                selectionMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {selectionMode ? (
                <>
                  <XMarkIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Cancel Selection</span>
                  <span className="sm:hidden">Cancel</span>
                </>
              ) : (
                <>
                  <CheckIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Select Songs</span>
                  <span className="sm:hidden">Select</span>
                </>
              )}
            </button>

            {!selectionMode && filteredSongs.length > 0 && (
              <button
                onClick={() => handlePlayAll(filteredSongs)}
                className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors text-sm font-medium"
              >
                <PlayIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Play All</span>
                <span className="sm:hidden">Play All ({filteredSongs.length})</span>
              </button>
            )}
          </div>

          {selectionMode && selectedSongs.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-400 whitespace-nowrap">
                <span className="hidden sm:inline">{selectedSongs.size} song{selectedSongs.size !== 1 ? 's' : ''} selected</span>
                <span className="sm:hidden">{selectedSongs.size}</span>
              </span>
              <button
                onClick={toggleSelectAll}
                className="px-2 sm:px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors text-xs sm:text-sm whitespace-nowrap"
              >
                <span className="hidden sm:inline">{selectedSongs.size === paginatedSongs.length ? 'Deselect All' : 'Select All'}</span>
                <span className="sm:hidden">{selectedSongs.size === paginatedSongs.length ? 'Deselect' : 'Select All'}</span>
              </button>
              <button
                onClick={() => setCreatePlaylistModalOpen(true)}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-xs sm:text-sm whitespace-nowrap"
              >
                <PlusIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Create Playlist</span>
                <span className="sm:hidden">Create</span>
              </button>
              <button
                onClick={() => {
                  setAddToPlaylistModalOpen(true);
                  // Pass selected songs for bulk add
                  const selectedSongsData = allSongs.filter(s => selectedSongs.has(s.id));
                  setSelectedSongForPlaylist(null);
                  // Store selected songs in a different state for bulk add
                  setBulkAddSongs(selectedSongsData);
                }}
                className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors text-xs sm:text-sm whitespace-nowrap"
              >
                <ListBulletIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Add to Playlist</span>
                <span className="sm:hidden">Add</span>
              </button>
            </div>
          )}
        </div>
        )}

        {/* Content Area - Songs, Albums, or Playlists */}
        {currentVirtualFolder === 'all-albums' ? (
          <div className="bg-gray-800 rounded-lg overflow-hidden flex flex-col flex-1 min-h-0">
            <div ref={albumsScrollRef} className="flex-1 overflow-y-auto min-h-0 p-4 lg:p-6">
              {albums.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <PhotoIcon className="w-12 h-12 lg:w-16 lg:h-16 text-gray-600 mb-4" />
                  <p className="text-gray-400 text-sm lg:text-base">No albums found</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {paginatedAlbums.map((album) => (
                    <div
                      key={album.id}
                      onClick={() => navigate(`/album/${album.id}`)}
                      className="group cursor-pointer"
                    >
                      <div className="relative w-full rounded-lg overflow-hidden bg-gray-700 mb-2" style={{ paddingBottom: '100%' }}>
                        <div className="absolute inset-0 flex items-center justify-center">
                          {album.artwork_path ? (
                            <img
                              src={apiService.getArtworkUrl(album.artwork_path)}
                              alt={album.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <MusicalNoteIcon className="w-12 h-12 text-gray-400" />
                          )}
                        </div>
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                          <PlayIcon className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transform scale-50 group-hover:scale-100 transition-all" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white text-sm font-medium truncate">{album.title}</h3>
                          <p className="text-gray-400 text-xs truncate">{album.artist_name}</p>
                        </div>
                        <span className="text-gray-500 text-xs ml-2 flex-shrink-0">{album.song_count || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination Controls for Albums */}
            {totalAlbumsPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
                <button
                  onClick={() => {
                    setAlbumsPage(p => Math.max(1, p - 1));
                    albumsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  disabled={albumsPage === 1}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Previous</span>
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">
                    Page {albumsPage} of {totalAlbumsPages}
                  </span>
                  <span className="text-gray-500 text-xs hidden sm:inline">
                    ({(albumsPage - 1) * albumsPerPage + 1}-{Math.min(albumsPage * albumsPerPage, albums.length)} of {albums.length})
                  </span>
                </div>

                <button
                  onClick={() => {
                    setAlbumsPage(p => Math.min(totalAlbumsPages, p + 1));
                    albumsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  disabled={albumsPage === totalAlbumsPages}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ) : currentVirtualFolder === 'all-playlists' ? (
          <div className="bg-gray-800 rounded-lg overflow-hidden flex flex-col flex-1 min-h-0">
            <div ref={playlistsScrollRef} className="flex-1 overflow-y-auto min-h-0 p-4 lg:p-6">
              {allPlaylists.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <ListBulletIcon className="w-12 h-12 lg:w-16 lg:h-16 text-gray-600 mb-4" />
                  <p className="text-gray-400 text-sm lg:text-base">No playlists found</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {paginatedPlaylists.map((playlist) => (
                    <div
                      key={playlist.id}
                      onClick={() => navigate(`/playlist/${playlist.id}`)}
                      className="group cursor-pointer"
                    >
                      <div className="relative aspect-square bg-gradient-to-br from-gray-700 to-gray-800 rounded-md overflow-hidden mb-2 flex items-center justify-center">
                        <ListBulletIcon className="w-16 h-16 text-gray-500" />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                          <PlayIcon className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transform scale-50 group-hover:scale-100 transition-all" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white text-sm font-medium truncate">{playlist.name}</h3>
                          <p className="text-gray-400 text-xs">{playlist.song_count || 0} songs</p>
                        </div>
                        <span className="text-gray-500 text-xs ml-2 flex-shrink-0">{playlist.song_count || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination Controls for Playlists */}
            {totalPlaylistsPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
                <button
                  onClick={() => {
                    setPlaylistsPage(p => Math.max(1, p - 1));
                    playlistsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  disabled={playlistsPage === 1}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Previous</span>
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">
                    Page {playlistsPage} of {totalPlaylistsPages}
                  </span>
                  <span className="text-gray-500 text-xs hidden sm:inline">
                    ({(playlistsPage - 1) * playlistsPerPage + 1}-{Math.min(playlistsPage * playlistsPerPage, allPlaylists.length)} of {allPlaylists.length})
                  </span>
                </div>

                <button
                  onClick={() => {
                    setPlaylistsPage(p => Math.min(totalPlaylistsPages, p + 1));
                    playlistsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  disabled={playlistsPage === totalPlaylistsPages}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg overflow-hidden flex flex-col flex-1 min-h-0">
            <div ref={songsScrollRef} className="flex-1 overflow-y-auto min-h-0" style={{ maxHeight: 'calc(100vh - 280px)' }}>
              {paginatedSongs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <MusicalNoteIcon className="w-12 h-12 lg:w-16 lg:h-16 text-gray-600 mb-4" />
                  <p className="text-gray-400 text-sm lg:text-base">
                    {searchQuery ? 'No songs match your search' : 'No songs in this folder'}
                  </p>
                </div>
              ) : (
                <div>
                  {paginatedSongs.map((song) => {
                  const isSelected = selectedSongs.has(song.id);
                  return (
                    <div
                      key={song.id}
                      data-song-context-menu
                      onClick={(e) => {
                        if (selectionMode) {
                          toggleSongSelection(song.id);
                        } else {
                          handleClick(e, () => handlePlaySong(song, paginatedSongs));
                        }
                      }}
                      onContextMenu={(e) => handleContextMenu(e, song)}
                      onTouchStart={(e) => handleTouchStart(e, song)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={handleTouchMove}
                      className={`flex items-center p-3 lg:p-4 hover:bg-gray-700 transition-colors border-b border-gray-800 last:border-b-0 group cursor-pointer ${
                        currentSong?.id === song.id
                          ? 'bg-blue-500 bg-opacity-20 border border-blue-500 border-opacity-50'
                          : ''
                      } ${
                        isSelected
                          ? 'bg-blue-600 bg-opacity-20'
                          : ''
                      }`}
                    >
                      {/* Selection Checkbox */}
                      {selectionMode && (
                        <div className="w-8 h-8 flex-shrink-0 mr-2 flex items-center justify-center">
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSongSelection(song.id);
                            }}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600'
                                : 'border-gray-500 hover:border-blue-500'
                            }`}
                          >
                            {isSelected && (
                              <CheckIconSolid className="w-3 h-3 text-white" />
                            )}
                          </div>
                        </div>
                      )}

                      <div className="w-10 h-10 lg:w-12 lg:h-12 bg-gray-700 rounded-md overflow-hidden flex-shrink-0 mr-3 lg:mr-4 relative flex items-center justify-center">
                      {song.artwork_path ? (
                        <img
                          src={apiService.getArtworkUrl(song.artwork_path)}
                          alt={song.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <MusicalNoteIcon className="w-5 h-5 lg:w-6 lg:h-6 text-gray-500" />
                      )}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded flex items-center justify-center transition-all">
                        <PlayIcon className="w-4 h-4 lg:w-5 lg:h-5 text-white opacity-0 group-hover:opacity-100" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-medium text-sm lg:text-base truncate mb-0.5 lg:mb-1">{song.title}</h4>
                      <p className="text-gray-400 text-xs lg:text-sm truncate">
                        {song.artist_name}
                        {song.album_title ? ` • ${song.album_title}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 lg:gap-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(song.id);
                        }}
                        className="p-1.5 lg:p-2 hover:bg-gray-600 rounded transition-colors"
                      >
                        {favorites.has(song.id) ? (
                          <HeartIconSolid className="w-4 h-4 lg:w-5 lg:h-5 text-red-500" />
                        ) : (
                          <HeartIcon className="w-4 h-4 lg:w-5 lg:h-5 text-gray-400 hover:text-red-500" />
                        )}
                      </button>

                      <span className="text-gray-400 text-xs lg:text-sm w-10 lg:w-12 text-right">
                        {song.duration ? formatDuration(song.duration) : '--:--'}
                      </span>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
              <button
                onClick={() => {
                  setPage(p => Math.max(1, p - 1));
                  songsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                disabled={page === 1}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                <ChevronLeftIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Previous</span>
              </button>

              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">
                  Page {page} of {totalPages}
                </span>
                <span className="text-gray-500 text-xs hidden sm:inline">
                  ({(page - 1) * perPage + 1}-{Math.min(page * perPage, filteredSongs.length)} of {filteredSongs.length})
                </span>
              </div>

              <button
                onClick={() => {
                  setPage(p => Math.min(totalPages, p + 1));
                  songsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                disabled={page === totalPages}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Context Menu */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={closeContextMenu}
        song={contextMenu.song}
        isAdmin={Boolean(user?.is_admin)}
        isFavorited={contextMenu.song ? favorites.has(contextMenu.song.id) : false}
        onPlay={handleContextMenuPlay}
        onAddToQueue={handleContextMenuAddToQueue}
        onAddToPlaylist={handleContextMenuAddToPlaylist}
        onToggleFavorite={handleContextMenuToggleFavorite}
        onShare={handleContextMenuShare}
        onEdit={undefined}
        onDelete={undefined}
      />

      {/* Add to Playlist Modal */}
      <AddToPlaylistModal
        isOpen={addToPlaylistModalOpen}
        onClose={handleCloseAddToPlaylistModal}
        song={selectedSongForPlaylist}
        songs={bulkAddSongs}
      />

      {/* Create Playlist Modal */}
      {createPlaylistModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-white mb-4">Create New Playlist</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Playlist Name
              </label>
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="My Awesome Playlist"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                autoFocus
              />
            </div>

            <div className="mb-6">
              <p className="text-sm text-gray-400">
                {selectedSongs.size} song{selectedSongs.size !== 1 ? 's' : ''} will be added to this playlist
              </p>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setCreatePlaylistModalOpen(false);
                  setNewPlaylistName('');
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePlaylist}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Create Playlist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LibraryPage;

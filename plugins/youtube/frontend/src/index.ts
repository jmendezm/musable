import React from 'react';
import { RouteObject } from 'react-router-dom';
import {
  VideoCameraIcon,
  MusicalNoteIcon,
  PhotoIcon
} from '@heroicons/react/24/outline';
import {
  FrontendPlugin,
  SidebarItem,
  AdminSection,
  PlayerAction,
  ContextMenuItem
} from '../../../core/frontend-types';
import { apiService } from '../../../frontend/src/services/api'; // Will be provided by context

// Import plugin components
import { ImageSearchModal } from './components/ImageSearchModal';
import { YTMusicResults } from './components/YTMusicResults';
import { YouTubeSearchPage } from './pages/YouTubeSearchPage';
import { YouTubeSettings } from './components/YouTubeSettings';

class YouTubeFrontendPlugin implements FrontendPlugin {
  id = 'youtube';
  name = 'YouTube Integration';
  version = '1.0.0';
  description = 'Search album artwork and download music from YouTube';
  author = 'Musable';

  // Require backend plugin
  backendDependencies = ['youtube'];

  private api: any;
  private isBackendAvailable = false;

  async initialize(): Promise<void> {
    // Check if backend plugin is available
    try {
      const response = await fetch('/api/plugins/youtube/health');
      this.isBackendAvailable = response.ok;
      console.log('YouTube frontend plugin initialized', {
        backendAvailable: this.isBackendAvailable
      });
    } catch (error) {
      console.warn('Backend YouTube plugin not available');
      this.isBackendAvailable = false;
    }
  }

  // Routes - adds /youtube page
  routes: RouteObject[] = [
    {
      path: '/youtube',
      element: React.createElement(YouTubeSearchPage)
    }
  ];

  // Sidebar items - adds YouTube section
  sidebarItems: SidebarItem[] = [
    {
      id: 'youtube-search',
      label: 'YouTube Music',
      icon: VideoCameraIcon,
      path: '/youtube',
      section: 'plugins',
      order: 1
    },
    {
      id: 'youtube-artwork',
      label: 'Artwork Search',
      icon: PhotoIcon,
      path: '/youtube/artwork',
      section: 'plugins',
      order: 2
    }
  ];

  // Admin sections - adds YouTube settings
  adminSections: AdminSection[] = [
    {
      id: 'youtube-settings',
      label: 'YouTube',
      icon: VideoCameraIcon,
      component: () => React.createElement(YouTubeSettings),
      path: '/admin/youtube',
      order: 5
    }
  ];

  // Player actions - add download from YouTube option
  playerActions: PlayerAction[] = [
    {
      id: 'youtube-download',
      label: 'Download from YouTube',
      icon: MusicalNoteIcon,
      action: (context) => {
        this.downloadCurrentSong(context);
      },
      showWhen: (context) => {
        // Only show if current song is not from YouTube
        return !context.currentSong?.source?.includes('youtube');
      },
      position: 'menu',
      tooltip: 'Search and download from YouTube Music',
      order: 100
    }
  ];

  // Context menu items
  contextMenuItems: ContextMenuItem[] = [
    {
      id: 'yt-search-artwork',
      label: 'Search Artwork on YouTube',
      action: (context) => {
        if (context.type === 'song') {
          this.searchArtwork(context.item);
        }
      },
      showWhen: (context) => {
        return context.type === 'song' || context.type === 'album';
      },
      order: 50
    },
    {
      id: 'yt-download-version',
      label: 'Find on YouTube Music',
      action: (context) => {
        if (context.type === 'song') {
          this.searchOnYouTube(context.item);
        }
      },
      showWhen: (context) => {
        return context.type === 'song';
      },
      order: 51,
      divider: true
    }
  ];

  // Private methods
  private async downloadCurrentSong(context: any): Promise<void> {
    const { currentSong } = context;

    if (!currentSong) {
      return;
    }

    const query = `${currentSong.artist_name} ${currentSong.title}`;

    try {
      // This would open the YouTube search with the song info
      window.location.href = `/youtube?q=${encodeURIComponent(query)}`;
    } catch (error) {
      console.error('Failed to open YouTube search:', error);
    }
  }

  private async searchArtwork(item: any): Promise<void> {
    const query = item.artist_name && item.album_title
      ? `${item.artist_name} ${item.album_title}`
      : item.title;

    // Open image search modal with query
    // This would dispatch an event or call a modal service
    window.dispatchEvent(new CustomEvent('open-image-search', {
      detail: { query }
    }));
  }

  private async searchOnYouTube(item: any): Promise<void> {
    const query = `${item.artist_name} ${item.title}`;

    try {
      window.location.href = `/youtube?q=${encodeURIComponent(query)}`;
    } catch (error) {
      console.error('Failed to search on YouTube:', error);
    }
  }

  async cleanup(): Promise<void> {
    console.log('YouTube frontend plugin cleanup');
  }
}

// Export the plugin
const youtubeFrontendPlugin = new YouTubeFrontendPlugin();
export default youtubeFrontendPlugin;

// Also export components for direct use if needed
export { ImageSearchModal, YTMusicResults };

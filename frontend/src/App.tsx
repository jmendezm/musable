import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useFollowedAlbumsStore } from './stores/followedAlbumsStore';
import { useFollowedPlaylistsStore } from './stores/followedPlaylistsStore';
import { ToastProvider } from './contexts/ToastContext';
import { searchExtensionManager } from './services/searchExtensions';
import { imageSearchExtensionManager } from './services/imageSearchExtensions';
import { frontendPluginLoader } from './services/frontendPluginLoader';
import { apiService } from './services/api';

// Layout components
import MainLayout from './components/layout/MainLayout';
import AuthLayout from './components/layout/AuthLayout';

// Page components
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import HomePage from './pages/HomePage';
import LibraryPage from './pages/LibraryPage';
import FavoritesPage from './pages/FavoritesPage';
import ArtistPage from './pages/ArtistPage';
import AlbumPage from './pages/AlbumPage';
import PlaylistsPage from './pages/PlaylistsPage';
import PlaylistDetailPage from './pages/PlaylistDetailPage';
import HistoryPage from './pages/HistoryPage';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/admin/AdminPage';
import SharePage from './pages/SharePage';
import Rooms from './pages/Rooms';
import RoomView from './pages/RoomView';

// Component imports
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoadingSpinner from './components/ui/LoadingSpinner';

const App: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuthStore();
  const { loadFollowedAlbums } = useFollowedAlbumsStore();
  const { loadFollowedPlaylists } = useFollowedPlaylistsStore();
  const [pluginsLoaded, setPluginsLoaded] = useState(false);

  useEffect(() => {
    // Expose extension managers and API service to window for plugins
    (window as any).searchExtensionManager = searchExtensionManager;
    (window as any).imageSearchExtensionManager = imageSearchExtensionManager;
    (window as any).apiService = apiService;

    // Load all plugins dynamically on app startup
    const loadPlugins = async () => {
      try {
        await frontendPluginLoader.loadPlugins(apiService);
        setPluginsLoaded(true);
      } catch (error) {
        console.error('Error loading plugins:', error);
        setPluginsLoaded(true);
      }
    };

    loadPlugins();

    return () => {
      frontendPluginLoader.cleanupAll();
    };
  }, []);

  useEffect(() => {
    // Load followed items when user is authenticated
    if (isAuthenticated) {
      loadFollowedAlbums();
      loadFollowedPlaylists();
    }
  }, [isAuthenticated, loadFollowedAlbums, loadFollowedPlaylists]);

  if (isLoading || !pluginsLoaded) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="App">
        <Routes>
        {/* Public share routes */}
        <Route path="/share/:token" element={<SharePage />} />

        {/* Auth routes */}
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/" replace /> : 
          <AuthLayout><LoginPage /></AuthLayout>
        } />
        <Route path="/register/:token?" element={
          isAuthenticated ? <Navigate to="/" replace /> : 
          <AuthLayout><RegisterPage /></AuthLayout>
        } />

        {/* Protected main app routes */}
        <Route path="/*" element={
          <ProtectedRoute>
            <MainLayout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/favorites" element={<FavoritesPage />} />
                <Route path="/artist/:id" element={<ArtistPage />} />
                <Route path="/album/:id" element={<AlbumPage />} />
                <Route path="/playlists" element={<PlaylistsPage />} />
                <Route path="/playlist/:id" element={<PlaylistDetailPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/rooms" element={<Rooms />} />
                <Route path="/rooms/:code" element={<RoomView />} />
                
                {/* Admin routes */}
                <Route path="/admin/*" element={
                  <ProtectedRoute requireAdmin>
                    <Routes>
                      <Route path="/*" element={<AdminPage />} />
                    </Routes>
                  </ProtectedRoute>
                } />

                {/* Catch all route */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </MainLayout>
          </ProtectedRoute>
        } />
        </Routes>
      </div>
    </ToastProvider>
  );
};

export default App;
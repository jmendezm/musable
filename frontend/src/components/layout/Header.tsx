import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  UserCircleIcon,
  UserIcon,
  ArrowLeftOnRectangleIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../../stores/authStore';
import { getApiBaseUrl } from '../../config/config';
import GlobalSearchBar from '../GlobalSearchBar';
import clsx from 'clsx';

const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const isAdminPage = location.pathname.startsWith('/admin');

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const canGoBack = window.history.length > 1;
  const canGoForward = false; // Browser history doesn't expose forward capability

  return (
    <header className="bg-black/50 backdrop-blur-sm px-2 sm:px-4 md:px-6 py-3 sm:py-4 relative z-50">
      <div className="flex items-center justify-between gap-4">
        {/* Navigation buttons */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {/* Desktop navigation buttons */}
          <div className="hidden sm:flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => navigate(-1)}
              disabled={!canGoBack}
              className={clsx(
                'p-2 rounded-full transition-all',
                canGoBack
                  ? 'text-white hover:bg-gray-800 hover:scale-105'
                  : 'text-gray-600 cursor-not-allowed'
              )}
              title="Go back"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>

            <button
              onClick={() => navigate(1)}
              disabled={!canGoForward}
              className={clsx(
                'p-2 rounded-full transition-all',
                canGoForward
                  ? 'text-white hover:bg-gray-800 hover:scale-105'
                  : 'text-gray-600 cursor-not-allowed'
              )}
              title="Go forward"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar - centered with fixed width (hidden on admin pages) */}
        {!isAdminPage && (
          <div className="flex-1 max-w-2xl lg:max-w-xl mx-auto">
            <GlobalSearchBar />
          </div>
        )}

        {/* User menu - hide on mobile */}
        <div className="relative flex-shrink-0 hidden sm:block" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center space-x-3 p-2 rounded-full hover:bg-gray-800 transition-colors group"
          >
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-white group-hover:text-primary transition-colors">
              {user?.username}
            </p>
            <p className="text-xs text-gray-400">
              {user?.is_admin ? 'Admin' : 'User'}
            </p>
          </div>
          
          <div className="relative w-8 h-8">
            {user?.profile_picture ? (
              <>
                <img
                  src={`${getApiBaseUrl().replace('/api', '')}${user.profile_picture.startsWith('/') ? '' : '/'}${user.profile_picture}`}
                  alt={`${user.username}'s profile`}
                  className="w-8 h-8 rounded-full object-cover border border-gray-600"
                  onError={(e) => {
                    // If image fails to load, hide it and show fallback
                    (e.target as HTMLImageElement).style.display = 'none';
                    const fallback = (e.target as HTMLImageElement).parentElement?.querySelector('.fallback-icon');
                    if (fallback) (fallback as HTMLElement).classList.remove('hidden');
                  }}
                />
                <div className="fallback-icon hidden w-8 h-8 bg-gradient-to-r from-primary to-secondary rounded-full flex items-center justify-center absolute top-0 left-0">
                  <UserCircleIcon className="w-6 h-6 text-white" />
                </div>
              </>
            ) : (
              <div className="w-8 h-8 bg-gradient-to-r from-primary to-secondary rounded-full flex items-center justify-center">
                <UserCircleIcon className="w-6 h-6 text-white" />
              </div>
            )}
          </div>
        </button>

        {/* Dropdown menu */}
        {showUserMenu && (
          <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-2" style={{ zIndex: 9999 }}>
            <div className="px-4 py-2 border-b border-gray-700">
              <p className="text-sm font-medium text-white">{user?.username}</p>
              <p className="text-xs text-gray-400">{user?.email}</p>
            </div>

            <button
              onClick={() => {
                navigate(`/profile/${user?.username}`);
                setShowUserMenu(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors flex items-center space-x-2"
            >
              <UserIcon className="w-4 h-4" />
              <span>My Profile</span>
            </button>

            <button
              onClick={() => {
                navigate('/settings');
                setShowUserMenu(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors flex items-center space-x-2"
            >
              <Cog6ToothIcon className="w-4 h-4" />
              <span>Settings</span>
            </button>

            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-gray-700 transition-colors flex items-center space-x-2"
            >
              <ArrowLeftOnRectangleIcon className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </div>
        )}
        </div>
      </div>
    </header>
  );
};

export default Header;
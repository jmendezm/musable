import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  HomeIcon, 
  MagnifyingGlassIcon,
  MusicalNoteIcon,
  HeartIcon,
  Cog6ToothIcon,
  QueueListIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { 
  HomeIcon as HomeIconSolid,
  MagnifyingGlassIcon as MagnifyingGlassIconSolid,
  MusicalNoteIcon as MusicalNoteIconSolid,
  HeartIcon as HeartIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
  QueueListIcon as QueueListIconSolid,
  ShieldCheckIcon as ShieldCheckIconSolid
} from '@heroicons/react/24/solid';
import clsx from 'clsx';
import { useAuthStore } from '../../stores/authStore';

interface BottomNavItemProps {
  to: string;
  icon: React.ComponentType<any>;
  solidIcon: React.ComponentType<any>;
  label: string;
  isActive: boolean;
}

const BottomNavItem: React.FC<BottomNavItemProps> = ({ to, icon: Icon, solidIcon: SolidIcon, label, isActive }) => {
  return (
    <div className="flex-shrink-0">
      <NavLink
        to={to}
        className={({ isActive: isLinkActive }) => clsx(
          'flex flex-col items-center justify-center py-2 px-1 transition-all duration-200',
          'min-h-[64px] min-w-[72px] flex-shrink-0'
        )}
      >
        {({ isActive: isLinkActive }) => (
          <>
            {isLinkActive ? (
              <SolidIcon className="w-6 h-6 text-primary mb-1" />
            ) : (
              <Icon className="w-6 h-6 text-gray-400 mb-1" />
            )}
            <span className={clsx(
              'text-xs font-medium text-center leading-tight',
              isLinkActive ? 'text-primary' : 'text-gray-400'
            )}>
              {label}
            </span>
          </>
        )}
      </NavLink>
    </div>
  );
};

const BottomNavigation: React.FC = () => {
  const { user } = useAuthStore();
  const location = useLocation();
  const [leftGlowOpacity, setLeftGlowOpacity] = useState(0);
  const [rightGlowOpacity, setRightGlowOpacity] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate scroll indicator intensity
  const updateScrollIndicators = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollLeft = container.scrollLeft;
    const scrollWidth = container.scrollWidth;
    const clientWidth = container.clientWidth;

    // Calculate how much content is hidden on each side
    const maxScroll = scrollWidth - clientWidth;
    const leftHidden = scrollLeft; // How many pixels are hidden on the left
    const rightHidden = maxScroll - scrollLeft; // How many pixels are hidden on the right

    // Calculate opacity based on how much is hidden (max 0.7)
    const maxGlowOpacity = 0.7;
    setLeftGlowOpacity(Math.min(leftHidden / 100, maxGlowOpacity));
    setRightGlowOpacity(Math.min(rightHidden / 100, maxGlowOpacity));
  }, []);

  // Update scroll indicators on scroll and resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Initial check
    updateScrollIndicators();

    // Add scroll listener
    container.addEventListener('scroll', updateScrollIndicators);
    window.addEventListener('resize', updateScrollIndicators);

    // Update after a short delay to ensure layout is complete
    const timer = setTimeout(updateScrollIndicators, 100);

    return () => {
      container.removeEventListener('scroll', updateScrollIndicators);
      window.removeEventListener('resize', updateScrollIndicators);
      clearTimeout(timer);
    };
  }, [updateScrollIndicators, user?.is_admin]);

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-black border-t border-gray-800 z-20">
      <div ref={containerRef} className="overflow-x-auto scrollbar-hide relative">
        <div className="flex items-center">
          <BottomNavItem
            to="/"
            icon={HomeIcon}
            solidIcon={HomeIconSolid}
            label="Home"
            isActive={location.pathname === '/'}
          />

          <BottomNavItem
            to="/search"
            icon={MagnifyingGlassIcon}
            solidIcon={MagnifyingGlassIconSolid}
            label="Search"
            isActive={location.pathname === '/search'}
          />

          <BottomNavItem
            to="/library"
            icon={MusicalNoteIcon}
            solidIcon={MusicalNoteIconSolid}
            label="Library"
            isActive={location.pathname === '/library'}
          />

          <BottomNavItem
            to="/playlists"
            icon={QueueListIcon}
            solidIcon={QueueListIconSolid}
            label="Playlists"
            isActive={location.pathname === '/playlists'}
          />

          <BottomNavItem
            to="/favorites"
            icon={HeartIcon}
            solidIcon={HeartIconSolid}
            label="Liked"
            isActive={location.pathname === '/favorites'}
          />

          <BottomNavItem
            to="/settings"
            icon={Cog6ToothIcon}
            solidIcon={Cog6ToothIconSolid}
            label="Settings"
            isActive={location.pathname === '/settings'}
          />

          {/* Show admin panel for admin users only */}
          {Boolean(user?.is_admin) && (
            <BottomNavItem
              to="/admin"
              icon={ShieldCheckIcon}
              solidIcon={ShieldCheckIconSolid}
              label="Admin"
              isActive={location.pathname === '/admin'}
            />
          )}
        </div>
      </div>

      {/* Left Scroll Indicator Glow - Fixed to edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-16 pointer-events-none z-10 transition-opacity duration-300"
        style={{
          opacity: leftGlowOpacity,
          background: 'linear-gradient(to right, rgba(130, 170, 242, 0.3), transparent)'
        }}
      />

      {/* Right Scroll Indicator Glow - Fixed to edge */}
      <div
        className="absolute right-0 top-0 bottom-0 w-16 pointer-events-none z-10 transition-opacity duration-300"
        style={{
          opacity: rightGlowOpacity,
          background: 'linear-gradient(to left, rgba(130, 170, 242, 0.3), transparent)'
        }}
      />
    </div>
  );
};

export default BottomNavigation;
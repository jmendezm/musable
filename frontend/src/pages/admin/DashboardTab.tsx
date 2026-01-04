import React, { useEffect, useState } from 'react';
import {
  UsersIcon,
  MusicalNoteIcon,
  PlayIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ServerIcon
} from '@heroicons/react/24/outline';
import { apiService } from '../../services/api';
import { DashboardStats } from '../../types';
import { playbackWebSocketService } from '../../services/playbackWebSocket';

// Format time in MM:SS format
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Get device badge color based on OS
const getDeviceBadgeColor = (deviceInfo: string): string => {
  const lower = deviceInfo.toLowerCase();

  if (lower.includes('iphone') || lower.includes('ipad')) {
    return 'bg-gray-900 text-gray-100 border-gray-700'; // Dark gray/soft black for iOS
  }
  if (lower.includes('android')) {
    return 'bg-green-600 text-white border-green-700'; // Android green
  }
  if (lower.includes('windows')) {
    return 'bg-blue-600 text-white border-blue-700'; // Windows blue (#0078D7 style)
  }
  if (lower.includes('mac') || lower.includes('safari')) {
    return 'bg-gray-500 text-white border-gray-600'; // Gray for Mac
  }

  return 'bg-gray-700 text-gray-200 border-gray-600'; // Default gray
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<any>;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, trend }) => (
  <div className="bg-gray-800 rounded-lg p-5">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-gray-400 text-sm font-medium">{title}</p>
        <p className="text-white text-2xl font-bold mt-1">{value}</p>
        {trend && (
          <div className={`flex items-center mt-2 text-sm ${trend.isPositive ? 'text-green-400' : 'text-red-400'}`}>
            <ArrowTrendingUpIcon className={`w-4 h-4 mr-1 ${!trend.isPositive ? 'rotate-180' : ''}`} />
            {trend.value}% last 30d
          </div>
        )}
      </div>
      <div className="bg-primary/20 rounded-lg p-3">
        <Icon className="w-6 h-6 text-primary" />
      </div>
    </div>
  </div>
);

const DashboardTab: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<any[]>([]);
  const [activeRooms, setActiveRooms] = useState<any[]>([]);

  // Log when currentlyPlaying changes
  useEffect(() => {
    console.log('🎵 Dashboard: currentlyPlaying state changed:', currentlyPlaying.length, 'users');
    console.log('🎵 Dashboard: currentlyPlaying data:', currentlyPlaying);
  }, [currentlyPlaying]);

  // Log when activeRooms changes
  useEffect(() => {
    console.log('🎵 Dashboard: activeRooms state changed:', activeRooms.length, 'rooms');
    console.log('🎵 Dashboard: activeRooms data:', activeRooms);
  }, [activeRooms]);

  // Fetch active rooms and listen for WebSocket updates
  useEffect(() => {
    let retryTimer: NodeJS.Timeout | null = null;

    const setupActiveRoomsListener = () => {
      const socket = playbackWebSocketService.getSocket();
      if (!socket) {
        console.warn('🎵 Dashboard: Playback WebSocket not connected for active rooms, retrying...');
        retryTimer = setTimeout(setupActiveRoomsListener, 1000);
        return;
      }

      // Initial fetch
      const fetchActiveRooms = async () => {
        try {
          const response = await apiService.getActiveRooms();
          setActiveRooms(response.data.activeRooms);
        } catch (err: any) {
          console.error('Failed to fetch active rooms:', err);
        }
      };

      fetchActiveRooms();

      // Listen for WebSocket updates
      const handleActiveRoomsUpdate = (data: { activeRooms: any[] }) => {
        console.log('🎵 Dashboard: Received active_rooms_update:', data);
        console.log('🎵 Dashboard: Active rooms data:', JSON.stringify(data.activeRooms, null, 2));
        setActiveRooms(data.activeRooms);
      };

      // Only add listener once
      if (!socket.hasListeners('active_rooms_update')) {
        socket.on('active_rooms_update', handleActiveRoomsUpdate);
        console.log('🎵 Dashboard: Listening for active rooms updates. Socket connected:', socket.connected);
      }

      return () => {
        socket.off('active_rooms_update', handleActiveRoomsUpdate);
      };
    };

    const cleanup = setupActiveRoomsListener();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (cleanup) cleanup();
    };
  }, []);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiService.getDashboardStats();
        setStats(response.data);
      } catch (err: any) {
        console.error('Failed to fetch dashboard stats:', err);
        setError(err.message || 'Failed to load dashboard statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardStats();
  }, []);

  // Listen for currently playing updates via WebSocket
  useEffect(() => {
    let retryTimer: NodeJS.Timeout | null = null;

    const setupListener = () => {
      const socket = playbackWebSocketService.getSocket();
      if (!socket) {
        console.warn('🎵 Dashboard: Playback WebSocket not connected yet, retrying...');
        retryTimer = setTimeout(setupListener, 1000);
        return;
      }

      const handleCurrentlyPlayingUpdate = (data: { currentlyPlaying: any[] }) => {
        console.log('🎵 Dashboard: Received currently_playing_update event');
        console.log('🎵 Dashboard: Data received:', JSON.stringify(data, null, 2));
        console.log('🎵 Dashboard: Number of users:', data.currentlyPlaying.length);
        console.log('🎵 Dashboard: About to update state with currentlyPlaying data');
        setCurrentlyPlaying(data.currentlyPlaying);
        console.log('🎵 Dashboard: State updated');
      };

      // Only add listener once
      if (!socket.hasListeners('currently_playing_update')) {
        socket.on('currently_playing_update', handleCurrentlyPlayingUpdate);
        console.log('🎵 Dashboard: Listening for currently_playing updates. Socket connected:', socket.connected);

        // Request current state immediately after setting up listener
        console.log('🎵 Dashboard: Requesting current state from server');
        socket.emit('get_currently_playing');
      }

      return () => {
        socket.off('currently_playing_update', handleCurrentlyPlayingUpdate);
      };
    };

    const cleanup = setupListener();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (cleanup) cleanup();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-6">
        <p className="text-red-400">Error loading dashboard: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Dashboard Overview</h2>
        <p className="text-gray-400 text-sm">System statistics and recent activity</p>
      </div>

      {/* 3-Column Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Column 1: Stats (3 columns wide) */}
        <div className="xl:col-span-3 space-y-4">
          <StatCard
            title="Total Users"
            value={stats?.users.total || 0}
            icon={UsersIcon}
            trend={stats?.trends?.users ? {
              value: Math.abs(stats.trends.users.change),
              isPositive: stats.trends.users.change >= 0
            } : undefined}
          />
          <StatCard
            title="Total Songs"
            value={stats?.library.songs || 0}
            icon={MusicalNoteIcon}
            trend={stats?.trends?.songs ? {
              value: Math.abs(stats.trends.songs.change),
              isPositive: stats.trends.songs.change >= 0
            } : undefined}
          />
          <StatCard
            title="Total Plays"
            value={stats?.listening.total_plays || 0}
            icon={PlayIcon}
            trend={stats?.trends?.plays ? {
              value: Math.abs(stats.trends.plays.change),
              isPositive: stats.trends.plays.change >= 0
            } : undefined}
          />
          <StatCard
            title="Hours Listened"
            value={stats?.listening.total_listening_time ? Math.round(stats.listening.total_listening_time / 3600) : 0}
            icon={ClockIcon}
            trend={stats?.trends?.listeningTime ? {
              value: Math.abs(stats.trends.listeningTime.change),
              isPositive: stats.trends.listeningTime.change >= 0
            } : undefined}
          />
        </div>

        {/* Column 2: Currently Using + Active Rooms (6 columns wide - main focus) */}
        <div className="xl:col-span-6 space-y-4">
          {/* Currently Using - Half height */}
          <div className="bg-gray-800 rounded-lg p-5">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
              <ServerIcon className="w-5 h-5 mr-2" />
              Currently Using {currentlyPlaying.length > 0 && `(${currentlyPlaying.length})`}
            </h3>
            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2">
            {currentlyPlaying.length > 0 ? (
              currentlyPlaying.map((play: any, index: number) => (
                <div
                  key={index}
                  className={`py-2 px-3 rounded-lg border-2 transition-all ${
                    play.is_idle
                      ? 'bg-gray-700/10 border-gray-500'
                      : play.is_playing
                      ? 'bg-green-900/10 border-green-500'
                      : play.is_paused
                      ? 'bg-yellow-900/10 border-yellow-500'
                      : 'bg-gray-700/10 border-gray-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center flex-1 min-w-0">
                      {play.is_idle ? (
                        // Idle state - show user icon
                        <div className="w-10 h-10 bg-gray-600/30 rounded-full flex items-center justify-center mr-2 flex-shrink-0">
                          <ServerIcon className="w-5 h-5 text-gray-400" />
                        </div>
                      ) : play.artwork_path ? (
                        <img
                          src={apiService.getArtworkUrl(play.artwork_path)}
                          alt={play.album_title || 'Album artwork'}
                          className="w-10 h-10 rounded object-cover mr-2 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center mr-2 flex-shrink-0">
                          <MusicalNoteIcon className="w-5 h-5 text-primary" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {play.is_idle ? (
                            <>
                              <p className="text-white font-medium text-sm">{play.username}</p>
                              <span className="text-xs text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded">
                                ID: {play.connection_id}
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded border ${getDeviceBadgeColor(play.device_info)}`}>
                                {play.device_info}
                              </span>
                            </>
                          ) : (
                            <p className="text-white font-medium text-sm truncate">{play.song_title}</p>
                          )}
                          {play.is_idle && (
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                              <span className="text-xs text-gray-400">Idle</span>
                            </div>
                          )}
                          {!play.is_idle && play.is_playing && (
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                              <span className="text-xs text-green-400">Playing</span>
                            </div>
                          )}
                          {!play.is_idle && play.is_paused && (
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                              <span className="text-xs text-yellow-400">Paused</span>
                            </div>
                          )}
                        </div>
                        {play.is_idle ? (
                          <p className="text-gray-400 text-xs">Currently browsing</p>
                        ) : (
                          <>
                            <p className="text-gray-400 text-xs truncate">{play.artist_name}</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-gray-500 text-xs">{play.username}</p>
                              <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">
                                ID: {play.connection_id}
                              </span>
                              <span className={`text-xs px-1.5 py-0.5 rounded border ${getDeviceBadgeColor(play.device_info)}`}>
                                {play.device_info}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Progress bar - only show if not idle */}
                  {!play.is_idle && play.duration > 0 && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-700 rounded-full h-1 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            play.is_playing
                              ? 'bg-gradient-to-r from-green-500 to-green-400'
                              : 'bg-gradient-to-r from-yellow-500 to-yellow-400'
                          }`}
                          style={{ width: `${Math.min(100, play.progress)}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-xs text-gray-400">
                          {formatTime(play.current_time)} / {formatTime(play.duration)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {play.is_playing ? 'Live' : play.is_paused ? 'Paused' : 'Stopped'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <ServerIcon className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No users currently online</p>
              </div>
            )}
            </div>
          </div>

          {/* Active Rooms Section */}
          <div className="bg-gray-800 rounded-lg p-5">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
              <MusicalNoteIcon className="w-5 h-5 mr-2" />
              Active Rooms {activeRooms.length > 0 && `(${activeRooms.length})`}
            </h3>
            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2">
              {activeRooms.length > 0 ? (
                activeRooms.map((room: any, index: number) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      room.is_playing
                        ? 'bg-purple-900/10 border-purple-500'
                        : 'bg-gray-700/10 border-gray-600'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-white font-medium text-sm truncate">{room.name}</p>
                          <span className="text-xs text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded">
                            {room.code}
                          </span>
                          {room.is_playing && (
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                              <span className="text-xs text-purple-400">Playing</span>
                            </div>
                          )}
                        </div>
                        {room.song_info ? (
                          <div>
                            <p className="text-gray-400 text-xs truncate">
                              {room.song_info.title} by {room.song_info.artist_name}
                            </p>
                            {/* Progress bar */}
                            {room.song_info.duration > 0 && (
                              <div className="mt-1">
                                <div className="w-full bg-gray-700 rounded-full h-1 overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-300 ${
                                      room.is_playing
                                        ? 'bg-gradient-to-r from-purple-500 to-purple-400'
                                        : 'bg-gradient-to-r from-gray-500 to-gray-400'
                                    }`}
                                    style={{
                                      width: `${Math.min(100, (room.current_position / room.song_info.duration) * 100)}%`
                                    }}
                                  />
                                </div>
                                <div className="flex justify-between mt-0.5">
                                  <span className="text-xs text-gray-500">
                                    {formatTime(room.current_position)} / {formatTime(room.song_info.duration)}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {room.is_playing ? 'Playing' : 'Paused'}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-gray-500 text-xs italic">No song playing</p>
                        )}
                      </div>
                    </div>

                    {/* Participants */}
                    {room.participants && (
                      <div className="mt-2 pt-2 border-t border-gray-700">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">Participants ({room.participant_count})</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {room.participants.map((participant: any, pIndex: number) => (
                            <span
                              key={pIndex}
                              className={`text-xs px-2 py-0.5 rounded border ${
                                participant.role === 'host'
                                  ? 'bg-blue-900/30 text-blue-400 border-blue-700'
                                  : 'bg-gray-700/30 text-gray-400 border-gray-600'
                              }`}
                            >
                              {participant.username}
                              {participant.role === 'host' && ' 👑'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <MusicalNoteIcon className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400">No active rooms</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Column 3: System Status + Recent Activity (3 columns wide) */}
        <div className="xl:col-span-3 space-y-4">
          {/* System Status */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
              <ServerIcon className="w-5 h-5 mr-2" />
              System Status
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Server Status</span>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                  <span className="text-green-400 text-sm">Online</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Database</span>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                  <span className="text-green-400 text-sm">Connected</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Library Scanner</span>
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                  <span className="text-green-400 text-sm">Ready</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">Total Songs</span>
                <span className="text-white text-sm">
                  {stats?.library.songs || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Recent Activity Log - Scrollable */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Recent Activity</h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {stats?.recentActivity?.map((activity: any, index: number) => (
                <div key={index} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                  <div className="flex items-center flex-1 min-w-0">
                    {activity.artwork_path ? (
                      <img
                        src={apiService.getArtworkUrl(activity.artwork_path)}
                        alt={activity.album_title || 'Album artwork'}
                        className="w-8 h-8 rounded object-cover mr-3 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                        <PlayIcon className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm truncate">{activity.song_title} by {activity.artist_name}</p>
                      <p className="text-gray-400 text-xs">{activity.username}</p>
                    </div>
                  </div>
                  <span className="text-gray-400 text-xs ml-2 flex-shrink-0">
                    {new Date(activity.played_at).toLocaleTimeString()}
                  </span>
                </div>
              )) || (
                <p className="text-gray-400 text-center py-4">No recent activity</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardTab;
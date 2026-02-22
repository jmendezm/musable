import React, { useEffect, useState } from 'react';
import {
  ClockIcon,
  UserIcon,
  MusicalNoteIcon,
  ChartBarIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { apiService } from '../../services/api';
import { ListenHistory, User } from '../../types';
import clsx from 'clsx';

interface HistoryFilters {
  user?: number;
  type?: 'completed' | 'skipped' | 'partial' | 'all';
  dateFrom?: string;
  dateTo?: string;
  minDuration?: number;
  maxDuration?: number;
  limit: number;
  offset: number;
}

const HistoryTab: React.FC = () => {
  const [history, setHistory] = useState<ListenHistory[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<HistoryFilters>({
    limit: 50,
    offset: 0,
    type: 'all'
  });
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<string>('');

  useEffect(() => {
    fetchData();
  }, [filters]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const queryFilters: any = {
        limit: filters.limit,
        offset: filters.offset
      };

      if (filters.user) {
        queryFilters.user = filters.user;
      }
      if (filters.type && filters.type !== 'all') {
        queryFilters.type = filters.type;
      }
      if (filters.dateFrom) {
        queryFilters.dateFrom = filters.dateFrom;
      }
      if (filters.dateTo) {
        queryFilters.dateTo = filters.dateTo;
      }
      if (filters.minDuration) {
        queryFilters.minDuration = filters.minDuration;
      }
      if (filters.maxDuration) {
        queryFilters.maxDuration = filters.maxDuration;
      }

      const response = await apiService.getAllHistory(queryFilters);
      setHistory(response.data.history);
    } catch (err: any) {
      console.error('Failed to fetch history:', err);
      setError(err.message || 'Failed to load listening history');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await apiService.getAllUsers();
      setUsers(response.data.users);
    } catch (err: any) {
      console.error('Failed to fetch users:', err);
    }
  };

  const handleUserFilterChange = (userId: string) => {
    setSelectedUser(userId);
    setFilters(prev => ({
      ...prev,
      user: userId ? parseInt(userId) : undefined,
      offset: 0
    }));
  };

  const handleClearFilters = () => {
    setSelectedUser('');
    setFilters({ limit: 50, offset: 0, type: 'all' });
  };

  const hasActiveFilters = filters.user || filters.type !== 'all' ||
    filters.dateFrom || filters.dateTo ||
    filters.minDuration || filters.maxDuration;

  const handleLoadMore = () => {
    setFilters(prev => ({
      ...prev,
      offset: prev.offset + prev.limit
    }));
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  const formatTotalTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getListeningStats = () => {
    const totalPlays = history.length;
    const uniqueSongs = new Set(history.map(h => h.song_id)).size;
    const uniqueUsers = new Set(history.map(h => h.user_id)).size;
    const totalDuration = history.reduce((sum, h) => sum + (h.duration_played || 0), 0);

    return {
      totalPlays,
      uniqueSongs,
      uniqueUsers,
      totalDuration: Math.round(totalDuration)
    };
  };

  const stats = getListeningStats();

  if (loading && history.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Listen History</h2>
        <p className="text-gray-400">View and manage user listening activity</p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center">
            <ChartBarIcon className="w-8 h-8 text-primary mr-3" />
            <div>
              <p className="text-gray-400 text-sm">Total Plays</p>
              <p className="text-white text-xl font-bold">{stats.totalPlays}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center">
            <MusicalNoteIcon className="w-8 h-8 text-primary mr-3" />
            <div>
              <p className="text-gray-400 text-sm">Unique Songs</p>
              <p className="text-white text-xl font-bold">{stats.uniqueSongs}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center">
            <UserIcon className="w-8 h-8 text-primary mr-3" />
            <div>
              <p className="text-gray-400 text-sm">Active Users</p>
              <p className="text-white text-xl font-bold">{stats.uniqueUsers}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center">
            <ClockIcon className="w-8 h-8 text-primary mr-3" />
            <div>
              <p className="text-gray-400 text-sm">Total Time</p>
              <p className="text-white text-xl font-bold">
                {formatTotalTime(stats.totalDuration)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        {/* Filters Header */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <h3 className="text-lg font-semibold text-white">
              Recent Activity ({history.length} entries)
            </h3>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="flex items-center px-3 py-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium self-start md:self-auto"
              >
                <XMarkIcon className="w-4 h-4 mr-1.5" />
                Clear Filters
              </button>
            )}
          </div>

          {/* Compact Filters */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            <div>
              <select
                value={selectedUser}
                onChange={(e) => handleUserFilterChange(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All Users</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.username}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={filters.type || 'all'}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  type: (e.target.value === 'all' ? undefined : e.target.value as any),
                  offset: 0
                }))}
                className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Types</option>
                <option value="completed">Completed</option>
                <option value="partial">Partial</option>
                <option value="skipped">Skipped</option>
              </select>
            </div>

            <div>
              <input
                type="date"
                placeholder="From date"
                value={filters.dateFrom || ''}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  dateFrom: e.target.value || undefined,
                  offset: 0
                }))}
                className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <input
                type="date"
                placeholder="To date"
                value={filters.dateTo || ''}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  dateTo: e.target.value || undefined,
                  offset: 0
                }))}
                className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <input
                type="number"
                min="0"
                placeholder="Min duration (s)"
                value={filters.minDuration || ''}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  minDuration: e.target.value ? parseInt(e.target.value) : undefined,
                  offset: 0
                }))}
                className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <input
                type="number"
                min="0"
                placeholder="Max duration (s)"
                value={filters.maxDuration || ''}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  maxDuration: e.target.value ? parseInt(e.target.value) : undefined,
                  offset: 0
                }))}
                className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Items per page */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-gray-400">Per page:</span>
            <select
              value={filters.limit}
              onChange={(e) => setFilters(prev => ({
                ...prev,
                limit: parseInt(e.target.value),
                offset: 0
              }))}
              className="px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="p-6">
        {history.length > 0 ? (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 px-4 font-medium text-gray-300">Song</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-300">User</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-300">Duration</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-300">Completed</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-300">Played At</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry, index) => (
                    <tr key={`${entry.id}-${index}`} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="py-3 px-4">
                        <div className="flex items-center">
                          {(entry as any).artwork_path ? (
                            <img
                              src={apiService.getArtworkUrl((entry as any).artwork_path)}
                              alt={entry.album_title || 'Album artwork'}
                              className="w-10 h-10 rounded object-cover mr-3"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-gray-600 rounded flex items-center justify-center mr-3">
                              <MusicalNoteIcon className="w-4 h-4 text-gray-400" />
                            </div>
                          )}
                          <div>
                            <p className="text-white font-medium">
                              {entry.song_title || 'Unknown Song'}
                            </p>
                            <p className="text-gray-400 text-sm">
                              {entry.artist_name || 'Unknown Artist'}
                              {entry.album_title && ` • ${entry.album_title}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center">
                          <div className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center mr-2">
                            <UserIcon className="w-3 h-3 text-primary" />
                          </div>
                          <span className="text-gray-300">
                            {entry.username || `User ${entry.user_id}`}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-300">
                        {entry.duration_played !== null && entry.duration_played !== undefined
                          ? formatDuration(entry.duration_played)
                          : 'N/A'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={clsx(
                          'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                          // If duration_played is null, show as Unknown (unknown duration)
                          entry.duration_played === null
                            ? 'bg-gray-700/50 text-gray-400'
                            : entry.duration_played < 5
                            ? 'bg-gray-700/50 text-gray-400'
                            : entry.completed
                            ? 'bg-green-900/20 text-green-400'
                            : 'bg-yellow-900/20 text-yellow-400'
                        )}>
                          {entry.duration_played === null
                            ? 'Unknown'
                            : entry.duration_played < 5
                            ? 'Skipped'
                            : entry.completed
                            ? 'Complete'
                            : 'Partial'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-300 text-sm">
                        {new Date(entry.played_at!).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Load More */}
            {history.length >= filters.limit && (
              <div className="mt-6 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <ClockIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 mb-2">No listening history found</p>
            <p className="text-gray-500 text-sm">
              {selectedUser ? 'Try selecting a different user or clear filters' : 'User activity will appear here as they listen to music'}
            </p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default HistoryTab;
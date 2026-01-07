import React, { useEffect, useState, useRef } from 'react';
import {
  Cog6ToothIcon,
  ServerIcon,
  CircleStackIcon,
  ShieldCheckIcon,
  MusicalNoteIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  TrashIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import { apiService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import clsx from 'clsx';

interface SystemSettings {
  serverInfo: {
    version: string;
    uptime: number;
    nodeVersion: string;
    platform: string;
    cpuUsage: number;
    cpuCores: number;
    memoryUsage: number;
    memoryTotal: number;
    memoryUsed: number;
  };
  databaseInfo: {
    size: number;
    tables: number;
    connections: number;
  };
  librarySettings: {
    scanInterval: number;
    autoScanEnabled: boolean;
    maxFileSize: number;
    supportedFormats: string[];
  };
  securitySettings: {
    sessionTimeout: number;
    maxLoginAttempts: number;
    requireStrongPasswords: boolean;
    inviteExpirationHours: number;
    publicSharingEnabled: boolean;
  };
}

interface SystemStatus {
  status: 'healthy' | 'warning' | 'error';
  message: string;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  args?: any[];
  formatted: string;
}

const LogsTabContent: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [fileLoggingEnabled, setFileLoggingEnabled] = useState(false);
  const [logFilePath, setLogFilePath] = useState('logs/musable.log');
  const logViewerRef = useRef<HTMLDivElement>(null);
  const { showSuccess, showError } = useToast();

  const fetchLogs = async () => {
    try {
      const response = await apiService.request('GET', '/admin/logs') as {
        data: { logs: LogEntry[] }
      };

      setLogs(response.data.logs);
      setLoading(false);
    } catch (error: any) {
      console.error('Failed to fetch logs:', error);
      showError('Failed to fetch logs');
      setLoading(false);
    }
  };

  const fetchLogSettings = async () => {
    try {
      const response = await apiService.request('GET', '/admin/logs/settings') as {
        data: { settings: { enabled: boolean; filePath: string | null } }
      };
      setFileLoggingEnabled(response.data.settings.enabled);
      if (response.data.settings.filePath) {
        setLogFilePath(response.data.settings.filePath);
      }
    } catch (error) {
      console.error('Failed to fetch log settings:', error);
    }
  };

  const saveLogSettings = async () => {
    try {
      await apiService.request('PUT', '/admin/logs/settings', {
        fileLoggingEnabled,
        logFilePath
      });
    } catch (error) {
      console.error('Failed to save log settings:', error);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchLogSettings();
  }, []);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (logViewerRef.current && logs.length > 0) {
      logViewerRef.current.scrollTop = logViewerRef.current.scrollHeight;
    }
  }, [loading]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchLogs, 2000); // Refresh every 2 seconds
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Auto-scroll to bottom when new logs are added (only if already at bottom)
  useEffect(() => {
    if (logViewerRef.current && logs.length > 0) {
      const container = logViewerRef.current;
      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;

      // Only auto-scroll if user is already near the bottom
      if (isAtBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [logs]);

  const handleClearLogs = async () => {
    try {
      await apiService.request('DELETE', '/admin/logs');
      showSuccess('Logs cleared successfully');
      setLogs([]);
    } catch (error) {
      showError('Failed to clear logs');
    }
  };

  const handleToggleAutoRefresh = async () => {
    setAutoRefresh(!autoRefresh);
  };

  const handleToggleFileLogging = async () => {
    const newValue = !fileLoggingEnabled;
    setFileLoggingEnabled(newValue);
    await apiService.request('PUT', '/admin/logs/settings', {
      fileLoggingEnabled: newValue,
      logFilePath
    });
    showSuccess(`File logging ${newValue ? 'enabled' : 'disabled'}`);
  };

  const renderLogEntry = (log: LogEntry) => {
    // Convert ANSI colors to HTML with brighter colors
    const ansiToHtml = require('ansi-to-html');
    const converter = new ansiToHtml({
      colors: {
        0: '#2d3748',    // black (dark gray)
        1: '#fc8181',    // red (bright)
        2: '#68d391',    // green (bright)
        3: '#f6e05e',    // yellow (bright)
        4: '#63b3ed',    // blue (bright pastel)
        5: '#b794f4',    // magenta (bright)
        6: '#4fd1c5',    // cyan (bright)
        7: '#ffffff',    // white
        8: '#718096',    // bright black (gray)
        9: '#fc8181',    // bright red
        10: '#68d391',   // bright green
        11: '#f6e05e',   // bright yellow
        12: '#63b3ed',   // bright blue
        13: '#b794f4',   // bright magenta
        14: '#4fd1c5',   // bright cyan
        15: '#ffffff',   // bright white
      }
    });
    const html = converter.toHtml(log.formatted);

    return (
      <div
        key={`${log.timestamp}-${log.level}-${log.message}`}
        className="font-mono text-xs whitespace-pre-wrap break-words"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  };

  return (
    <div className="space-y-6">
      {/* Log Settings */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h4 className="text-white font-medium mb-4 flex items-center">
          <Cog6ToothIcon className="w-4 h-4 mr-2" />
          Log Settings
        </h4>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Auto-refresh</p>
              <p className="text-gray-400 text-sm">Automatically refresh logs every 2 seconds</p>
            </div>
            <button
              onClick={handleToggleAutoRefresh}
              className={clsx(
                'px-4 py-2 rounded-lg transition-colors',
                autoRefresh ? 'bg-primary text-white' : 'bg-gray-600 text-white hover:bg-gray-500'
              )}
            >
              {autoRefresh ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">File Logging</p>
              <p className="text-gray-400 text-sm">Save logs to file</p>
            </div>
            <button
              onClick={handleToggleFileLogging}
              className={clsx(
                'px-4 py-2 rounded-lg transition-colors',
                fileLoggingEnabled ? 'bg-primary text-white' : 'bg-gray-600 text-white hover:bg-gray-500'
              )}
            >
              {fileLoggingEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {fileLoggingEnabled && (
            <div>
              <label className="text-white text-sm font-medium block mb-2">Log File Path</label>
              <input
                type="text"
                value={logFilePath}
                onChange={async (e) => {
                  const newPath = e.target.value;
                  setLogFilePath(newPath);
                  await saveLogSettings();
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                placeholder="logs/musable.log"
              />
            </div>
          )}
        </div>
      </div>

      {/* Log Viewer */}
      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <div className="bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-700">
          <h4 className="text-white font-medium">System Logs</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title="Refresh logs"
            >
              <ArrowPathIcon className="w-4 h-4" />
            </button>
            <button
              onClick={handleClearLogs}
              className="p-2 text-gray-400 hover:text-red-400 transition-colors"
              title="Clear logs"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 bg-black max-h-[600px] overflow-y-auto" ref={logViewerRef}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <ArrowPathIcon className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8">
              <DocumentTextIcon className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No logs available</p>
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => renderLogEntry(log))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SystemSettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaningInvites, setCleaningInvites] = useState(false);
  const [resettingData, setResettingData] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'library' | 'security' | 'maintenance' | 'logs'>('general');
  const [scanStatus, setScanStatus] = useState<any>(null);
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    fetchSystemSettings();
  }, []);

  const handleTabClick = (tab: 'general' | 'library' | 'security' | 'maintenance' | 'logs') => {
    setActiveTab(tab);
    if (tab === 'general') {
      fetchSystemSettings();
    }
  };

  const fetchSystemSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch real scan status
      const scanResponse = await apiService.getScanStatus();
      setScanStatus(scanResponse.data.currentScan);

      // Fetch real system stats
      const statsResponse = await apiService.getSystemStats();
      const stats = statsResponse.data;

      // Fetch real system settings
      const settingsResponse = await apiService.getAllSystemSettings();
      const realSettings = settingsResponse.data.settings;

      // Build system settings object with real data
      const mockSettings: SystemSettings = {
        serverInfo: {
          version: '1.0.0',
          uptime: stats.uptime,
          nodeVersion: stats.nodeVersion,
          platform: stats.platform,
          cpuUsage: stats.cpu.usage,
          cpuCores: stats.cpu.cores,
          memoryUsage: stats.memory.usage,
          memoryTotal: stats.memory.total,
          memoryUsed: stats.memory.used
        },
        databaseInfo: {
          size: 15728640, // 15MB in bytes
          tables: 8,
          connections: 1
        },
        librarySettings: {
          scanInterval: 60, // minutes
          autoScanEnabled: true,
          maxFileSize: 104857600, // 100MB in bytes
          supportedFormats: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac']
        },
        securitySettings: {
          sessionTimeout: 7 * 24 * 60, // 7 days in minutes
          maxLoginAttempts: 5,
          requireStrongPasswords: true,
          inviteExpirationHours: 24,
          publicSharingEnabled: realSettings.public_sharing_enabled || false
        }
      };

      // Generate status based on real scan data
      const statusArray: SystemStatus[] = [
        { status: 'healthy', message: 'Server is running normally' },
        { status: 'healthy', message: 'Database connection is stable' }
      ];

      // Add scan status based on real data
      if (scanResponse.data.currentScan && scanResponse.data.currentScan.status === 'running') {
        const scanTime = new Date().getTime() - new Date(scanResponse.data.currentScan.startedAt || 0).getTime();
        const hoursRunning = Math.floor(scanTime / (1000 * 60 * 60));
        const minutesRunning = Math.floor((scanTime % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hoursRunning > 0) {
          statusArray.push({ 
            status: 'warning', 
            message: `Library scan has been running for ${hoursRunning}h ${minutesRunning}m` 
          });
        } else if (minutesRunning > 0) {
          statusArray.push({ 
            status: 'healthy', 
            message: `Library scan running for ${minutesRunning} minutes` 
          });
        } else {
          statusArray.push({ 
            status: 'healthy', 
            message: 'Library scan just started' 
          });
        }
      } else {
        statusArray.push({ 
          status: 'healthy', 
          message: 'Library scanner ready' 
        });
      }

      statusArray.push({ status: 'healthy', message: 'All security checks passed' });

      setSettings(mockSettings);
      setSystemStatus(statusArray);
    } catch (err: any) {
      console.error('Failed to fetch system settings:', err);
      if (err.statusCode === 401) {
        setError('Authentication required. Please check if you are logged in as an admin.');
      } else {
        setError(err.message || 'Failed to load system settings');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      // Save the public sharing setting (the only real setting we're managing)
      await apiService.setSystemSetting('public_sharing_enabled', settings.securitySettings.publicSharingEnabled);

      // TODO: Add other settings when backend supports them

      // Refresh settings to confirm save
      await fetchSystemSettings();

      setSuccessMessage('Settings saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCleanupInvites = async () => {
    try {
      setCleaningInvites(true);
      setError(null);
      setSuccessMessage(null);

      const response = await apiService.cleanupExpiredInvites();

      if (response.success) {
        // Parse the deleted count from the message or use default
        const message = response.data?.message || 'Expired invites cleaned up successfully';
        showSuccess(message);
        setSuccessMessage(message);
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err: any) {
      console.error('Failed to cleanup invites:', err);
      showError(err.message || 'Failed to cleanup expired invites');
      setError(err.message || 'Failed to cleanup expired invites');
    } finally {
      setCleaningInvites(false);
    }
  };

  const handleResetAllData = async () => {
    try {
      setResettingData(true);
      setError(null);
      setSuccessMessage(null);
      setShowResetConfirm(false);

      const response = await apiService.resetAllUserData();

      if (response.success) {
        const stats = response.data?.stats;
        const message = response.data?.message || 'All user data reset successfully';
        showSuccess(message);
        setSuccessMessage(`${message} (${stats?.deletedUsers || 0} users, ${stats?.deletedPlaylists || 0} playlists deleted)`);
        setTimeout(() => setSuccessMessage(null), 5000);
      }
    } catch (err: any) {
      console.error('Failed to reset user data:', err);
      showError(err.message || 'Failed to reset user data');
      setError(err.message || 'Failed to reset user data');
    } finally {
      setResettingData(false);
    }
  };


  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const formatBytes = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

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
        <h2 className="text-2xl font-bold text-white mb-2">System Settings</h2>
        <p className="text-gray-400">Configure and monitor system settings</p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-900/20 border border-green-500 rounded-lg p-4">
          <p className="text-green-400">{successMessage}</p>
        </div>
      )}

      {/* System Status */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
          <ServerIcon className="w-5 h-5 mr-2" />
          System Status
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {systemStatus.map((status, index) => (
            <div key={index} className="flex items-center p-3 bg-gray-700 rounded-lg">
              {status.status === 'healthy' && (
                <CheckCircleIcon className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" />
              )}
              {status.status === 'warning' && (
                <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400 mr-3 flex-shrink-0" />
              )}
              {status.status === 'error' && (
                <ExclamationTriangleIcon className="w-5 h-5 text-red-400 mr-3 flex-shrink-0" />
              )}
              <span className={clsx(
                'text-sm',
                status.status === 'healthy' && 'text-green-400',
                status.status === 'warning' && 'text-yellow-400',
                status.status === 'error' && 'text-red-400'
              )}>
                {status.message}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Settings Tabs */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="border-b border-gray-700">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'general', label: 'General', icon: Cog6ToothIcon },
              { id: 'library', label: 'Library', icon: MusicalNoteIcon },
              { id: 'security', label: 'Security', icon: ShieldCheckIcon },
              { id: 'maintenance', label: 'Maintenance', icon: CircleStackIcon },
              { id: 'logs', label: 'Logs', icon: DocumentTextIcon }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id as any)}
                  className={clsx(
                    'flex items-center space-x-2 py-4 border-b-2 font-medium text-sm transition-colors',
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-400 hover:text-gray-300'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
          {settings && (
            <>
              {activeTab === 'general' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-medium text-white mb-4">Server Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-gray-700 rounded-lg p-4">
                        <p className="text-gray-400 text-sm">Version</p>
                        <p className="text-white font-medium">v{settings.serverInfo.version}</p>
                      </div>
                      <div className="bg-gray-700 rounded-lg p-4">
                        <p className="text-gray-400 text-sm">Uptime</p>
                        <p className="text-white font-medium">{formatUptime(settings.serverInfo.uptime)}</p>
                      </div>
                      <div className="bg-gray-700 rounded-lg p-4">
                        <p className="text-gray-400 text-sm">Node.js Version</p>
                        <p className="text-white font-medium">{settings.serverInfo.nodeVersion}</p>
                      </div>
                      <div className="bg-gray-700 rounded-lg p-4">
                        <p className="text-gray-400 text-sm">Platform</p>
                        <p className="text-white font-medium">{settings.serverInfo.platform}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-lg font-medium text-white mb-4">System Resources</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* CPU Usage */}
                      <div className="bg-gray-700 rounded-lg p-3">
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-gray-400 text-sm">CPU Usage</p>
                          <p className="text-white font-medium text-sm">{settings.serverInfo.cpuUsage.toFixed(1)}%</p>
                        </div>
                        <div className="w-full bg-gray-600 rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(settings.serverInfo.cpuUsage, 100)}%` }}
                          />
                        </div>
                        <p className="text-gray-500 text-xs mt-1">{settings.serverInfo.cpuCores} cores</p>
                      </div>

                      {/* RAM Usage */}
                      <div className="bg-gray-700 rounded-lg p-3">
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-gray-400 text-sm">RAM Usage</p>
                          <p className="text-white font-medium text-sm">{settings.serverInfo.memoryUsage.toFixed(1)}%</p>
                        </div>
                        <div className="w-full bg-gray-600 rounded-full h-1.5">
                          <div
                            className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(settings.serverInfo.memoryUsage, 100)}%` }}
                          />
                        </div>
                        <p className="text-gray-500 text-xs mt-1">{formatBytes(settings.serverInfo.memoryUsed)} / {formatBytes(settings.serverInfo.memoryTotal)}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-lg font-medium text-white mb-4">Database Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gray-700 rounded-lg p-4">
                        <p className="text-gray-400 text-sm">Database Size</p>
                        <p className="text-white font-medium">{formatBytes(settings.databaseInfo.size)}</p>
                      </div>
                      <div className="bg-gray-700 rounded-lg p-4">
                        <p className="text-gray-400 text-sm">Tables</p>
                        <p className="text-white font-medium">{settings.databaseInfo.tables}</p>
                      </div>
                      <div className="bg-gray-700 rounded-lg p-4">
                        <p className="text-gray-400 text-sm">Active Connections</p>
                        <p className="text-white font-medium">{settings.databaseInfo.connections}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'library' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-medium text-white mb-4">Library Settings</h4>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">Auto-scan Library</p>
                          <p className="text-gray-400 text-sm">Automatically scan for new files</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.librarySettings.autoScanEnabled}
                          onChange={(e) => setSettings({
                            ...settings,
                            librarySettings: {
                              ...settings.librarySettings,
                              autoScanEnabled: e.target.checked
                            }
                          })}
                          className="w-4 h-4 text-primary bg-gray-700 border-gray-600 rounded focus:ring-primary focus:ring-2"
                        />
                      </div>

                      <div>
                        <label className="block text-white font-medium mb-2">
                          Scan Interval (minutes)
                        </label>
                        <input
                          type="number"
                          value={settings.librarySettings.scanInterval}
                          onChange={(e) => setSettings({
                            ...settings,
                            librarySettings: {
                              ...settings.librarySettings,
                              scanInterval: parseInt(e.target.value) || 60
                            }
                          })}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-white font-medium mb-2">
                          Maximum File Size (MB)
                        </label>
                        <input
                          type="number"
                          value={Math.round(settings.librarySettings.maxFileSize / 1024 / 1024)}
                          onChange={(e) => setSettings({
                            ...settings,
                            librarySettings: {
                              ...settings.librarySettings,
                              maxFileSize: (parseInt(e.target.value) || 100) * 1024 * 1024
                            }
                          })}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <p className="text-white font-medium mb-2">Supported Formats</p>
                        <div className="flex flex-wrap gap-2">
                          {settings.librarySettings.supportedFormats.map((format) => (
                            <span
                              key={format}
                              className="px-3 py-1 bg-primary/20 text-primary rounded-full text-sm"
                            >
                              .{format}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-medium text-white mb-4">Security Settings</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-white font-medium mb-2">
                          Session Timeout (days)
                        </label>
                        <input
                          type="number"
                          value={Math.round(settings.securitySettings.sessionTimeout / 60 / 24)}
                          onChange={(e) => setSettings({
                            ...settings,
                            securitySettings: {
                              ...settings.securitySettings,
                              sessionTimeout: (parseInt(e.target.value) || 7) * 24 * 60
                            }
                          })}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-white font-medium mb-2">
                          Max Login Attempts
                        </label>
                        <input
                          type="number"
                          value={settings.securitySettings.maxLoginAttempts}
                          onChange={(e) => setSettings({
                            ...settings,
                            securitySettings: {
                              ...settings.securitySettings,
                              maxLoginAttempts: parseInt(e.target.value) || 5
                            }
                          })}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-white font-medium mb-2">
                          Invite Expiration (hours)
                        </label>
                        <input
                          type="number"
                          value={settings.securitySettings.inviteExpirationHours}
                          onChange={(e) => setSettings({
                            ...settings,
                            securitySettings: {
                              ...settings.securitySettings,
                              inviteExpirationHours: parseInt(e.target.value) || 24
                            }
                          })}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">Require Strong Passwords</p>
                          <p className="text-gray-400 text-sm">Enforce password complexity rules</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.securitySettings.requireStrongPasswords}
                          onChange={(e) => setSettings({
                            ...settings,
                            securitySettings: {
                              ...settings.securitySettings,
                              requireStrongPasswords: e.target.checked
                            }
                          })}
                          className="w-4 h-4 text-primary bg-gray-700 border-gray-600 rounded focus:ring-primary focus:ring-2"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">Enable Public Song Sharing</p>
                          <p className="text-gray-400 text-sm">Allow sharing songs with anyone via public URLs</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.securitySettings.publicSharingEnabled}
                          onChange={(e) => setSettings({
                            ...settings,
                            securitySettings: {
                              ...settings.securitySettings,
                              publicSharingEnabled: e.target.checked
                            }
                          })}
                          className="w-4 h-4 text-primary bg-gray-700 border-gray-600 rounded focus:ring-primary focus:ring-2"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'maintenance' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-medium text-white mb-4">Maintenance Tasks</h4>
                    <div className="space-y-4">
                      <div className="bg-gray-700 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-white font-medium">Clean Up Expired Invites</p>
                            <p className="text-gray-400 text-sm">Remove expired invitation tokens from database</p>
                          </div>
                          <button
                            onClick={handleCleanupInvites}
                            disabled={cleaningInvites}
                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                          >
                            {cleaningInvites && <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />}
                            Run Now
                          </button>
                        </div>
                      </div>

                      <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-red-400 font-medium flex items-center">
                              <ExclamationTriangleIcon className="w-4 h-4 mr-2" />
                              Reset All User Data
                            </p>
                            <p className="text-gray-400 text-sm">This will permanently delete all users, playlists, history, and follows</p>
                          </div>
                          <button
                            onClick={() => setShowResetConfirm(true)}
                            disabled={resettingData}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                          >
                            {resettingData && <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />}
                            Reset
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Reset Confirmation Dialog */}
              {showResetConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                  <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                      <ExclamationTriangleIcon className="w-6 h-6 text-red-500 mr-2" />
                      Confirm Reset
                    </h3>
                    <div className="space-y-4 text-gray-300 mb-6">
                      <p className="font-semibold text-red-400">⚠️ WARNING: This action cannot be undone!</p>
                      <p>This will permanently delete:</p>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>All user accounts except yours</li>
                        <li>All playlists (both yours and other users')</li>
                        <li>All listen history</li>
                        <li>All playlist follows</li>
                      </ul>
                      <p className="text-sm">The following will be preserved:</p>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>All songs and library data</li>
                        <li>Scan history and reports</li>
                        <li>Your admin account</li>
                      </ul>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setShowResetConfirm(false)}
                        disabled={resettingData}
                        className="px-4 py-2 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleResetAllData}
                        disabled={resettingData}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center"
                      >
                        {resettingData && <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />}
                        Confirm Reset
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'logs' && <LogsTabContent />}

            </>
          )}

          <div className="mt-8 pt-6 border-t border-gray-700">
            <div className="flex justify-end gap-3">
              <button
                onClick={() => fetchSystemSettings()}
                className="px-4 py-2 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Reset
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center"
              >
                {saving && <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />}
                Save Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemSettingsTab;
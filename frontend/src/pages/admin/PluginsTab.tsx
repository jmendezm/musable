import React, { useEffect, useState } from 'react';
import {
  PuzzlePieceIcon,
  CheckCircleIcon,
  XCircleIcon,
  CogIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { apiService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { frontendPluginLoader } from '../../services/frontendPluginLoader';
import { getApiBaseUrl } from '../../config/config';
import clsx from 'clsx';

interface Plugin {
  id: number;
  plugin_id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  enabled: boolean;
  installed_at?: string;
  updated_at?: string;
  settings?: Record<string, string>;
  settingsSchema?: Record<string, {
    type: 'text' | 'number' | 'boolean' | 'path';
    label: string;
    description: string;
    placeholder?: string;
    default?: string;
    options?: { value: string; label: string }[];
  }>;
}

interface PluginSettingsProps {
  plugin: Plugin;
  onClose: () => void;
  onSave: (pluginId: string, settings: Record<string, string>) => Promise<void>;
}

// Generic Plugin Settings Component with special handling for known plugins
const PluginSettingsModal: React.FC<PluginSettingsProps> = ({ plugin, onClose, onSave }) => {
  const [settings, setSettings] = useState<Record<string, string>>(plugin.settings || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSettings(plugin.settings || {});
  }, [plugin.settings]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await onSave(plugin.plugin_id, settings);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Render input field based on setting schema
  const renderSettingField = (key: string, value: string) => {
    const schema = plugin.settingsSchema?.[key];

    // If we have a schema for this setting, use it
    if (schema) {
      // Boolean type - render as toggle/checkbox
      if (schema.type === 'boolean') {
        return (
          <div key={key} className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              {schema.label}
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSettings({ ...settings, [key]: value === 'true' ? 'false' : 'true' })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  value === 'true' ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    value === 'true' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-gray-400">
                {value === 'true' ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              {schema.description}
            </p>
          </div>
        );
      }

      // Select dropdown with options
      if (schema.options && schema.options.length > 0) {
        return (
          <div key={key} className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              {schema.label}
            </label>
            <select
              value={value}
              onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {schema.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400">
              {schema.description}
            </p>
          </div>
        );
      }

      // Number and text inputs
      const inputType = schema.type === 'number' ? 'number' : 'text';

      return (
        <div key={key} className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            {schema.label}
          </label>
          <input
            type={inputType}
            value={value}
            onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
            placeholder={schema.placeholder}
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400">
            {schema.description}
          </p>
        </div>
      );
    }

    // Generic text input for settings without schema
    const displayName = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();

    return (
      <div key={key} className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">
          {displayName}
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400">
          Setting: {key}
        </p>
      </div>
    );
  };

  const settingKeys = Object.keys(settings);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">{plugin.name} Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <XCircleIcon className="w-6 h-6" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-600 bg-opacity-20 border border-red-600 rounded text-red-200">
            {error}
          </div>
        )}

        {settingKeys.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">This plugin has no configurable settings.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {settingKeys.map(key => renderSettingField(key, settings[key]))}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          {settingKeys.length > 0 && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const PluginsTab: React.FC = () => {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    fetchPlugins();
  }, []);

  const fetchPlugins = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.request('GET', '/plugins') as any;
      setPlugins(response.data.plugins);
    } catch (err: any) {
      console.error('Failed to fetch plugins:', err);
      setError(err.message || 'Failed to load plugins');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePlugin = async (plugin: Plugin) => {
    try {
      setActionLoading(plugin.plugin_id);
      const newEnabledState = !plugin.enabled;
      await apiService.request('PUT', `/plugins/${plugin.id}/toggle`, {
        enabled: newEnabledState
      });

      // Refresh plugins list to get updated state
      await fetchPlugins();

      // Sync frontend plugins with backend state
      await frontendPluginLoader.syncWithBackend(apiService);

      // Show success message
      if (newEnabledState) {
        showSuccess(`${plugin.name} has been enabled successfully`);
      } else {
        showSuccess(`${plugin.name} has been disabled successfully`);
      }
    } catch (err: any) {
      console.error('Failed to toggle plugin:', err);
      setError(err.message || 'Failed to toggle plugin');
      showError(err.message || 'Failed to toggle plugin');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeletePlugin = async (plugin: Plugin) => {
    if (!window.confirm(`Are you sure you want to delete ${plugin.name}? This action cannot be undone.`)) {
      return;
    }

    try {
      setActionLoading(plugin.plugin_id);
      await apiService.request('DELETE', `/plugins/${plugin.id}`);
      await fetchPlugins();
      showSuccess(`${plugin.name} has been deleted successfully`);
    } catch (err: any) {
      console.error('Failed to delete plugin:', err);
      setError(err.message || 'Failed to delete plugin');
      showError(err.message || 'Failed to delete plugin');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveSettings = async (pluginId: string, settings: Record<string, string>) => {
    try {
      await apiService.request('PUT', `/plugins/${pluginId}/settings`, { settings });
      await fetchPlugins();
      showSuccess('Settings saved successfully');
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      showError(err.message || 'Failed to save settings');
    }
  };

  const openSettings = (plugin: Plugin) => {
    setSelectedPlugin(plugin);
    setShowSettings(true);
  };

  const filteredPlugins = plugins.filter(plugin =>
    plugin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    plugin.plugin_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (plugin.description && plugin.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <ArrowPathIcon className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Plugins</h2>
          <p className="text-gray-400 mt-1">Manage your plugins and their settings</p>
        </div>
        <button
          onClick={fetchPlugins}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
        >
          <ArrowPathIcon className="w-5 h-5" />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-600 bg-opacity-20 border border-red-600 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search plugins..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Plugins Grid */}
      {filteredPlugins.length === 0 ? (
        <div className="text-center py-12">
          <PuzzlePieceIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">
            {searchQuery ? 'No plugins match your search' : 'No plugins installed'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlugins.map((plugin) => (
            <div
              key={plugin.id}
              className={clsx(
                'bg-gray-800 rounded-lg p-5 border-2 transition-all',
                plugin.enabled ? 'border-green-600' : 'border-gray-700'
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center',
                    plugin.enabled ? 'bg-green-600 bg-opacity-20' : 'bg-gray-700'
                  )}>
                    <img
                      src={`${getApiBaseUrl().replace('/api', '')}/plugins/assets/${plugin.plugin_id}/assets/icon.png`}
                      alt={`${plugin.name} icon`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const fallback = target.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'block';
                      }}
                    />
                    <PuzzlePieceIcon className={clsx(
                      'w-6 h-6 hidden',
                      plugin.enabled ? 'text-green-500' : 'text-gray-400'
                    )} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{plugin.name}</h3>
                    <p className="text-sm text-gray-400">v{plugin.version}</p>
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="mb-3">
                <span className={clsx(
                  'inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium',
                  plugin.enabled
                    ? 'bg-green-600 bg-opacity-20 text-green-400'
                    : 'bg-gray-700 text-gray-400'
                )}>
                  {plugin.enabled ? (
                    <>
                      <CheckCircleIcon className="w-3 h-3" />
                      Enabled
                    </>
                  ) : (
                    <>
                      <XCircleIcon className="w-3 h-3" />
                      Disabled
                    </>
                  )}
                </span>
              </div>

              {/* Description */}
              {plugin.description && (
                <p className="text-sm text-gray-300 mb-3 line-clamp-2">
                  {plugin.description}
                </p>
              )}

              {/* Author */}
              {plugin.author && (
                <p className="text-xs text-gray-400 mb-4">
                  by {plugin.author}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTogglePlugin(plugin)}
                  disabled={actionLoading === plugin.plugin_id}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    plugin.enabled
                      ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white',
                    'disabled:opacity-50'
                  )}
                >
                  {actionLoading === plugin.plugin_id ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      {plugin.enabled ? 'Disable' : 'Enable'}
                    </>
                  )}
                </button>

                <button
                  onClick={() => openSettings(plugin)}
                  className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                  title="Settings"
                >
                  <CogIcon className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleDeletePlugin(plugin)}
                  disabled={actionLoading === plugin.plugin_id}
                  className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
                  title="Delete"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && selectedPlugin && (
        <PluginSettingsModal
          plugin={selectedPlugin}
          onClose={() => {
            setShowSettings(false);
            setSelectedPlugin(null);
          }}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
};

export default PluginsTab;

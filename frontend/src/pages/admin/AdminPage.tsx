import React, { useState, useEffect } from 'react';
import {
  Cog6ToothIcon,
  UsersIcon,
  MusicalNoteIcon,
  ClockIcon,
  ChartBarIcon,
  DocumentTextIcon,
  PuzzlePieceIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { apiService } from '../../services/api';

// Import admin sub-components
import DashboardTab from './DashboardTab';
import UserManagementTab from './UserManagementTab';
import LibraryManagementTab from './LibraryManagementTab';
import HistoryTab from './HistoryTab';
import AnalyticsTab from './AnalyticsTab';
import SystemSettingsTab from './SystemSettingsTab';
import PluginsTab from './PluginsTab';
import UpdatesTab from './UpdatesTab';

type AdminTab = 'dashboard' | 'users' | 'library' | 'history' | 'analytics' | 'settings' | 'plugins' | 'updates';

interface TabConfig {
  id: AdminTab;
  label: string;
  icon: React.ComponentType<any>;
  component: React.ComponentType;
}

const tabs: TabConfig[] = [
  { id: 'dashboard', label: 'Dashboard', icon: ChartBarIcon, component: DashboardTab },
  { id: 'users', label: 'User Management', icon: UsersIcon, component: UserManagementTab },
  { id: 'library', label: 'Library Management', icon: MusicalNoteIcon, component: LibraryManagementTab },
  { id: 'history', label: 'Listen History', icon: ClockIcon, component: HistoryTab },
  { id: 'analytics', label: 'Analytics', icon: DocumentTextIcon, component: AnalyticsTab },
  { id: 'plugins', label: 'Plugins', icon: PuzzlePieceIcon, component: PluginsTab },
  { id: 'updates', label: 'Updates', icon: ArrowDownTrayIcon, component: UpdatesTab },
  { id: 'settings', label: 'System Settings', icon: Cog6ToothIcon, component: SystemSettingsTab },
];

const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Check for updates on mount
  useEffect(() => {
    const checkUpdates = async () => {
      try {
        const response = await apiService.request('GET', '/updates/check') as any;
        setUpdateAvailable(response.data.updateAvailable);
      } catch (error) {
        console.error('Failed to check for updates:', error);
      }
    };

    checkUpdates();
  }, []);

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || DashboardTab;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-white mb-2">Admin Panel</h1>
        <p className="text-gray-400">Manage users, library, and system settings</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-700 pt-2">
        <nav className="flex space-x-8 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const showBadge = tab.id === 'updates' && updateAvailable;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex items-center space-x-2 py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors relative',
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{tab.label}</span>
                {showBadge && (
                  <span className="ml-2 inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-96">
        <ActiveComponent />
      </div>
    </div>
  );
};

export default AdminPage;
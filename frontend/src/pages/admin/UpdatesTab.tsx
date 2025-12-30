import React, { useEffect, useState } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
  ClockIcon,
  TagIcon
} from '@heroicons/react/24/outline';
import { apiService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  changelog: string;
  releaseUrl: string;
  gitLabUrl: string;
  publishedAt: string;
}

interface Release {
  name: string;
  tag_name: string;
  released_at: string;
  description: string;
  description_html: string;
  author: {
    name: string;
  };
}

const UpdatesTab: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showSuccess, showError } = useToast();

  const fetchUpdateInfo = async () => {
    try {
      const response = await apiService.request('GET', '/updates/check') as any;
      setUpdateInfo(response.data);
    } catch (err: any) {
      console.error('Failed to fetch update info:', err);
      // Don't show error for initial load, just log it
    }
  };

  const fetchReleases = async () => {
    try {
      const response = await apiService.request('GET', '/updates/releases?limit=10') as any;
      setReleases(response.data.releases);
    } catch (err: any) {
      console.error('Failed to fetch releases:', err);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([fetchUpdateInfo(), fetchReleases()]);
    } catch (err: any) {
      setError(err.message || 'Failed to load update information');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await Promise.all([fetchUpdateInfo(), fetchReleases()]);
      showSuccess('Update information refreshed');
    } catch (err: any) {
      showError(err.message || 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const stripHtml = (html: string) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

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
          <h2 className="text-2xl font-bold text-white">Updates</h2>
          <p className="text-gray-400 mt-1">Check for updates and view changelogs</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg disabled:opacity-50"
        >
          <ArrowPathIcon className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-600 bg-opacity-20 border border-red-600 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {/* Current Version Card */}
      {updateInfo && (
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <TagIcon className="w-6 h-6 text-blue-400" />
                <h3 className="text-xl font-semibold text-white">Version Information</h3>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Current Version:</span>
                  <span className="text-white font-mono font-medium bg-gray-700 px-3 py-1 rounded">
                    v{updateInfo.currentVersion}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Latest Version:</span>
                  <span className={`font-mono font-medium px-3 py-1 rounded ${
                    updateInfo.updateAvailable
                      ? 'bg-green-600 bg-opacity-20 text-green-400'
                      : 'bg-gray-700 text-white'
                  }`}>
                    v{updateInfo.latestVersion}
                  </span>
                </div>
              </div>
            </div>

            {/* Status Icon */}
            <div className="ml-6">
              {updateInfo.updateAvailable ? (
                <div className="flex flex-col items-center text-center">
                  <ExclamationTriangleIcon className="w-12 h-12 text-yellow-500 mb-2" />
                  <span className="text-sm font-medium text-yellow-500">Update Available</span>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center">
                  <CheckCircleIcon className="w-12 h-12 text-green-500 mb-2" />
                  <span className="text-sm font-medium text-green-500">Up to Date</span>
                </div>
              )}
            </div>
          </div>

          {/* Update Available Actions */}
          {updateInfo.updateAvailable && (
            <div className="mt-6 pt-6 border-t border-gray-700">
              <a
                href={updateInfo.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                <ArrowDownTrayIcon className="w-5 h-5" />
                View Release on GitLab
              </a>
            </div>
          )}
        </div>
      )}

      {/* Changelog Section */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <ClockIcon className="w-6 h-6 text-purple-400" />
          <h3 className="text-xl font-semibold text-white">Recent Releases</h3>
        </div>

        {releases.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">No releases found</p>
          </div>
        ) : (
          <div className="space-y-6">
            {releases.map((release, index) => (
              <div
                key={release.tag_name}
                className={`pb-6 ${index < releases.length - 1 ? 'border-b border-gray-700' : ''}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="text-lg font-semibold text-white">{release.name}</h4>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                      <span className="font-mono bg-gray-700 px-2 py-0.5 rounded">
                        {release.tag_name}
                      </span>
                      <span>{formatDate(release.released_at)}</span>
                    </div>
                  </div>
                  <a
                    href={`${updateInfo?.gitLabUrl || 'https://git.breadjs.nl'}/musable/musable/-/releases/${release.tag_name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                  >
                    View on GitLab
                  </a>
                </div>

                {/* Changelog Content */}
                {(release.description_html || release.description) && (
                  <div className="mt-4">
                    <h5 className="text-sm font-semibold text-gray-300 mb-2">Release Notes:</h5>
                    <div
                      className="prose prose-invert prose-sm max-w-none text-gray-300 changelog-content bg-gray-900 bg-opacity-50 p-4 rounded-lg"
                      dangerouslySetInnerHTML={{ __html: release.description_html || release.description }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .changelog-content h1 { font-size: 1.25em; font-weight: bold; margin-top: 1em; margin-bottom: 0.5em; color: #fff; }
        .changelog-content h2 { font-size: 1.1em; font-weight: bold; margin-top: 0.75em; margin-bottom: 0.5em; color: #fff; }
        .changelog-content h3 { font-size: 1em; font-weight: bold; margin-top: 0.5em; margin-bottom: 0.5em; color: #e5e7eb; }
        .changelog-content h4 { font-size: 0.95em; font-weight: bold; margin-top: 0.5em; margin-bottom: 0.5em; color: #d1d5db; }
        .changelog-content p { margin-bottom: 0.75em; line-height: 1.6; }
        .changelog-content ul { list-style-type: disc; margin-left: 1.5em; margin-bottom: 0.75em; }
        .changelog-content ol { list-style-type: decimal; margin-left: 1.5em; margin-bottom: 0.75em; }
        .changelog-content li { margin-bottom: 0.25em; }
        .changelog-content li::marker { color: #9ca3af; }
        .changelog-content code { background: #374151; padding: 0.125em 0.375em; border-radius: 0.25em; font-size: 0.875em; font-family: 'Courier New', monospace; }
        .changelog-content pre { background: #1f2937; padding: 1em; border-radius: 0.5em; overflow-x: auto; margin: 1em 0; }
        .changelog-content pre code { background: transparent; padding: 0; }
        .changelog-content a { color: #60a5fa; text-decoration: underline; }
        .changelog-content a:hover { color: #93c5fd; }
        .changelog-content strong { color: #f3f4f6; font-weight: 600; }
        .changelog-content em { color: #d1d5db; font-style: italic; }
        .changelog-content blockquote { border-left: 4px solid #4b5563; padding-left: 1em; margin: 1em 0; color: #9ca3af; font-style: italic; }
        .changelog-content hr { border-color: #374151; margin: 1.5em 0; }
        .changelog-content img { max-width: 100%; height: auto; border-radius: 0.5em; margin: 1em 0; }
        .changelog-content table { width: 100%; border-collapse: collapse; margin: 1em 0; }
        .changelog-content th, .changelog-content td { border: 1px solid #4b5563; padding: 0.5em; text-align: left; }
        .changelog-content th { background: #374151; font-weight: bold; }
      `}</style>
    </div>
  );
};

export default UpdatesTab;

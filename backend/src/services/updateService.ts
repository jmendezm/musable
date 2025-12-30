import axios from 'axios';
import fs from 'fs';
import path from 'path';

interface GitLabRelease {
  name: string;
  tag_name: string;
  released_at: string;
  description: string;
  description_html: string;
  author: {
    name: string;
  };
  upstream: {
    link?: string;
  };
}

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  changelog: string;
  releaseUrl: string;
  gitLabUrl: string;
  publishedAt: string;
}

class UpdateService {
  private gitLabUrl: string;
  private projectId: string;
  private currentVersion: string;

  constructor() {
    // GitLab instance URL
    this.gitLabUrl = 'https://git.breadjs.nl';
    // Project path in URL-encoded format
    this.projectId = encodeURIComponent('musable/musable');
    this.currentVersion = this.getCurrentVersion();
  }

  private getCurrentVersion(): string {
    try {
      const packagePath = path.join(process.cwd(), '..', 'package.json');
      if (fs.existsSync(packagePath)) {
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        return packageJson.version || '0.0.0';
      }
    } catch (error) {
      console.error('Error reading package.json:', error);
    }
    return '0.0.0';
  }

  private compareVersions(current: string, latest: string): number {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const currentPart = currentParts[i] || 0;
      const latestPart = latestParts[i] || 0;

      if (currentPart < latestPart) return -1;  // current is older
      if (currentPart > latestPart) return 1;   // current is newer
    }

    return 0;  // versions are equal
  }

  async checkForUpdates(): Promise<UpdateInfo | null> {
    try {
      // Fetch latest release from GitLab
      const releasesUrl = `${this.gitLabUrl}/api/v4/projects/${this.projectId}/releases/permalink/latest`;
      const response = await axios.get<GitLabRelease>(releasesUrl, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json'
        }
      });

      const release = response.data;
      const latestVersion = release.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present

      const updateAvailable = this.compareVersions(this.currentVersion, latestVersion) < 0;

      return {
        currentVersion: this.currentVersion,
        latestVersion,
        updateAvailable,
        changelog: release.description_html || release.description,
        releaseUrl: `${this.gitLabUrl}/musable/musable/-/releases/${release.tag_name}`,
        gitLabUrl: this.gitLabUrl,
        publishedAt: release.released_at
      };
    } catch (error) {
      console.error('Error checking for updates:', error);
      return null;
    }
  }

  async getAllReleases(limit: number = 10): Promise<GitLabRelease[]> {
    try {
      const releasesUrl = `${this.gitLabUrl}/api/v4/projects/${this.projectId}/releases?per_page=${limit}`;
      const response = await axios.get<GitLabRelease[]>(releasesUrl, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching releases:', error);
      return [];
    }
  }
}

export default new UpdateService();

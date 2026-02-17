import { Worker } from 'worker_threads';
import * as path from 'path';
import logger from '../utils/logger';
import config from '../config/config';

interface ScanProgress {
  id: number;
  status: 'running' | 'completed' | 'failed';
  filesScanned: number;
  filesAdded: number;
  filesUpdated: number;
  filesSkipped: number;
  errorsCount: number;
  startedAt: string;
  completedAt?: string;
  currentFile?: string;
  errorMessage?: string;
  totalFiles?: number;
  progress?: number;
}

class ScannerWorkerService {
  private worker: Worker | null = null;
  private currentScan: ScanProgress | null = null;
  private scanCallbacks: Map<number, (progress: ScanProgress) => void> = new Map();
  private isWorkerReady: boolean = false;

  constructor() {
    // Worker will initialize when first scan is triggered
    logger.info('[ScannerWorkerService] Worker ready (will initialize on first scan)');
  }

  private initializeWorker(): void {
    try {
      // Worker threads can only execute JavaScript files, not TypeScript
      // We need to use the compiled version from dist/
      // In dev (ts-node): __dirname = backend/src/services, need to go to ../../dist/workers/scannerWorker.js
      // In prod: __dirname = backend/dist/services, need to go to ../workers/scannerWorker.js

      let workerPath: string;
      if (__dirname.includes('src')) {
        // Development mode: running from src/ with ts-node
        workerPath = path.join(__dirname, '../../dist/workers/scannerWorker.js');
      } else {
        // Production mode: running from compiled dist/
        workerPath = path.join(__dirname, '../workers/scannerWorker.js');
      }

      // Check if worker file exists
      const fs = require('fs');
      if (!fs.existsSync(workerPath)) {
        logger.error(`Worker file not found at: ${workerPath}`);
        this.isWorkerReady = false;
        return;
      }

      logger.info(`Initializing scanner worker from: ${workerPath}`);
      this.isWorkerReady = false;

      const worker = new Worker(workerPath, {
        workerData: {
          databasePath: config.databasePath,
          dataDir: config.dataDir,
          uploadsDir: config.uploadsDir,
        },
        resourceLimits: {
          maxOldGenerationSizeMb: 512,
        }
      });

      // Store the worker reference immediately
      this.worker = worker;

      worker.on('message', (message: any) => {
        this.handleWorkerMessage(message);
      });

      worker.on('error', (error: any) => {
        logger.error('Scanner worker error:', error);
        // Only set isWorkerReady to false if this is still the current worker
        if (this.worker === worker) {
          this.isWorkerReady = false;
        }
      });

      worker.on('exit', (code: number) => {
        logger.info(`Scanner worker exited with code ${code}`);
        // Only clear state if this is still the current worker (prevents race conditions)
        if (this.worker === worker) {
          this.worker = null;
          this.isWorkerReady = false;
        }
      });

      logger.info('Scanner worker initialization started');
    } catch (error: any) {
      logger.error('Failed to initialize scanner worker:', error);
      logger.error('Error stack:', error.stack);
      this.isWorkerReady = false;
    }
  }

  private handleWorkerMessage(message: any): void {
    const { type, data } = message;

    switch (type) {
      case 'scanProgress':
        // Check if worker is ready
        if (data.status === 'ready') {
          this.isWorkerReady = true;
          logger.info('Scanner worker is ready');
          return;
        }

        // Update current scan progress
        if (this.currentScan && data.scanId === this.currentScan.id) {
          this.currentScan = { ...this.currentScan, ...data };
          this.notifyProgress();
        }
        break;

      case 'scanComplete':
        if (this.currentScan && data.scanId === this.currentScan.id) {
          this.currentScan.status = 'completed';
          this.currentScan.completedAt = new Date().toISOString();
          this.currentScan.progress = 100;
          this.notifyProgress();
        }
        break;

      case 'scanError':
        if (this.currentScan && data.scanId === this.currentScan.id) {
          this.currentScan.status = 'failed';
          this.currentScan.errorMessage = data.error;
          this.currentScan.completedAt = new Date().toISOString();
          this.notifyProgress();
        }
        break;

      case 'fileAdded':
        // File was added by watcher
        logger.info('File added by watcher:', data);
        break;

      case 'fileRemoved':
        // File was removed by watcher
        logger.info('File removed by watcher:', data);
        break;

      default:
        logger.debug('Unknown worker message type:', type);
    }
  }

  private notifyProgress(): void {
    if (this.currentScan) {
      const callback = this.scanCallbacks.get(this.currentScan.id);
      if (callback) {
        callback(this.currentScan);
      }
    }
  }

  async startScan(paths?: string[]): Promise<number> {
    // Initialize worker on first scan if not already initialized
    if (!this.worker) {
      logger.info('[ScannerWorkerService] Initializing worker on first scan...');
      this.initializeWorker();

      // Wait for worker to be ready
      const waited = await this.waitForWorkerReady(10000);
      if (!waited) {
        throw new Error('Worker failed to initialize within timeout period');
      }
      logger.info('[ScannerWorkerService] Worker initialized successfully');
    }

    if (!this.worker) {
      throw new Error('Scanner worker not available');
    }

    // Import Database and SettingsModel here to avoid circular dependency
    const Database = (await import('../config/database')).default;
    const SettingsModel = (await import('../models/Settings')).default;
    const LibraryPathScanReportModel = (await import('../models/LibraryPathScanReport')).default;

    // If no paths provided, get active library paths from database
    let scanPaths = paths;
    let libraryPaths: any[] = [];

    if (!scanPaths) {
      // Get full library path objects including IDs
      libraryPaths = await Database.query(
        'SELECT * FROM library_paths WHERE is_active = 1'
      );
      scanPaths = libraryPaths.map((lp: any) => lp.path);
    } else {
      // If paths provided, fetch their IDs
      const placeholders = scanPaths.map(() => '?').join(',');
      libraryPaths = await Database.query(
        `SELECT * FROM library_paths WHERE path IN (${placeholders})`,
        scanPaths
      );
    }

    if (!scanPaths || scanPaths.length === 0) {
      throw new Error('No library paths configured. Please add at least one library path in System Settings before scanning.');
    }

    const result = await Database.run(
      `INSERT INTO scan_history (started_at, scan_path, status)
       VALUES (CURRENT_TIMESTAMP, ?, 'running')`,
      [JSON.stringify(scanPaths)]
    );

    const scanId = result.lastID!;

    // Create a report for each library path
    const pathReports: any[] = [];
    for (const libPath of libraryPaths) {
      const report = await LibraryPathScanReportModel.create({
        library_path_id: libPath.id,
        scan_id: scanId,
        status: 'running',
        started_at: new Date().toISOString()
      });
      pathReports.push({
        pathId: libPath.id,
        path: libPath.path,
        reportId: report.id
      });
      logger.info(`Created scan report ${report.id} for library path ${libPath.path}`);
    }

    this.currentScan = {
      id: scanId,
      status: 'running',
      filesScanned: 0,
      filesAdded: 0,
      filesUpdated: 0,
      filesSkipped: 0,
      errorsCount: 0,
      startedAt: new Date().toISOString(),
      totalFiles: 0,
      progress: 0
    };

    // Send scan request to worker with path information
    logger.info(`Sending scan request to worker: scanId=${scanId}, paths=${scanPaths.length} paths`);
    this.worker.postMessage({
      type: 'scan',
      scanId,
      paths: scanPaths,
      pathReports
    });

    logger.info(`Started scan ${scanId} in worker thread with ${pathReports.length} path reports`);
    return scanId;
  }

  stopScan(): void {
    if (!this.worker) {
      logger.warn('Cannot stop scan: worker not available');
      return;
    }

    if (this.currentScan && this.currentScan.status === 'running') {
      logger.info('Stopping scan via worker...');
      this.worker.postMessage({ type: 'stop' });
    }
  }

  isCurrentlyScanning(): boolean {
    return this.currentScan?.status === 'running' || false;
  }

  getCurrentScan(): ScanProgress | null {
    return this.currentScan;
  }

  onProgress(scanId: number, callback: (progress: ScanProgress) => void): void {
    this.scanCallbacks.set(scanId, callback);
  }

  removeProgressCallback(scanId: number): void {
    this.scanCallbacks.delete(scanId);
  }

  async getScanHistory(): Promise<any[]> {
    // Import Database here
    const Database = (await import('../config/database')).default;
    return await Database.query(
      'SELECT * FROM scan_history ORDER BY started_at DESC LIMIT 50'
    );
  }

  async getLibraryStats(): Promise<any> {
    // Import models
    const SongModel = (await import('../models/Song')).default;
    const ArtistModel = (await import('../models/Artist')).default;
    const AlbumModel = (await import('../models/Album')).default;

    const songCount = await SongModel.getSongCount();
    const artistCount = await ArtistModel.getArtistCount();
    const albumCount = await AlbumModel.getAlbumCount();
    const totalDuration = await SongModel.getTotalDuration();

    return {
      songs: songCount,
      artists: artistCount,
      albums: albumCount,
      totalDuration,
      formatHours: Math.round(totalDuration / 3600 * 100) / 100
    };
  }

  async refreshFileWatcher(): Promise<void> {
    try {
      // If worker doesn't exist, try to initialize it
      if (!this.worker) {
        logger.warn('Worker not available, attempting to initialize...');
        this.initializeWorker();

        // Wait for worker to become ready
        const maxWait = 5000; // 5 seconds
        const waited = await this.waitForWorkerReady(maxWait);

        if (!waited) {
          throw new Error('Failed to initialize scanner worker (timeout)');
        }
      }

      // Restart the worker to refresh file watcher
      this.worker.terminate();
      this.worker = null;
      this.isWorkerReady = false;

      // Give it a moment to terminate
      await new Promise(resolve => setTimeout(resolve, 100));

      this.initializeWorker();

      // Wait for worker to become ready again
      const waited = await this.waitForWorkerReady(5000);
      if (!waited) {
        throw new Error('Worker did not become ready after refresh');
      }

      logger.info('File watcher refreshed successfully');
    } catch (error: any) {
      logger.error('Failed to refresh file watcher:', error);
      throw new Error(`Failed to refresh file watcher: ${error.message}`);
    }
  }

  private async waitForWorkerReady(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.isWorkerReady && this.worker) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  }

  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

// Lazy singleton - only initialize when first used
let instance: ScannerWorkerService | null = null;

function getInstance(): ScannerWorkerService {
  if (!instance) {
    instance = new ScannerWorkerService();
  }
  return instance;
}

// Export the getter function as default
export default getInstance;

// Also export the class for type checking
export { ScannerWorkerService };

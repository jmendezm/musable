import fs from 'fs';
import path from 'path';
import { parseFile } from 'music-metadata';
import sharp from 'sharp';
import chokidar from 'chokidar';
import { promisify } from 'util';

import config from '../config/config';
import logger from '../utils/logger';
import SongModel, { CreateSongData } from '../models/Song';
import ArtistModel from '../models/Artist';
import AlbumModel from '../models/Album';
import SettingsModel from '../models/Settings';
import LibraryPathScanReportModel from '../models/LibraryPathScanReport';
import Database from '../config/database';

export interface ScanProgress {
  id: number;
  status: 'running' | 'completed' | 'failed';
  filesScanned: number;
  filesAdded: number;
  filesUpdated: number;
  errorsCount: number;
  startedAt: string;
  completedAt?: string;
  currentFile?: string;
  errorMessage?: string;
  totalFiles?: number;
  progress?: number;
}

export interface ScanResult {
  filesScanned: number;
  filesAdded: number;
  filesUpdated: number;
  errors: string[];
}

export class LibraryScanner {
  private db = Database;
  private isScanning = false;
  private shouldStop = false;  // Flag to stop scanning
  private currentScan: ScanProgress | null = null;
  private watcher: chokidar.FSWatcher | null = null;
  private readonly CONCURRENCY = 3;  // Number of files to scan in parallel

  constructor() {
    this.setupFileWatcher();
  }

  private async setupFileWatcher(): Promise<void> {
    try {
      const paths = await SettingsModel.getActivePaths();
      if (paths.length === 0) {
        logger.info('No active library paths configured for file watching');
        return;
      }

      this.watcher = chokidar.watch(paths, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true,
        usePolling: false, // Use native file system events (more efficient)
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100
        },
        depth: 99, // Still watch subdirectories but don't go too deep
        // Reduce file descriptor usage
        alwaysStat: false,
        atomic: false
      });

      this.watcher
        .on('add', (filePath) => {
          if (this.isSupportedAudioFile(filePath)) {
            logger.info(`New audio file detected: ${filePath}`);
            this.scanFile(filePath).catch(error => {
              logger.error(`Error scanning new file ${filePath}:`, error);
            });
          }
        })
        .on('unlink', (filePath) => {
          this.removeDeletedFile(filePath).catch(error => {
            logger.error(`Error removing deleted file ${filePath}:`, error);
          });
        })
        .on('error', error => {
          logger.error('File watcher error:', error);
        });

      logger.info('File watcher initialized for paths:', paths);
    } catch (error) {
      logger.error('Failed to setup file watcher:', error);
    }
  }

  async startScan(scanPaths?: string[]): Promise<number> {
    if (this.isScanning) {
      throw new Error('Scan already in progress');
    }

    let paths: string[];
    if (scanPaths) {
      paths = scanPaths;
    } else {
      // Get active library paths from database
      paths = await SettingsModel.getActivePaths();
    }

    if (paths.length === 0) {
      const error = new Error('No library paths configured. Please add at least one library path in the system settings.');
      (error as any).statusCode = 400;
      throw error;
    }

    // Clean up empty albums and artists BEFORE scanning
    logger.info('🧹 Pre-scan cleanup: removing empty albums and artists...');
    const cleanupResult = await this.cleanupAllEmptyEntries();
    logger.info(`✅ Pre-scan cleanup complete: ${cleanupResult.albumsDeleted} albums deleted, ${cleanupResult.artistsDeleted} artists deleted`);

    this.isScanning = true;
    this.shouldStop = false;

    const result = await this.db.run(
      `INSERT INTO scan_history (started_at, scan_path, status)
       VALUES (CURRENT_TIMESTAMP, ?, 'running')`,
      [JSON.stringify(paths)]
    );

    const scanId = result.lastID!;

    this.currentScan = {
      id: scanId,
      status: 'running',
      filesScanned: 0,
      filesAdded: 0,
      filesUpdated: 0,
      errorsCount: 0,
      startedAt: new Date().toISOString(),
      totalFiles: 0,
      progress: 0
    };

    this.performScan(scanId, paths).catch(error => {
      logger.error('Scan failed:', error);
      this.updateScanStatus(scanId, 'failed', error.message);
    }).finally(() => {
      this.isScanning = false;
      this.shouldStop = false;
      this.currentScan = null;
    });

    return scanId;
  }

  stopScan(): void {
    if (this.isScanning) {
      logger.info('Stopping library scan...');
      this.shouldStop = true;
    }
  }

  isCurrentlyScanning(): boolean {
    return this.isScanning;
  }

  private async performScan(scanId: number, paths: string[]): Promise<void> {
    let totalFilesScanned = 0;
    let totalFilesAdded = 0;
    let totalFilesUpdated = 0;
    let totalErrors = 0;
    let grandTotalFiles = 0;

    try {
      logger.info('🔍 Starting library scan...');
      logger.info(`📂 Scanning paths: ${paths.join(', ')}`);

      // Scan each path individually
      for (const scanPath of paths) {
        if (this.shouldStop) {
          logger.info('⛔ Scan stopped by user');
          await this.updateScanStatus(scanId, 'completed');
          return;
        }

        await this.scanSinglePath(scanPath, scanId);
      }

      // Aggregate results from all path scans
      const pathScanReports = await LibraryPathScanReportModel.db.query(
        'SELECT * FROM library_path_scan_reports WHERE scan_id = ?',
        [scanId]
      );

      for (const report of pathScanReports) {
        totalFilesScanned += report.files_scanned;
        totalFilesAdded += report.files_added;
        totalFilesUpdated += report.files_updated;
        totalErrors += report.errors_count;
        grandTotalFiles += report.total_files;
      }

      // Final update with all results
      await this.updateScanResults(scanId, totalFilesScanned, totalFilesAdded, totalFilesUpdated, totalErrors);
      await this.updateScanStatus(scanId, 'completed');

      if (this.currentScan) {
        this.currentScan.progress = 100;
        this.currentScan.status = 'completed';
        this.currentScan.completedAt = new Date().toISOString();
      }

      logger.info(`✅ Scan completed: ${totalFilesScanned} scanned, ${totalFilesAdded} added, ${totalFilesUpdated} updated, ${totalErrors} errors`);

    } catch (error: any) {
      logger.error(`❌ Scan failed: ${error.message}`);
      await this.updateScanStatus(scanId, 'failed', error.message);
      if (this.currentScan) {
        this.currentScan.status = 'failed';
        this.currentScan.errorMessage = error.message;
      }
      throw error;
    }
  }

  private async scanSinglePath(scanPath: string, masterScanId: number): Promise<void> {
    const libraryPath = await SettingsModel.findByPath(scanPath);
    if (!libraryPath) {
      logger.warn(`⚠️  Library path not found in database: ${scanPath}`);
      return;
    }

    if (!fs.existsSync(scanPath)) {
      logger.warn(`⚠️  Scan path does not exist: ${scanPath}`);

      // Create a failed scan report
      const report = await LibraryPathScanReportModel.create({
        library_path_id: libraryPath.id!,
        scan_id: masterScanId,
        status: 'failed',
        started_at: new Date().toISOString()
      });

      await LibraryPathScanReportModel.markAsFailed(
        report.id,
        new Date().toISOString(),
        `Path does not exist: ${scanPath}`
      );

      return;
    }

    // Create scan report for this path
    const report = await LibraryPathScanReportModel.create({
      library_path_id: libraryPath.id!,
      scan_id: masterScanId,
      status: 'running',
      started_at: new Date().toISOString()
    });

    logger.info(`🔍 Scanning path: ${scanPath}`);

    let filesScanned = 0;
    let filesAdded = 0;
    let filesUpdated = 0;
    let filesSkipped = 0;
    let errorsCount = 0;

    try {
      // Count files first
      logger.info(`📊 Counting files in ${scanPath}...`);
      const audioFiles = await this.findAudioFiles(scanPath);
      const totalFiles = audioFiles.length;

      await LibraryPathScanReportModel.update(report.id, { total_files: totalFiles });
      logger.info(`  📁 Found ${totalFiles} files`);

      // Process files in parallel batches
      let processedFiles = 0;
      for (let i = 0; i < audioFiles.length; i += this.CONCURRENCY) {
        if (this.shouldStop) {
          logger.info(`⛔ Scan stopped for path: ${scanPath}`);

          await LibraryPathScanReportModel.updateProgress(
            report.id,
            filesScanned,
            filesAdded,
            filesUpdated,
            filesSkipped,
            errorsCount,
            Math.round((processedFiles / totalFiles) * 100)
          );

          await LibraryPathScanReportModel.markAsStopped(
            report.id,
            new Date().toISOString()
          );

          return;
        }

        const batch = audioFiles.slice(i, i + this.CONCURRENCY);

        // Process batch in parallel
        const results = await Promise.allSettled(
          batch.map(async (filePath) => {
            try {
              // Check if we should stop before processing this file
              if (this.shouldStop) {
                return { scanned: false, added: false, updated: false, skipped: true };
              }

              const existingSong = await SongModel.findByPath(filePath);
              const fileStats = fs.statSync(filePath);

              // Check if we should stop after getting file stats
              if (this.shouldStop) {
                return { scanned: false, added: false, updated: false, skipped: true };
              }

              // Skip if file hasn't changed
              if (existingSong && existingSong.file_size === fileStats.size) {
                return { scanned: true, added: false, updated: false, skipped: true };
              }

              // Scan the file
              await this.scanFile(filePath);

              if (existingSong) {
                logger.debug(`  📝 Updated: ${path.basename(filePath)}`);
                return { scanned: true, added: false, updated: true, skipped: false };
              } else {
                logger.debug(`  ➕ Added: ${path.basename(filePath)}`);
                return { scanned: true, added: true, updated: false, skipped: false };
              }
            } catch (error: any) {
              const errorMsg = `${error.message}`;
              logger.error(`  ❌ Error processing ${path.basename(filePath)}: ${errorMsg}`);

              // Save error to database
              await LibraryPathScanReportModel.addError(
                report.id,
                filePath,
                errorMsg,
                error.constructor.name
              );

              return { scanned: false, added: false, updated: false, skipped: false, error: errorMsg };
            }
          })
        );

        // Process results
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const data = result.value;
            filesScanned += data.scanned ? 1 : 0;
            filesAdded += data.added ? 1 : 0;
            filesUpdated += data.updated ? 1 : 0;
            filesSkipped += data.skipped ? 1 : 0;
            if (data.error) {
              errorsCount += 1;
            }
          }
        }

        processedFiles += batch.length;
        const progress = Math.round((processedFiles / totalFiles) * 100);

        // Update report progress every 50 files
        if (processedFiles % 50 === 0 || processedFiles === totalFiles) {
          logger.info(`📈 ${scanPath}: ${processedFiles}/${totalFiles} (${filesAdded} added, ${filesUpdated} updated, ${errorsCount} errors)`);

          await LibraryPathScanReportModel.updateProgress(
            report.id,
            filesScanned,
            filesAdded,
            filesUpdated,
            filesSkipped,
            errorsCount,
            progress
          );
        }
      }

      // Mark report as completed
      await LibraryPathScanReportModel.markAsCompleted(
        report.id,
        new Date().toISOString()
      );

      logger.info(`✅ Completed scanning ${scanPath}: ${filesScanned} scanned, ${filesAdded} added, ${filesUpdated} updated, ${errorsCount} errors`);

    } catch (error: any) {
      logger.error(`❌ Failed to scan ${scanPath}: ${error.message}`);

      await LibraryPathScanReportModel.markAsFailed(
        report.id,
        new Date().toISOString(),
        error.message
      );
    }
  }

  private async scanFile(filePath: string): Promise<void> {
    try {
      if (!this.isSupportedAudioFile(filePath)) {
        return;
      }

      const metadata = await parseFile(filePath);

      // Check if we should stop after metadata extraction
      if (this.shouldStop) {
        return;
      }

      const fileStats = fs.statSync(filePath);

      const artistName = metadata.common.artist || 'Unknown Artist';
      const albumTitle = metadata.common.album;
      const title = metadata.common.title || path.basename(filePath, path.extname(filePath));

      const artist = await ArtistModel.findOrCreate(artistName);

      let album = null;
      if (albumTitle) {
        // Find or create album by title only (consolidates albums with same name)
        album = await AlbumModel.findOrCreate(
          albumTitle,
          metadata.common.year
        );

        if (metadata.common.picture && metadata.common.picture.length > 0 && !album.artwork_path) {
          const artworkPath = await this.saveAlbumArtwork(album.id, metadata.common.picture[0]);
          if (artworkPath) {
            await AlbumModel.updateArtwork(album.id, artworkPath);
          }
        }
      }

      const normalizedFilePath = filePath.replace(/\\/g, '/'); // Normalize path separators to forward slashes

      const songData: CreateSongData = {
        title,
        album_id: album?.id,
        file_path: normalizedFilePath,
        file_size: fileStats.size,
        duration: metadata.format.duration ? Math.round(metadata.format.duration) : undefined,
        track_number: metadata.common.track?.no,
        genre: metadata.common.genre?.join(', '),
        year: metadata.common.year,
        bitrate: metadata.format.bitrate,
        sample_rate: metadata.format.sampleRate,
        source: 'local'
      };

      const existingSong = await SongModel.findByPath(songData.file_path);
      if (existingSong) {
        await SongModel.updateSong(existingSong.id, songData);
        // Update artists for existing song
        await SongModel.setArtists(existingSong.id, [artist.id]);
      } else {
        const newSong = await SongModel.create(songData);
        // Add artist to song (supports multiple artists per song)
        await SongModel.addArtist(newSong.id, artist.id);
      }

    } catch (error: any) {
      logger.error(`Failed to scan file ${filePath}:`, error);
      throw error;
    }
  }

  private async saveAlbumArtwork(albumId: number, picture: any): Promise<string | null> {
    try {
      const artworkDir = path.join(process.cwd(), 'uploads', 'artwork');
      if (!fs.existsSync(artworkDir)) {
        fs.mkdirSync(artworkDir, { recursive: true });
      }

      const filename = `album_${albumId}.jpg`;
      const artworkPath = path.join(artworkDir, filename);

      await sharp(picture.data)
        .jpeg({ quality: 85 })
        .resize(500, 500, { fit: 'cover' })
        .toFile(artworkPath);

      return `/uploads/artwork/${filename}`;
    } catch (error: any) {
      logger.error('Failed to save album artwork:', error);
      return null;
    }
  }

  private async findAudioFiles(dirPath: string): Promise<string[]> {
    const audioFiles: string[] = [];

    const readDir = promisify(fs.readdir);
    const stat = promisify(fs.stat);

    const processDirectory = async (currentPath: string): Promise<void> => {
      try {
        const items = await readDir(currentPath);

        for (const item of items) {
          // Check if we should stop
          if (this.shouldStop) {
            return;
          }

          const itemPath = path.join(currentPath, item);
          const itemStat = await stat(itemPath);

          if (itemStat.isDirectory()) {
            await processDirectory(itemPath);
          } else if (itemStat.isFile() && this.isSupportedAudioFile(itemPath)) {
            audioFiles.push(itemPath);
          }
        }
      } catch (error: any) {
        logger.warn(`Failed to read directory ${currentPath}:`, error.message);
      }
    };

    await processDirectory(dirPath);
    return audioFiles;
  }

  private isSupportedAudioFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase().substring(1);
    return config.supportedFormats.includes(ext);
  }

  private async removeDeletedFile(filePath: string): Promise<void> {
    try {
      const song = await SongModel.findByPath(filePath);
      if (song) {
        const albumId = song.album_id;
        const artists = await SongModel.getArtists(song.id);

        // Delete the song (this will also clean up song_artists junction table via CASCADE)
        await SongModel.deleteSong(song.id);
        logger.info(`Removed deleted file from library: ${filePath}`);

        // Clean up empty albums
        if (albumId) {
          await this.cleanupEmptyAlbum(albumId);
        }

        // Clean up artists that have no more songs or albums
        for (const artist of artists) {
          await this.cleanupEmptyArtist(artist.id);
        }
      }
    } catch (error: any) {
      logger.error(`Failed to remove deleted file ${filePath}:`, error);
    }
  }

  private async cleanupEmptyAlbum(albumId: number): Promise<void> {
    try {
      // Check if album has any songs left
      const songCount = await this.db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM songs WHERE album_id = ?',
        [albumId]
      );

      if (!songCount || songCount.count === 0) {
        // Album is empty, delete it
        await this.db.run('DELETE FROM albums WHERE id = ?', [albumId]);
        logger.info(`Deleted empty album: ${albumId}`);
      }
    } catch (error: any) {
      logger.error(`Failed to cleanup empty album ${albumId}:`, error);
    }
  }

  private async cleanupEmptyArtist(artistId: number): Promise<void> {
    try {
      // Check if artist has any songs (albums are derived from songs)
      const songCount = await this.db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM song_artists WHERE artist_id = ?',
        [artistId]
      );

      if (!songCount || songCount.count === 0) {
        // Artist has no songs, delete it
        await this.db.run('DELETE FROM artists WHERE id = ?', [artistId]);
        logger.info(`Deleted empty artist: ${artistId}`);
      }
    } catch (error: any) {
      logger.error(`Failed to cleanup empty artist ${artistId}:`, error);
    }
  }

  async cleanupAllEmptyEntries(): Promise<{ albumsDeleted: number; artistsDeleted: number }> {
    try {
      logger.info('🧹 Cleaning up empty albums and artists...');

      // Delete albums with no songs
      const albumResult = await this.db.run(
        `DELETE FROM albums
         WHERE id NOT IN (SELECT DISTINCT album_id FROM songs WHERE album_id IS NOT NULL)`
      );
      const albumsDeleted = albumResult.changes;

      // Delete artists with no songs
      const artistResult = await this.db.run(
        `DELETE FROM artists
         WHERE id NOT IN (SELECT DISTINCT artist_id FROM song_artists)`
      );
      const artistsDeleted = artistResult.changes;

      logger.info(`✅ Cleanup complete: ${albumsDeleted} empty albums deleted, ${artistsDeleted} empty artists deleted`);

      return { albumsDeleted, artistsDeleted };
    } catch (error: any) {
      logger.error('❌ Failed to cleanup empty entries:', error);
      throw error;
    }
  }

  private async updateScanResults(
    scanId: number,
    filesScanned: number,
    filesAdded: number,
    filesUpdated: number,
    errorsCount: number
  ): Promise<void> {
    await this.db.run(
      `UPDATE scan_history 
       SET files_scanned = ?, files_added = ?, files_updated = ?, errors_count = ?
       WHERE id = ?`,
      [filesScanned, filesAdded, filesUpdated, errorsCount, scanId]
    );
  }

  private async updateScanStatus(scanId: number, status: string, errorMessage?: string): Promise<void> {
    await this.db.run(
      `UPDATE scan_history 
       SET status = ?, completed_at = CURRENT_TIMESTAMP, error_message = ?
       WHERE id = ?`,
      [status, errorMessage || null, scanId]
    );
  }

  async getScanHistory(): Promise<any[]> {
    return await this.db.query(
      'SELECT * FROM scan_history ORDER BY started_at DESC LIMIT 50'
    );
  }

  getCurrentScan(): ScanProgress | null {
    return this.currentScan;
  }

  async getLibraryStats(): Promise<any> {
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
    // Close existing watcher
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Setup new watcher with updated paths
    await this.setupFileWatcher();
  }

  destroy(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

export default new LibraryScanner();
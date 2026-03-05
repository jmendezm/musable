// Set up error handlers FIRST before anything else
process.on('uncaughtException', (error: any) => {
  console.error('[Worker] UNCAUGHT EXCEPTION:', error.message);
  console.error('[Worker] Stack:', error.stack);
  try {
    const { parentPort } = require('worker_threads');
    if (parentPort) {
      parentPort.postMessage({
        type: 'scanError',
        data: { error: error.message }
      });
    }
  } catch (e) {
    // Ignore if parentPort not available
  }
});

process.on('unhandledRejection', (reason: any) => {
  console.error('[Worker] UNHANDLED REJECTION:', reason);
  console.error('[Worker] Reason:', reason?.stack || reason);
});

// Import worker_threads to get workerData
import { parentPort, workerData } from 'worker_threads';

// Get config from workerData passed by parent process
const config = {
  databasePath: workerData?.databasePath || '',
  dataDir: workerData?.dataDir || '',
  uploadsDir: workerData?.uploadsDir || '',
};

import * as path from 'path';
import * as fs from 'fs';
import { parseFile } from 'music-metadata';
import sharp from 'sharp';
import { promisify } from 'util';
import sqlite3 from 'sqlite3';
import { calculateFileHash, hashCache } from '../utils/fileHash';

interface ScanRequest {
  type: 'scan' | 'stop';
  scanId?: number;
  paths?: string[];
  pathReports?: Array<{
    pathId: number;
    path: string;
    reportId: number;
  }>;
}

interface WorkerResponse {
  type: 'scanProgress' | 'scanComplete' | 'scanError';
  data: any;
}

interface ScanFileResult {
  added: boolean;
  updated: boolean;
  skipped: boolean;
  renamed: boolean;
  duplicate: boolean;
}

let isScanning = false;
let shouldStop = false;
let currentScanId: number | null = null;

// Track artwork errors to avoid spamming logs
let artworkErrors = 0;
let maxArtworkErrorLogs = 5; // Only log first 5 artwork errors in detail

// Worker-specific database connection
let workerDb: sqlite3.Database | null = null;

// Create a worker-specific database interface
const Database = {
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!workerDb) {
      throw new Error('Worker database not initialized');
    }
    return new Promise((resolve, reject) => {
      workerDb!.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  },

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    if (!workerDb) {
      throw new Error('Worker database not initialized');
    }
    return new Promise((resolve, reject) => {
      workerDb!.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve((row as T) || null);
        }
      });
    });
  },

  async run(sql: string, params: any[] = []): Promise<{ lastID: number | null; changes: number }> {
    if (!workerDb) {
      throw new Error('Worker database not initialized');
    }
    return new Promise((resolve, reject) => {
      workerDb!.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }
};

async function initializeWorker() {
  try {
    // Create a new database connection for this worker
    const fullPath = path.resolve(config.databasePath);
    const dbDir = path.dirname(fullPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    workerDb = new sqlite3.Database(fullPath, (err) => {
      if (err) {
        console.error('[Worker] Error opening database:', err.message);
        throw err;
      }
    });

    // Enable foreign keys and WAL mode
    await new Promise<void>((resolve, reject) => {
      workerDb!.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      workerDb!.run('PRAGMA journal_mode = WAL', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Add unique index on lowercase artist names to prevent duplicates during parallel scanning
    await new Promise<void>((resolve, reject) => {
      workerDb!.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_artists_name_lowercase ON artists(LOWER(name))`, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Add unique index on lowercase album titles to prevent duplicates during parallel scanning
    await new Promise<void>((resolve, reject) => {
      workerDb!.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_title_lowercase ON albums(LOWER(title))`, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Test database connection
    await new Promise<void>((resolve, reject) => {
      workerDb!.get('SELECT 1 as test', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (error: any) {
    console.error('[Worker] Failed to initialize:', error);
    throw error;
  }
}

function isSupportedAudioFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase().substring(1);
  const supportedFormats = ['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'wma', 'aiff', 'aif', 'ape', 'opus', 'webm'];
  return supportedFormats.includes(ext);
}

async function scanFile(filePath: string): Promise<ScanFileResult> {
  try {
    if (!isSupportedAudioFile(filePath)) {
      return { added: false, updated: false, skipped: true, renamed: false, duplicate: false };
    }

    const fileStats = fs.statSync(filePath);

    // Calculate file hash for content-based identification
    let fileHash: string | null = null;
    try {
      // Check cache first
      const cachedHash = await hashCache.getCachedHash(filePath);
      if (cachedHash) {
        fileHash = cachedHash;
      } else {
        // Calculate hash and cache it
        fileHash = await calculateFileHash(filePath);
        hashCache.setCachedHash(filePath, fileHash);
      }
    } catch (hashError) {
      console.error(`[Worker] Failed to calculate hash for ${filePath}:`, hashError);
      // Continue without hash - will use file_path matching
    }

    // Check if this file hash already exists in the database at a different path
    if (fileHash) {
      const existingByHash = await Database.get(
        'SELECT * FROM songs WHERE file_hash = ? AND file_path != ?',
        [fileHash, filePath]
      );

      if (existingByHash) {
        // File was moved or renamed! Update the path instead of creating a duplicate
        console.log(`[Worker] Detected moved/renamed file: ${existingByHash.file_path} -> ${filePath}`);

        await Database.run(
          'UPDATE songs SET file_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [filePath, existingByHash.id]
        );

        // Update playlist_songs to use the correct song_id
        await Database.run(
          'UPDATE playlist_songs SET song_id = ? WHERE file_hash = ?',
          [existingByHash.id, fileHash]
        );

        return { added: false, updated: false, skipped: false, renamed: true, duplicate: false };
      }
    }

    // Parse metadata
    const metadata = await parseFile(filePath);
    const artistName = metadata.common.artist || 'Unknown Artist';
    const albumTitle = metadata.common.album;
    const title = metadata.common.title || path.basename(filePath, path.extname(filePath));

    // Create artist (INSERT OR IGNORE works with the unique index on LOWER(name))
    await Database.run(
      'INSERT OR IGNORE INTO artists (name) VALUES (?)',
      [artistName]
    );

    // Fetch the artist (insert OR IGNORE ensures only one exists per case-insensitive name)
    const artistResult = await Database.query(
      'SELECT * FROM artists WHERE LOWER(name) = LOWER(?)',
      [artistName]
    );

    if (!artistResult || artistResult.length === 0) {
      throw new Error(`Artist "${artistName}" not found after insert`);
    }

    const artist = artistResult[0];

    let album = null;
    if (albumTitle) {
      // Create album (INSERT OR IGNORE works with the unique index on LOWER(title))
      await Database.run(
        'INSERT OR IGNORE INTO albums (title, release_year) VALUES (?, ?)',
        [albumTitle, metadata.common.year || null]
      );

      // Fetch the album (insert OR IGNORE ensures only one exists per case-insensitive title)
      const albumResult = await Database.query(
        'SELECT * FROM albums WHERE LOWER(title) = LOWER(?)',
        [albumTitle]
      );

      if (albumResult && albumResult.length > 0) {
        album = albumResult[0];

        // Save artwork if present (only if album doesn't have artwork yet)
        if (metadata.common.picture && metadata.common.picture.length > 0 && !album.artwork_path) {
          const artworkPath = await saveAlbumArtwork(album.id, metadata.common.picture[0]);
          if (artworkPath) {
            await Database.run(
              'UPDATE albums SET artwork_path = ? WHERE id = ?',
              [artworkPath, album.id]
            );
          }
        }
      }
    }

    // Check if file already exists by path
    const existingByPath = await Database.get(
      'SELECT * FROM songs WHERE file_path = ?',
      [filePath]
    );

    let song = existingByPath;
    let wasAdded = false;
    let wasUpdated = false;

    if (song) {
      // File exists at this path - check if it needs updating
      // Update hash if it wasn't set before
      if (fileHash && !song.file_hash) {
        await Database.run(
          'UPDATE songs SET file_hash = ? WHERE id = ?',
          [fileHash, song.id]
        );
        song.file_hash = fileHash;
      }

      // Check if file size changed (file was modified)
      if (song.file_size !== fileStats.size) {
        await Database.run(
          `UPDATE songs SET title = ?, album_id = ?, file_size = ?, file_hash = ?,
           duration = ?, track_number = ?, genre = ?, year = ?, bitrate = ?, sample_rate = ?
           WHERE id = ?`,
          [
            title,
            album?.id || null,
            fileStats.size,
            fileHash || null,
            metadata.format.duration ? Math.round(metadata.format.duration) : null,
            metadata.common.track?.no || null,
            metadata.common.genre?.join(', ') || null,
            metadata.common.year || null,
            metadata.format.bitrate || null,
            metadata.format.sampleRate || null,
            song.id
          ]
        );
        wasUpdated = true;
      } else {
        // File unchanged
        wasUpdated = false;
      }
    } else {
      // New file - insert it
      await Database.run(
        `INSERT INTO songs (title, album_id, file_path, file_size, file_hash, duration,
         track_number, genre, year, bitrate, sample_rate, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title,
          album?.id || null,
          filePath,
          fileStats.size,
          fileHash || null,
          metadata.format.duration ? Math.round(metadata.format.duration) : null,
          metadata.common.track?.no || null,
          metadata.common.genre?.join(', ') || null,
          metadata.common.year || null,
          metadata.format.bitrate || null,
          metadata.format.sampleRate || null,
          'local'
        ]
      );

      // Fetch the newly created song
      const fetchedSongs = await Database.query(
        'SELECT * FROM songs WHERE file_path = ?',
        [filePath]
      );

      if (!fetchedSongs || fetchedSongs.length === 0) {
        throw new Error('Failed to insert or fetch song');
      }

      song = fetchedSongs[0];
      wasAdded = true;

      // Check if this is a duplicate (same hash as another file)
      if (fileHash) {
        const duplicateCheck = await Database.query(
          'SELECT id, file_path FROM songs WHERE file_hash = ? AND id != ?',
          [fileHash, song.id]
        );

        if (duplicateCheck && duplicateCheck.length > 0) {
          console.log(`[Worker] Duplicate detected: ${filePath} has same hash as ${duplicateCheck[0].file_path}`);
          return { added: true, updated: false, skipped: false, renamed: false, duplicate: true };
        }
      }
    }

    // Atomic artist update: always delete all existing artists and insert the correct one
    // This ensures each song has exactly ONE artist from its metadata
    await Database.run('DELETE FROM song_artists WHERE song_id = ?', [song.id]);
    await Database.run(
      'INSERT INTO song_artists (song_id, artist_id) VALUES (?, ?)',
      [song.id, artist.id]
    );

    return { added: wasAdded, updated: wasUpdated, skipped: !wasAdded && !wasUpdated, renamed: false, duplicate: false };
  } catch (error: any) {
    console.error(`[Worker] Failed to scan file ${filePath}:`, error.message);
    throw error;
  }
}

async function saveAlbumArtwork(albumId: number, picture: any): Promise<string | null> {
  try {
    const artworkDir = path.join(config.uploadsDir, 'artwork');
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
    artworkErrors++;

    // Only log detailed error for first few instances to avoid log spam
    if (artworkErrors <= maxArtworkErrorLogs) {
      console.error(`[Worker] Failed to save album artwork for album ${albumId}: ${error.message}`);

      // Log if it's a corrupt image data error (common issue)
      if (error.message.includes('Corrupt') || error.message.includes('extraneous')) {
        console.error('[Worker] Note: This is usually caused by embedded artwork with corrupt or non-standard JPEG data. The file will be added to the library but without album artwork.');
      }
    } else if (artworkErrors === maxArtworkErrorLogs + 1) {
      // Log once when we hit the limit to let user know we're suppressing further logs
      console.error(`[Worker] Additional artwork save errors detected (total: ${artworkErrors}). Suppressing further artwork error logs to avoid spam.`);
    }

    return null;
  }
}

async function findAudioFiles(dirPath: string): Promise<string[]> {
  const audioFiles: string[] = [];
  const readDir = promisify(fs.readdir);
  const stat = promisify(fs.stat);

  const processDirectory = async (currentPath: string): Promise<void> => {
    try {
      const items = await readDir(currentPath);

      for (const item of items) {
        if (shouldStop) {
          return;
        }

        const itemPath = path.join(currentPath, item);
        const itemStat = await stat(itemPath);

        if (itemStat.isDirectory()) {
          await processDirectory(itemPath);
        } else if (itemStat.isFile() && isSupportedAudioFile(itemPath)) {
          audioFiles.push(itemPath);
        }
      }
    } catch (error: any) {
      console.error(`[Worker] Failed to read directory ${currentPath}:`, error.message);
    }
  };

  await processDirectory(dirPath);
  return audioFiles;
}

async function performScan(
  scanId: number,
  scanPaths: string[],
  pathReports?: Array<{
    pathId: number;
    path: string;
    reportId: number;
  }>
): Promise<void> {
  console.log('[Worker] performScan called with scanId:', scanId, 'paths:', scanPaths);
  let totalFilesScanned = 0;
  let totalFilesAdded = 0;
  let totalFilesUpdated = 0;
  let totalFilesRemoved = 0;
  let totalFilesRenamed = 0;
  let totalFilesSkipped = 0;
  let totalDuplicates = 0;
  let totalErrors = 0;

  // Track progress for each library path
  const pathProgressMap = new Map<number, {
    filesScanned: number;
    filesAdded: number;
    filesUpdated: number;
    filesRemoved: number;
    filesRenamed: number;
    filesSkipped: number;
    duplicatesFound: number;
    errorsCount: number;
    errors: Array<{ filePath: string; errorMessage: string }>;
  }>();

  if (pathReports) {
    for (const pr of pathReports) {
      pathProgressMap.set(pr.reportId, {
        filesScanned: 0,
        filesAdded: 0,
        filesUpdated: 0,
        filesRemoved: 0,
        filesRenamed: 0,
        filesSkipped: 0,
        duplicatesFound: 0,
        errorsCount: 0,
        errors: []
      });
    }
  }

  // Reset artwork error counter for new scan
  artworkErrors = 0;

  try {
    console.log('[Worker] Starting library scan...');
    console.log(`[Worker] Scanning paths: ${scanPaths.join(', ')}`);
    if (pathReports) {
      console.log(`[Worker] Tracking ${pathReports.length} library path reports`);
    }

    // First, remove all songs that are NOT in any of the current library paths
    // This handles the case where a path was removed from the library
    if (scanPaths.length > 0) {
      console.log('[Worker] Checking for songs that no longer belong to any library path...');

      // Build OR condition for all library paths
      const pathConditions = scanPaths.map(() => 'file_path LIKE ?').join(' OR ');
      const pathParams = scanPaths.map(p => `${p}%`);

      // Find all songs that DON'T match any library path
      const orphanedSongs = await Database.query<{ id: number; file_path: string }>(
        `SELECT id, file_path FROM songs WHERE NOT (${pathConditions})`,
        pathParams
      );

      if (orphanedSongs.length > 0) {
        console.log(`[Worker] Found ${orphanedSongs.length} songs that no longer belong to any library path, removing...`);

        for (const song of orphanedSongs) {
          try {
            await Database.run('DELETE FROM songs WHERE id = ?', [song.id]);
            totalFilesRemoved++;
            console.log(`[Worker] Removed orphaned song: ${song.file_path} (id: ${song.id})`);
          } catch (err) {
            console.error(`[Worker] Error removing orphaned song ${song.id}:`, err);
          }
        }

        console.log(`[Worker] Removed ${orphanedSongs.length} orphaned songs in total`);
      }
    }

    for (let pathIndex = 0; pathIndex < scanPaths.length; pathIndex++) {
      const scanPath = scanPaths[pathIndex];
      const currentPathReport = pathReports?.[pathIndex];

      if (shouldStop) {
        console.log('[Worker] Scan stopped by user');
        break;
      }

      if (!fs.existsSync(scanPath)) {
        console.log(`[Worker] Path does not exist: ${scanPath}`);

        // Mark report as failed if path doesn't exist
        if (currentPathReport) {
          await Database.run(
            `UPDATE library_path_scan_reports
             SET status = 'failed', completed_at = ?, error_message = ?
             WHERE id = ?`,
            [new Date().toISOString(), `Path does not exist: ${scanPath}`, currentPathReport.reportId]
          );
        }
        continue;
      }

      console.log(`[Worker] Scanning path: ${scanPath}`);
      if (currentPathReport) {
        console.log(`[Worker] Using report ID ${currentPathReport.reportId} for this path`);
      }

      // Get existing files in database for this path before scanning
      const existingDbFiles = await Database.query(
        'SELECT id, file_path, file_hash FROM songs WHERE file_path LIKE ?',
        [`${scanPath}%`]
      );
      const existingFilePaths = new Set(existingDbFiles.map((f: any) => f.file_path));
      console.log(`[Worker] Found ${existingDbFiles.length} existing files in database for ${scanPath}`);

      // Count files first
      const audioFiles = await findAudioFiles(scanPath);
      const foundFilePaths = new Set(audioFiles);
      const totalFiles = audioFiles.length;
      console.log(`[Worker] Found ${totalFiles} files in ${scanPath}`);

      // Detect removed files (files in DB but not on disk)
      const removedFiles = existingDbFiles.filter((f: any) => !foundFilePaths.has(f.file_path));
      for (const removed of removedFiles) {
        await Database.run('DELETE FROM songs WHERE id = ?', [removed.id]);
        totalFilesRemoved++;
        if (currentPathReport) {
          const progress = pathProgressMap.get(currentPathReport.reportId);
          if (progress) {
            progress.filesRemoved++;
          }
        }
      }
      if (removedFiles.length > 0) {
        console.log(`[Worker] Removed ${removedFiles.length} files that no longer exist in ${scanPath}`);
      }

      // Initialize/reset path-specific counters
      let pathFilesScanned = 0;
      let pathFilesAdded = 0;
      let pathFilesUpdated = 0;
      let pathFilesRemoved = removedFiles.length;
      let pathFilesRenamed = 0;
      let pathFilesSkipped = 0;
      let pathDuplicates = 0;
      let pathErrors = 0;

      // Process files with concurrency of 3
      const CONCURRENCY = 3;
      let processedFiles = 0;

      for (let i = 0; i < audioFiles.length; i += CONCURRENCY) {
        if (shouldStop) {
          console.log('[Worker] Scan stopped by user');
          break;
        }

        const batch = audioFiles.slice(i, i + CONCURRENCY);

        const results = await Promise.allSettled(
          batch.map(async (filePath) => {
            try {
              if (shouldStop) {
                return { scanned: false, added: false, updated: false, skipped: true, renamed: false, duplicate: false };
              }

              const result = await scanFile(filePath);
              return { scanned: true, ...result };
            } catch (error: any) {
              console.error(`[Worker] Error processing ${path.basename(filePath)}: ${error.message}`);
              return { scanned: false, added: false, updated: false, skipped: false, renamed: false, duplicate: false, error: true, filePath, errorMessage: error.message };
            }
          })
        );

        // Process results
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const data = result.value;
            if (data.scanned) {
              totalFilesScanned++;
              pathFilesScanned++;
            }
            if (data.added) {
              totalFilesAdded++;
              pathFilesAdded++;
            }
            if (data.updated) {
              totalFilesUpdated++;
              pathFilesUpdated++;
            }
            if (data.renamed) {
              totalFilesRenamed++;
              pathFilesRenamed++;
            }
            if (data.duplicate) {
              totalDuplicates++;
              pathDuplicates++;
            }
            if (data.skipped) {
              totalFilesSkipped++;
              pathFilesSkipped++;
            }
            if (data.error) {
              totalErrors++;
              pathErrors++;

              // Store error details for path report
              if (currentPathReport && data.filePath && data.errorMessage) {
                const progress = pathProgressMap.get(currentPathReport.reportId);
                if (progress) {
                  progress.errors.push({
                    filePath: data.filePath,
                    errorMessage: data.errorMessage
                  });
                  progress.errorsCount++;
                }

                // Add error to database
                await Database.run(
                  `INSERT INTO library_path_scan_errors (scan_report_id, file_path, error_message, error_type)
                   VALUES (?, ?, ?, ?)`,
                  [currentPathReport.reportId, data.filePath, data.errorMessage, 'scan_error']
                );
              }
            }
          }
        }

        processedFiles += batch.length;
        const progress = Math.round((processedFiles / totalFiles) * 100);

        // Send progress update every 50 files
        if (processedFiles % 50 === 0 || processedFiles === totalFiles) {
          console.log(`[Worker] ${scanPath}: ${processedFiles}/${totalFiles} (${pathFilesAdded} added, ${pathFilesUpdated} updated, ${pathFilesRemoved} removed, ${pathFilesRenamed} renamed/moved, ${pathDuplicates} duplicates, ${pathErrors} errors)`);

          sendMessage({
            type: 'scanProgress',
            data: {
              scanId,
              filesScanned: totalFilesScanned,
              filesAdded: totalFilesAdded,
              filesUpdated: totalFilesUpdated,
              filesRemoved: totalFilesRemoved,
              filesRenamed: totalFilesRenamed,
              filesSkipped: totalFilesSkipped,
              duplicatesFound: totalDuplicates,
              errorsCount: totalErrors,
              progress,
              totalFiles,
              currentFile: batch[0]
            }
          });

          // Update path report in database
          if (currentPathReport) {
            await Database.run(
              `UPDATE library_path_scan_reports
               SET files_scanned = ?, files_added = ?, files_updated = ?,
                   files_removed = ?, files_renamed = ?, files_skipped = ?,
                   duplicates_found = ?, errors_count = ?, progress = ?, total_files = ?
               WHERE id = ?`,
              [pathFilesScanned, pathFilesAdded, pathFilesUpdated, pathFilesRemoved, pathFilesRenamed, pathFilesSkipped, pathDuplicates, pathErrors, progress, totalFiles, currentPathReport.reportId]
            );
          }
        }
      }

      // Mark path report as completed or stopped
      if (currentPathReport) {
        const reportStatus = shouldStop ? 'stopped' : 'completed';
        await Database.run(
          `UPDATE library_path_scan_reports
           SET status = ?, completed_at = ?, progress = 100
           WHERE id = ?`,
          [reportStatus, new Date().toISOString(), currentPathReport.reportId]
        );
        console.log(`[Worker] ${reportStatus} report ${currentPathReport.reportId} for path ${scanPath}`);
      }
    }

    // Update final results
    await Database.run(
      `UPDATE scan_history
       SET files_scanned = ?, files_added = ?, files_updated = ?, errors_count = ?
       WHERE id = ?`,
      [totalFilesScanned, totalFilesAdded, totalFilesUpdated, totalErrors, scanId]
    );

    const completedAt = new Date().toISOString();
    const scanStatus = shouldStop ? 'stopped' : 'completed';
    await Database.run(
      `UPDATE scan_history SET status = ?, completed_at = ? WHERE id = ?`,
      [scanStatus, completedAt, scanId]
    );

    // If scan was stopped, mark any remaining "running" path reports as stopped
    if (shouldStop && pathReports && pathReports.length > 0) {
      for (const pr of pathReports) {
        await Database.run(
          `UPDATE library_path_scan_reports
           SET status = 'stopped', completed_at = ?
           WHERE id = ? AND status = 'running'`,
          [completedAt, pr.reportId]
        );
      }
    }

    sendMessage({
      type: 'scanComplete',
      data: {
        scanId,
        summary: {
          filesScanned: totalFilesScanned,
          filesAdded: totalFilesAdded,
          filesUpdated: totalFilesUpdated,
          filesRemoved: totalFilesRemoved,
          filesRenamed: totalFilesRenamed,
          filesSkipped: totalFilesSkipped,
          duplicatesFound: totalDuplicates,
          errors: totalErrors
        }
      }
    });

    console.log(`[Worker] Scan ${scanStatus}: ${totalFilesScanned} scanned, ${totalFilesAdded} added, ${totalFilesUpdated} updated, ${totalFilesRemoved} removed, ${totalFilesRenamed} renamed/moved, ${totalFilesSkipped} skipped, ${totalDuplicates} duplicates, ${totalErrors} errors`);

    // Log artwork error summary if there were any
    if (artworkErrors > 0) {
      console.log(`[Worker] Note: ${artworkErrors} album artwork(s) could not be saved due to corrupt or invalid image data. These albums were added to the library but without cover art.`);
    }

  } catch (error: any) {
    console.error('[Worker] Scan failed:', error);

    await Database.run(
      `UPDATE scan_history SET status = 'failed', completed_at = ?, error_message = ? WHERE id = ?`,
      [new Date().toISOString(), error.message, scanId]
    );

    sendMessage({
      type: 'scanError',
      data: { scanId, error: error.message }
    });
  } finally {
    isScanning = false;
    shouldStop = false;
    currentScanId = null;
  }
}

function stopScan(): void {
  if (isScanning) {
    console.log('[Worker] Stopping library scan...');
    shouldStop = true;
  }
}

function sendMessage(message: WorkerResponse): void {
  if (parentPort) {
    parentPort.postMessage(message);
  }
}

// Handle messages from main thread
if (parentPort) {
  parentPort.on('message', async (message: ScanRequest) => {
    try {
      console.log('[Worker] Received message:', message.type);
      switch (message.type) {
        case 'scan':
          console.log('[Worker] Processing scan message, scanId:', message.scanId, 'paths:', message.paths?.length);
          if (message.scanId && message.paths) {
            isScanning = true;
            shouldStop = false;
            currentScanId = message.scanId;
            console.log('[Worker] About to call performScan...');
            await performScan(message.scanId, message.paths, message.pathReports);
            console.log('[Worker] performScan completed');
          } else {
            console.error('[Worker] Invalid scan message:', message);
          }
          break;

        case 'stop':
          stopScan();
          break;

        default:
          console.warn('[Worker] Unknown message type:', message.type);
      }
    } catch (error: any) {
      console.error('[Worker] Error handling message:', error);
      sendMessage({
        type: 'scanError',
        data: { error: error.message }
      });
    }
  });
} else {
  console.error('[Worker] parentPort is not available! Message handling will not work!');
}

// Initialize
let keepAliveInterval: NodeJS.Timeout | null = null;

initializeWorker()
  .then(() => {
    // File watcher disabled - it's causing performance issues with large libraries over Samba
    return Promise.resolve();
  })
  .then(() => {
    sendMessage({
      type: 'scanProgress',
      data: { status: 'ready' }
    });

    // Keep the worker alive by preventing the event loop from emptying
    // This is necessary because worker threads exit when their event loop is empty
    keepAliveInterval = setInterval(() => {
      // This interval keeps the worker alive
    }, 15000);

    // Clear interval on exit
    process.on('exit', () => {
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
    });
  })
  .catch((error: any) => {
    console.error('[Worker] Failed to initialize:', error);
    sendMessage({
      type: 'scanError',
      data: { error: error.message }
    });
  });

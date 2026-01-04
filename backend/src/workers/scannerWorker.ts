import { parentPort } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import { parseFile } from 'music-metadata';
import sharp from 'sharp';
import { promisify } from 'util';
import sqlite3 from 'sqlite3';

// Set up error handlers IMMEDIATELY at the top
process.on('uncaughtException', (error: any) => {
  console.error('[Worker] UNCAUGHT EXCEPTION:', error.message);
  console.error('[Worker] Stack:', error.stack);
  // Send error to parent port
  if (parentPort) {
    parentPort.postMessage({
      type: 'scanError',
      data: { error: error.message }
    });
  }
});

process.on('unhandledRejection', (reason: any) => {
  console.error('[Worker] UNHANDLED REJECTION:', reason);
  console.error('[Worker] Reason:', reason?.stack || reason);
});

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
    const dbPath = process.env.DATABASE_PATH || './musable.db';
    const fullPath = path.resolve(dbPath);

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

    // Test database connection
    await Database.query('SELECT 1 as test');
  } catch (error: any) {
    console.error('[Worker] Failed to initialize:', error);
    console.error('[Worker] Error type:', error.constructor.name);
    console.error('[Worker] Error stack:', error.stack);
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
      return { added: false, updated: false, skipped: true };
    }

    const metadata = await parseFile(filePath);
    const fileStats = fs.statSync(filePath);

    const artistName = metadata.common.artist || 'Unknown Artist';
    const albumTitle = metadata.common.album;
    const title = metadata.common.title || path.basename(filePath, path.extname(filePath));

    // Atomic insert-or-ignore to prevent duplicate artists during concurrent scanning
    await Database.run(
      'INSERT OR IGNORE INTO artists (name) VALUES (?)',
      [artistName]
    );

    // Now fetch the artist (it either existed or was just created)
    const artistResult = await Database.query(
      'SELECT * FROM artists WHERE name = ? COLLATE NOCASE',
      [artistName]
    );
    const artist = artistResult;

    let album = null;
    if (albumTitle) {
      // Atomic insert-or-ignore to prevent duplicate albums during concurrent scanning
      await Database.run(
        'INSERT OR IGNORE INTO albums (title, release_year) VALUES (?, ?)',
        [albumTitle, metadata.common.year || null]
      );

      // Now fetch the album (it either existed or was just created)
      let albumResult = await Database.query(
        'SELECT * FROM albums WHERE title = ? COLLATE NOCASE',
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

    // Atomic insert-or-ignore to prevent duplicate songs during concurrent scanning
    await Database.run(
      `INSERT OR IGNORE INTO songs (title, album_id, file_path, file_size, duration,
       track_number, genre, year, bitrate, sample_rate, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        album?.id || null,
        filePath,
        fileStats.size,
        metadata.format.duration ? Math.round(metadata.format.duration) : null,
        metadata.common.track?.no || null,
        metadata.common.genre?.join(', ') || null,
        metadata.common.year || null,
        metadata.format.bitrate || null,
        metadata.format.sampleRate || null,
        'local'
      ]
    );

    // Fetch the song (it either existed or was just created)
    const fetchedSongs = await Database.query(
      'SELECT * FROM songs WHERE file_path = ?',
      [filePath]
    );

    if (!fetchedSongs || fetchedSongs.length === 0) {
      throw new Error('Failed to insert or fetch song');
    }

    const song = fetchedSongs[0];
    let wasAdded = false;
    let wasUpdated = false;

    // Check if this is a new song (file_size should match if it existed before)
    // If file_size differs, the file was modified and needs update
    if (song.file_size !== fileStats.size) {
      // File size changed, update metadata
      await Database.run(
        `UPDATE songs SET title = ?, album_id = ?, file_size = ?,
         duration = ?, track_number = ?, genre = ?, year = ?, bitrate = ?, sample_rate = ?
         WHERE id = ?`,
        [
          title,
          album?.id || null,
          fileStats.size,
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
    } else if (song.created_at === song.updated_at) {
      // Song was just created (created_at equals updated_at for new rows)
      wasAdded = true;
    }

    // Atomic artist update: always delete all existing artists and insert the correct one
    // This ensures each song has exactly ONE artist from its metadata
    await Database.run('DELETE FROM song_artists WHERE song_id = ?', [song.id]);
    await Database.run(
      'INSERT INTO song_artists (song_id, artist_id) VALUES (?, ?)',
      [song.id, artist[0].id]
    );

    return { added: wasAdded, updated: wasUpdated, skipped: !wasAdded && !wasUpdated };
  } catch (error: any) {
    console.error(`[Worker] Failed to scan file ${filePath}:`, error.message);
    throw error;
  }
}

async function saveAlbumArtwork(albumId: number, picture: any): Promise<string | null> {
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
  let totalFilesScanned = 0;
  let totalFilesAdded = 0;
  let totalFilesUpdated = 0;
  let totalFilesSkipped = 0;
  let totalErrors = 0;

  // Track progress for each library path
  const pathProgressMap = new Map<number, {
    filesScanned: number;
    filesAdded: number;
    filesUpdated: number;
    filesSkipped: number;
    errorsCount: number;
    errors: Array<{ filePath: string; errorMessage: string }>;
  }>();

  if (pathReports) {
    for (const pr of pathReports) {
      pathProgressMap.set(pr.reportId, {
        filesScanned: 0,
        filesAdded: 0,
        filesUpdated: 0,
        filesSkipped: 0,
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

      // Count files first
      const audioFiles = await findAudioFiles(scanPath);
      const totalFiles = audioFiles.length;
      console.log(`[Worker] Found ${totalFiles} files in ${scanPath}`);

      // Initialize/reset path-specific counters
      let pathFilesScanned = 0;
      let pathFilesAdded = 0;
      let pathFilesUpdated = 0;
      let pathFilesSkipped = 0;
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
                return { scanned: false, added: false, updated: false, skipped: true };
              }

              const result = await scanFile(filePath);
              return { scanned: true, ...result };
            } catch (error: any) {
              console.error(`[Worker] Error processing ${path.basename(filePath)}: ${error.message}`);
              return { scanned: false, added: false, updated: false, skipped: false, error: true, filePath, errorMessage: error.message };
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
          console.log(`[Worker] ${scanPath}: ${processedFiles}/${totalFiles} (${pathFilesAdded} added, ${pathFilesUpdated} updated, ${pathFilesSkipped} skipped, ${pathErrors} errors)`);

          sendMessage({
            type: 'scanProgress',
            data: {
              scanId,
              filesScanned: totalFilesScanned,
              filesAdded: totalFilesAdded,
              filesUpdated: totalFilesUpdated,
              filesSkipped: totalFilesSkipped,
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
                   files_skipped = ?, errors_count = ?, progress = ?, total_files = ?
               WHERE id = ?`,
              [pathFilesScanned, pathFilesAdded, pathFilesUpdated, pathFilesSkipped, pathErrors, progress, totalFiles, currentPathReport.reportId]
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
      data: { scanId }
    });

    console.log(`[Worker] Scan ${scanStatus}: ${totalFilesScanned} scanned, ${totalFilesAdded} added, ${totalFilesUpdated} updated, ${totalFilesSkipped} skipped, ${totalErrors} errors`);

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
      switch (message.type) {
        case 'scan':
          if (message.scanId && message.paths) {
            isScanning = true;
            shouldStop = false;
            currentScanId = message.scanId;
            await performScan(message.scanId, message.paths, message.pathReports);
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
    // If needed, you can enable it by uncommenting the next line:
    // return setupFileWatcher();
    console.log('[Worker] File watcher disabled (not needed for scanning)');
    return Promise.resolve();
  })
  .then(() => {
    console.log('[Worker] Worker fully initialized and ready (without file watcher)');
    sendMessage({
      type: 'scanProgress',
      data: { status: 'ready' }
    });

    // Keep the worker alive by preventing the event loop from emptying
    // This is necessary because worker threads exit when their event loop is empty
    keepAliveInterval = setInterval(() => {
      // This interval keeps the worker alive (no logging needed)
      const timestamp = new Date().toISOString();
    }, 15000); // Every 15 seconds

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

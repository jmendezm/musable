import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger';
import config from './config';

export class Database {
  private static instance: Database;
  private db: sqlite3.Database;

  private constructor() {
    const fullPath = path.resolve(config.databasePath);
    const dbDir = path.dirname(fullPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new sqlite3.Database(fullPath, (err) => {
      if (err) {
        logger.error('Error opening database:', err.message);
      } else {
        logger.info('Connected to SQLite database:', fullPath);
        this.db.run('PRAGMA foreign_keys = ON');
        this.db.run('PRAGMA journal_mode = WAL');

        // Add image_path column to artists table if it doesn't exist
        this.db.run(`ALTER TABLE artists ADD COLUMN image_path TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            // Column already exists, which is fine
            logger.debug('artists.image_path column check:', err.message);
          }
        });

        // Add file_hash column to songs table if it doesn't exist
        this.db.run(`ALTER TABLE songs ADD COLUMN file_hash TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            logger.debug('songs.file_hash column check:', err.message);
          }
        });

        // Create index on file_hash if it doesn't exist
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_songs_file_hash ON songs(file_hash)`, (err) => {
          if (err) {
            logger.debug('idx_songs_file_hash index creation:', err.message);
          }
        });

        // Add file_hash column to playlist_songs table if it doesn't exist
        this.db.run(`ALTER TABLE playlist_songs ADD COLUMN file_hash TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            logger.debug('playlist_songs.file_hash column check:', err.message);
          }
        });

        // Add new columns to library_path_scan_reports if they don't exist
        this.db.run(`ALTER TABLE library_path_scan_reports ADD COLUMN files_removed INTEGER DEFAULT 0`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            logger.debug('library_path_scan_reports.files_removed column check:', err.message);
          }
        });

        this.db.run(`ALTER TABLE library_path_scan_reports ADD COLUMN files_renamed INTEGER DEFAULT 0`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            logger.debug('library_path_scan_reports.files_renamed column check:', err.message);
          }
        });

        this.db.run(`ALTER TABLE library_path_scan_reports ADD COLUMN duplicates_found INTEGER DEFAULT 0`, (err) => {
          if (err && !err.message.includes('duplicate column name')) {
            logger.debug('library_path_scan_reports.duplicates_found column check:', err.message);
          }
        });
      }
    });
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public getDatabase(): sqlite3.Database {
    return this.db;
  }

  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  public async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve((row as T) || null);
        }
      });
    });
  }

  public async run(sql: string, params: any[] = []): Promise<sqlite3.RunResult> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      });
    });
  }

  public async transaction<T>(callback: (db: sqlite3.Database) => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        callback(this.db)
          .then((result) => {
            this.db.run('COMMIT', (err) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            });
          })
          .catch((error) => {
            this.db.run('ROLLBACK', (rollbackErr) => {
              if (rollbackErr) {
                reject(rollbackErr);
              } else {
                reject(error);
              }
            });
          });
      });
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          logger.info('Database connection closed.');
          resolve();
        }
      });
    });
  }
}

export default Database.getInstance();
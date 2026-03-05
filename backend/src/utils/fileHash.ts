import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Calculate SHA-256 hash of a file's content
 * This is used to uniquely identify audio files regardless of their path or name
 *
 * @param filePath - Absolute path to the file
 * @returns Promise resolving to the hex-encoded SHA-256 hash
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => {
      hash.update(data);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    stream.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Calculate SHA-256 hash of a file's content synchronously
 * Use this for smaller files or when async is not available
 *
 * @param filePath - Absolute path to the file
 * @returns The hex-encoded SHA-256 hash
 */
export function calculateFileHashSync(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const fileBuffer = fs.readFileSync(filePath);
  hash.update(fileBuffer);
  return hash.digest('hex');
}

/**
 * Calculate hash for first N bytes of a file
 * This is faster for large files but less accurate
 * Useful for quick duplicate detection
 *
 * @param filePath - Absolute path to the file
 * @param bytesToRead - Number of bytes to read from start of file (default: 64KB)
 * @returns Promise resolving to the hex-encoded SHA-256 hash of the partial file
 */
export async function calculatePartialFileHash(
  filePath: string,
  bytesToRead: number = 65536
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { start: 0, end: bytesToRead - 1 });

    stream.on('data', (data) => {
      hash.update(data);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    stream.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Check if a file hash is valid (SHA-256 format)
 *
 * @param hash - The hash string to validate
 * @returns True if the hash appears to be a valid SHA-256 hash
 */
export function isValidHash(hash: string | null | undefined): boolean {
  if (!hash) return false;
  // SHA-256 hashes are 64 hexadecimal characters
  return /^[a-f0-9]{64}$/i.test(hash);
}

/**
 * Generate a hash key for caching purposes
 * Combines file path and modification time for quick change detection
 *
 * @param filePath - Absolute path to the file
 * @param mtime - File modification time
 * @returns A hash key for caching
 */
export function generateCacheKey(filePath: string, mtime: number): string {
  return crypto
    .createHash('md5')
    .update(`${filePath}:${mtime}`)
    .digest('hex');
}

/**
 * Hash cache to avoid recalculating hashes for unchanged files
 */
class HashCache {
  private cache = new Map<string, { hash: string; mtime: number }>();
  private maxCacheSize = 10000;

  /**
   * Get a cached hash if available and file hasn't changed
   */
  async getCachedHash(filePath: string): Promise<string | null> {
    try {
      const stats = fs.statSync(filePath);
      const mtime = stats.mtimeMs;

      const cached = this.cache.get(filePath);
      if (cached && cached.mtime === mtime) {
        return cached.hash;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Store a hash in the cache
   */
  setCachedHash(filePath: string, hash: string): void {
    try {
      const stats = fs.statSync(filePath);
      const mtime = stats.mtimeMs;

      // Prevent cache from growing too large
      if (this.cache.size >= this.maxCacheSize) {
        // Remove oldest entry (first entry in map)
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
          this.cache.delete(firstKey);
        }
      }

      this.cache.set(filePath, { hash, mtime });
    } catch (error) {
      // Ignore stats errors
    }
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove a specific entry from cache
   */
  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }
}

// Export a singleton instance
export const hashCache = new HashCache();

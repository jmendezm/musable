import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root (one directory up from backend/)
const envPath = path.resolve(__dirname, '../../../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  const error = result.error as any;
  if (error.code !== 'ENOENT') {
    // Silently ignore .env errors except in console
    console.error('Failed to load .env file:', result.error);
  }
}

// Base data directory - all application data goes here
// In Docker: uses DATA_DIR env var (/app/backend/data)
// In dev: use __dirname to get consistent path regardless of where process is run from
// __dirname for this file (backend/src/config/config.ts) is: /backend/src/config
// So we go up 3 levels to project root, then into backend/data
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', '..', 'backend', 'data');

interface Config {
  port: number;
  nodeEnv: string;
  databasePath: string;
  dataDir: string;
  uploadsDir: string;
  logsDir: string;
  ytDownloadsDir: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  sessionSecret: string;
  supportedFormats: string[];
  adminEmail: string;
  adminPassword: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  corsOrigin: string;
  logLevel: string;
}

const config: Config = {
  port: parseInt(process.env.BACKEND_PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databasePath: path.join(DATA_DIR, 'musable.db'),
  dataDir: DATA_DIR,
  uploadsDir: path.join(DATA_DIR, 'uploads'),
  logsDir: path.join(DATA_DIR, 'logs'),
  ytDownloadsDir: path.join(DATA_DIR, 'yt-downloads'),
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  sessionSecret: process.env.SESSION_SECRET || 'your-super-secret-session-key',
  supportedFormats: JSON.parse(process.env.SUPPORTED_FORMATS || '["mp3","flac","wav","m4a","aac","ogg"]'),
  adminEmail: process.env.ADMIN_EMAIL || 'admin@admin.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10000', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  logLevel: process.env.LOG_LEVEL || 'info'
};

export default config;
import dotenv from 'dotenv';
import path from 'path';
import logger from './../utils/logger';

// Load .env from project root (one directory up from backend/)
const envPath = path.resolve(__dirname, '../../../.env');
logger.info(`Loading .env from: ${envPath}`);
const result = dotenv.config({ path: envPath });

if (!result.error) {
  logger.info('Loaded .env file');
} else {
  logger.error('Failed to load .env file:', result.error);
}

interface Config {
  port: number;
  nodeEnv: string;
  databasePath: string;
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
  databasePath: process.env.DATABASE_PATH || './musable.db',
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
import morgan from 'morgan';
import { Request } from 'express';
import logger from './logger';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

// Color HTTP methods
const methodColors: Record<string, string> = {
  GET: colors.blue,
  POST: colors.green,
  PUT: colors.yellow,
  DELETE: colors.red,
  PATCH: colors.magenta,
  HEAD: colors.cyan,
  OPTIONS: colors.gray,
};

// Color status codes
function getStatusColor(status: number): string {
  if (status >= 500) return colors.red;      // Server errors
  if (status >= 400) return colors.yellow;   // Client errors
  if (status >= 300) return colors.cyan;     // Redirects
  if (status >= 200) return colors.green;    // Success
  return colors.white;
}

// Custom Morgan format with colors
morgan.token('colored-status', (req: Request, res) => {
  const status = res.statusCode;
  const color = getStatusColor(status);
  return `${color}${status}${colors.reset}`;
});

morgan.token('colored-method', (req: Request) => {
  const method = req.method;
  const color = methodColors[method] || colors.white;
  return `${color}${method}${colors.reset}`;
});

morgan.token('short-url', (req: Request) => {
  // Shorten URL by removing query parameters for cleaner logs
  const url = req.originalUrl || req.url;
  const cleanUrl = url.split('?')[0];
  return cleanUrl.length > 40 ? cleanUrl.substring(0, 40) + '...' : cleanUrl;
});

// Use default dev format with our custom tokens
morgan.format('musable-dev', (tokens, req: Request, res) => {
  const method = tokens['colored-method'](req, res);
  const url = tokens['short-url'](req, res);
  const status = tokens['colored-status'](req, res);
  const time = tokens['response-time'](req, res);
  const len = tokens['res'](req, res, 'content-length');

  // Round response time and remove decimals
  const timeRounded = time ? `${Math.round(parseFloat(time))}ms` : '-';

  // Only show content length if present, otherwise no trailing space
  const size = len ? ` ${colors.dim}[${len}b]${colors.reset}` : '';

  return `${method} ${url} ${status} ${timeRounded}${size}`;
});

// Create Morgan middleware with custom format
const morganMiddleware = morgan('musable-dev', {
  skip: (req: Request, res) => {
    // Skip logging for health check endpoint to reduce noise
    return req.path === '/health';
  },
  // Use our custom stream to integrate with logger
  stream: {
    write: (message: string) => {
      // Remove trailing newline and log through logger
      const cleanMessage = message.trim();
      logger.info(cleanMessage);
    }
  }
});

export default morganMiddleware;

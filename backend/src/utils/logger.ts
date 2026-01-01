// Import dotenv to ensure .env is loaded before logger initializes
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root to ensure LOG_LEVEL is available
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

// ANSI color codes for terminal
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

// Format timestamp to DD-MM-YYYY HH:MM:SS.mmm
function formatTimestamp(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');

  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}.${ms}`;
}

class Logger {
  private level: LogLevel;

  constructor() {
    // Read log level directly from environment variable (no circular dependency)
    const logLevel = process.env.LOG_LEVEL || 'info';

    switch (logLevel.toLowerCase()) {
      case 'error':
        this.level = LogLevel.ERROR;
        break;
      case 'warn':
        this.level = LogLevel.WARN;
        break;
      case 'info':
        this.level = LogLevel.INFO;
        break;
      case 'debug':
        this.level = LogLevel.DEBUG;
        break;
      default:
        this.level = LogLevel.INFO;
    }
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (level <= this.level) {
      const timestamp = formatTimestamp(new Date());
      const levelName = LogLevel[level];

      let colorMethod: any;
      let colorCode: string;
      let prefix: string;

      switch (level) {
        case LogLevel.ERROR:
          colorMethod = console.error;
          colorCode = colors.red;
          prefix = `${colorCode}${colors.bright}[${timestamp}] [${levelName}]${colors.reset}`;
          break;
        case LogLevel.WARN:
          colorMethod = console.warn;
          colorCode = colors.yellow;
          prefix = `${colorCode}${colors.bright}[${timestamp}] [${levelName}]${colors.reset}`;
          break;
        case LogLevel.INFO:
          colorMethod = console.log;
          colorCode = colors.cyan;
          prefix = `${colorCode}[${timestamp}]${colors.reset} ${colors.dim}[${levelName}]${colors.reset}`;
          break;
        case LogLevel.DEBUG:
          colorMethod = console.debug;
          colorCode = colors.gray;
          prefix = `${colorCode}[${timestamp}] [${levelName}]${colors.reset}`;
          break;
        default:
          colorMethod = console.log;
          prefix = `[${timestamp}] [${levelName}]`;
      }

      colorMethod(prefix, message, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }
}

export default new Logger();
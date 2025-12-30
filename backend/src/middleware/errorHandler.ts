import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class AppError extends Error implements ApiError {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { statusCode = 500, message } = error;

  // Only log stack traces for server errors (5xx)
  // Client errors (4xx) are operational and don't need stack traces
  if (statusCode >= 500) {
    logger.error(`Error ${statusCode}: ${message}`, {
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      stack: error.stack
    });
  } else {
    // For client errors (4xx), just log info without stack trace
    logger.info(`Client Error ${statusCode}: ${message}`, {
      url: req.url,
      method: req.method,
      ip: req.ip
    });
  }

  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(statusCode).json({
    success: false,
    error: {
      message: statusCode === 500 && !isDevelopment ? 'Internal Server Error' : message,
      ...(isDevelopment && statusCode >= 500 && { stack: error.stack }),
      timestamp: new Date().toISOString(),
      path: req.url
    }
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
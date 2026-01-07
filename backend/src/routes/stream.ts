import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import SongModel from '../models/Song';
import ShareTokenModel from '../models/ShareToken';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import logger from '../utils/logger';
import config from '../config/config';

const router = Router();

// Public stream route for shared songs (no authentication required)
router.get('/share/:token', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.params;

  // Validate share token
  const result = await ShareTokenModel.validateAndIncrementAccess(token);

  if (!result.valid || !result.song) {
    throw new AppError('Invalid or expired share link', 404);
  }

  const song = result.song;

  if (!fs.existsSync(song.file_path)) {
    throw new AppError('Audio file not found on disk', 404);
  }

  logger.info(`Public stream access via share token: ${song.title} by ${song.artist_name} (Token: ${token.substring(0, 8)}...)`);

  const stat = fs.statSync(song.file_path);
  const total = stat.size;

  // Set CORS headers for MediaElementAudioSourceNode support
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');

  if (req.headers.range) {
    const range = req.headers.range;
    const parts = range.replace(/bytes=/, "").split("-");
    const partialStart = parts[0];
    const partialEnd = parts[1];

    const start = parseInt(partialStart, 10);
    const end = partialEnd ? parseInt(partialEnd, 10) : total - 1;
    const chunkSize = (end - start) + 1;

    const readStream = fs.createReadStream(song.file_path, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize.toString(),
      'Content-Type': mime.lookup(song.file_path) || 'audio/mpeg',
      'Cache-Control': 'public, max-age=3600'
    });

    readStream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total.toString(),
      'Content-Type': mime.lookup(song.file_path) || 'audio/mpeg',
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes'
    });

    fs.createReadStream(song.file_path).pipe(res);
  }
}));

// Authenticated stream route (requires login)
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const songId = parseInt(id);

  if (isNaN(songId)) {
    throw new AppError('Invalid song ID', 400);
  }

  // Get token from Authorization header OR query parameter (for HTML5 audio streaming support)
  const authHeader = req.headers.authorization;
  const tokenQuery = req.query.token as string;
  const token = authHeader ? authHeader.replace('Bearer ', '') : tokenQuery;

  if (!token) {
    throw new AppError('Access token required', 401);
  }

  // Verify token
  try {
    const jwt = require('jsonwebtoken');
    jwt.verify(token, config.jwtSecret);
    // Token is valid, user can access the stream
  } catch (error: any) {
    throw new AppError('Invalid or expired token', 401);
  }

  const song = await SongModel.findById(songId);
  if (!song) {
    throw new AppError('Song not found', 404);
  }

  if (!fs.existsSync(song.file_path)) {
    throw new AppError('Audio file not found on disk', 404);
  }

  const stat = fs.statSync(song.file_path);
  const total = stat.size;

  // Set CORS headers for MediaElementAudioSourceNode support
  // This allows the browser to process the audio with Web Audio API
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Authorization, Content-Type');

  if (req.headers.range) {
    const range = req.headers.range;
    const parts = range.replace(/bytes=/, "").split("-");
    const partialStart = parts[0];
    const partialEnd = parts[1];

    const start = parseInt(partialStart, 10);
    const end = partialEnd ? parseInt(partialEnd, 10) : total - 1;
    const chunkSize = (end - start) + 1;

    const readStream = fs.createReadStream(song.file_path, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize.toString(),
      'Content-Type': mime.lookup(song.file_path) || 'audio/mpeg',
      'Cache-Control': 'public, max-age=3600'
    });

    readStream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total.toString(),
      'Content-Type': mime.lookup(song.file_path) || 'audio/mpeg',
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes'
    });

    fs.createReadStream(song.file_path).pipe(res);
  }
}));

export default router;
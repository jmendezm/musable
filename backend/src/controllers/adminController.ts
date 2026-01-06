import { Request, Response } from 'express';
import Joi from 'joi';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import sharp from 'sharp';
import UserModel from '../models/User';
import InviteModel from '../models/Invite';
import ListenHistoryModel from '../models/ListenHistory';
import SongModel from '../models/Song';
import ArtistModel from '../models/Artist';
import AlbumModel from '../models/Album';
import SettingsModel from '../models/Settings';
import LibraryPathScanReportModel from '../models/LibraryPathScanReport';
import getScannerWorkerService from '../services/scannerWorkerService';
import { Database } from '../config/database';
import { RoomModel } from '../models/Room';

// Get the singleton instance (lazy initialization)
const scannerWorkerService = getScannerWorkerService();

import { AuthRequest } from '../middleware/auth';
import { AppError, asyncHandler } from '../middleware/errorHandler';

const createInviteSchema = Joi.object({
  expiresInHours: Joi.number().integer().min(1).max(8760).default(24) // 1 hour to 1 year
});

const updateUserSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(50),
  email: Joi.string().email(),
  is_admin: Joi.boolean()
});

const addLibraryPathSchema = Joi.object({
  path: Joi.string().required()
});

const updateLibraryPathSchema = Joi.object({
  path: Joi.string(),
  is_active: Joi.boolean()
});

export const getDashboardStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const libraryStats = await scannerWorkerService.getLibraryStats();
  const listeningStats = await ListenHistoryModel.getListeningStats();
  
  const userCount = await UserModel.getAllUsers().then(users => users.length);
  const adminCount = await UserModel.getAdminCount();
  const activeInvites = await InviteModel.getActiveInviteCount();
  const usedInvites = await InviteModel.getUsedInviteCount();

  const recentActivity = await ListenHistoryModel.getAllHistory(10);
  const listeningTrends = await ListenHistoryModel.getListeningTrends();
  const mostPlayedSongs = await ListenHistoryModel.getMostPlayedSongs(undefined, 10);

  // Get monthly trends for dashboard cards
  const monthlyTrends = await ListenHistoryModel.getMonthlyTrends();
  const usersMonthlyTrend = await ListenHistoryModel.getUsersMonthlyTrend();
  const songsMonthlyTrend = await ListenHistoryModel.getSongsMonthlyTrend();

  res.json({
    success: true,
    data: {
      library: libraryStats,
      listening: listeningStats,
      users: {
        total: userCount,
        admins: adminCount
      },
      invites: {
        active: activeInvites,
        used: usedInvites
      },
      trends: {
        users: usersMonthlyTrend,
        songs: songsMonthlyTrend,
        plays: monthlyTrends.total_plays,
        listeningTime: monthlyTrends.total_listening_time
      },
      recentActivity,
      listeningTrends,
      mostPlayedSongs
    }
  });
});

export const getAllUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const users = await UserModel.getAllUsers();

  res.json({
    success: true,
    data: { users }
  });
});

export const updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { error } = updateUserSchema.validate(req.body);
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }

  const { id } = req.params;
  const userId = parseInt(id);
  const currentUserId = req.user!.id;

  if (userId === currentUserId && req.body.is_admin === false) {
    throw new AppError('You cannot remove your own admin privileges', 400);
  }

  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (req.body.username && req.body.username !== user.username) {
    const existingUser = await UserModel.findByUsername(req.body.username);
    if (existingUser && existingUser.id !== userId) {
      throw new AppError('Username already taken', 400);
    }
  }

  if (req.body.email && req.body.email !== user.email) {
    const existingUser = await UserModel.findByEmail(req.body.email);
    if (existingUser && existingUser.id !== userId) {
      throw new AppError('Email already taken', 400);
    }
  }

  if (typeof req.body.is_admin === 'boolean') {
    if (req.body.is_admin) {
      await UserModel.makeAdmin(userId);
    } else {
      const adminCount = await UserModel.getAdminCount();
      if (adminCount <= 1) {
        throw new AppError('Cannot remove the last admin user', 400);
      }
      await UserModel.removeAdmin(userId);
    }
  }

  const updatedUser = await UserModel.findById(userId);

  res.json({
    success: true,
    data: { user: updatedUser }
  });
});

export const deleteUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = parseInt(id);
  const currentUserId = req.user!.id;

  if (userId === currentUserId) {
    throw new AppError('You cannot delete your own account', 400);
  }

  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.is_admin) {
    const adminCount = await UserModel.getAdminCount();
    if (adminCount <= 1) {
      throw new AppError('Cannot delete the last admin user', 400);
    }
  }

  await UserModel.deleteUser(userId);

  res.json({
    success: true,
    data: { message: 'User deleted successfully' }
  });
});

export const createInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { error } = createInviteSchema.validate(req.body);
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }

  const { expiresInHours } = req.body;
  const createdBy = req.user!.id;

  const invite = await InviteModel.create({
    created_by: createdBy,
    expires_in_hours: expiresInHours
  });

  res.status(201).json({
    success: true,
    data: { invite }
  });
});

export const getAllInvites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const invites = await InviteModel.getAllInvites();

  res.json({
    success: true,
    data: { invites }
  });
});

export const revokeInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const inviteId = parseInt(id);

  const invite = await InviteModel.findById(inviteId);
  if (!invite) {
    throw new AppError('Invite not found', 404);
  }

  await InviteModel.revokeInvite(inviteId);

  res.json({
    success: true,
    data: { message: 'Invite revoked successfully' }
  });
});

export const getAllHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { limit = 100, offset = 0, user } = req.query;

  let history;
  
  if (user) {
    const userId = parseInt(user as string);
    history = await ListenHistoryModel.getUserHistory(userId, parseInt(limit as string), parseInt(offset as string));
  } else {
    history = await ListenHistoryModel.getAllHistory(parseInt(limit as string), parseInt(offset as string));
  }

  res.json({
    success: true,
    data: { history }
  });
});

export const getListeningStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { user } = req.query;
  
  let stats;
  if (user) {
    const userId = parseInt(user as string);
    stats = await ListenHistoryModel.getListeningStats(userId);
  } else {
    stats = await ListenHistoryModel.getListeningStats();
  }

  const trends = await ListenHistoryModel.getListeningTrends(user ? parseInt(user as string) : undefined);
  const mostPlayed = await ListenHistoryModel.getMostPlayedSongs(user ? parseInt(user as string) : undefined);

  res.json({
    success: true,
    data: {
      stats,
      trends,
      mostPlayed
    }
  });
});

export const deleteSong = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { deleteFile } = req.query;
  const songId = parseInt(id);

  const song = await SongModel.findById(songId);
  if (!song) {
    throw new AppError('Song not found', 404);
  }

  // Delete the file from disk if requested
  if (deleteFile === 'true' && song.file_path) {
    const fs = await import('fs');
    const path = await import('path');

    try {
      if (fs.existsSync(song.file_path)) {
        fs.unlinkSync(song.file_path);
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      // Continue with database deletion even if file deletion fails
    }
  }

  await SongModel.deleteSong(songId);

  res.json({
    success: true,
    data: {
      message: deleteFile === 'true'
        ? 'Song and file deleted successfully'
        : 'Song deleted successfully'
    }
  });
});

export const updateSong = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const songId = parseInt(id);

  const song = await SongModel.findById(songId);
  if (!song) {
    throw new AppError('Song not found', 404);
  }

  // Handle artist_name to artist_id conversion via junction table
  let updateData = { ...req.body };
  let artworkUrl: string | null = undefined;
  let artistId: number | null = null;

  if (updateData.artist_name) {
    const artistName = updateData.artist_name.trim();
    let artist = await ArtistModel.findByName(artistName);

    if (!artist) {
      artist = await ArtistModel.create(artistName);
    }

    artistId = artist.id;
    delete updateData.artist_name;
  }

  // Handle album_title to album_id conversion (consolidates by title only)
  if (updateData.album_title) {
    const albumTitle = updateData.album_title.trim();

    // Find album by title only (consolidates albums with same name)
    let album = await AlbumModel.findByTitle(albumTitle);

    if (!album) {
      // Create album
      album = await AlbumModel.create({
        title: albumTitle
      });
    }

    updateData.album_id = album.id;
    delete updateData.album_title;
  }

  // Handle artwork - artwork belongs to album, not song
  if (updateData.artwork !== undefined) {
    artworkUrl = updateData.artwork;
    delete updateData.artwork;
  }

  // Remove any other fields that don't exist in the songs table
  delete updateData.artwork_path;
  delete updateData.artist_name;
  delete updateData.album_title;

  // Update the song
  const updatedSong = await SongModel.update(songId, updateData);

  // Update artist associations via junction table
  if (artistId) {
    await SongModel.setArtists(songId, [artistId]);
  }

  // If artwork was provided, download and save it, then update the album
  if (artworkUrl !== undefined && updatedSong.album_id) {
    const album = await AlbumModel.findById(updatedSong.album_id);
    if (album) {
      if (artworkUrl === null || artworkUrl === '') {
        // Remove artwork
        await AlbumModel.update(album.id, { artwork_path: null });
      } else if (artworkUrl.startsWith('data:')) {
        // It's a base64 data URL, save it
        const artworkPath = await saveArtworkFromBase64(album.id, artworkUrl);
        if (artworkPath) {
          await AlbumModel.update(album.id, { artwork_path: artworkPath });
        }
      } else if (artworkUrl.startsWith('http')) {
        // It's a URL, download and save it
        const artworkPath = await saveArtworkFromUrl(album.id, artworkUrl);
        if (artworkPath) {
          await AlbumModel.update(album.id, { artwork_path: artworkPath });
        }
      }
    }
  }

  // Fetch the updated song with details
  const songWithDetails = await SongModel.findWithDetails(songId);

  res.json({
    success: true,
    data: songWithDetails
  });
});

async function saveArtworkFromBase64(albumId: number, dataUrl: string): Promise<string | null> {
  try {
    // Extract the base64 data
    const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      console.error('Invalid data URL format');
      return null;
    }

    const extension = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const artworkDir = path.join(process.cwd(), 'uploads', 'artwork');
    if (!fs.existsSync(artworkDir)) {
      fs.mkdirSync(artworkDir, { recursive: true });
    }

    const filename = `album_${albumId}.jpg`;
    const artworkPath = path.join(artworkDir, filename);

    await sharp(buffer)
      .jpeg({ quality: 85 })
      .resize(500, 500, { fit: 'cover' })
      .toFile(artworkPath);

    return `/uploads/artwork/${filename}`;
  } catch (error: any) {
    console.error('Failed to save artwork from base64:', error);
    return null;
  }
}

async function saveArtworkFromUrl(albumId: number, imageUrl: string): Promise<string | null> {
  try {
    // Download image
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000
    });

    const buffer = Buffer.from(response.data);

    const artworkDir = path.join(process.cwd(), 'uploads', 'artwork');
    if (!fs.existsSync(artworkDir)) {
      fs.mkdirSync(artworkDir, { recursive: true });
    }

    const filename = `album_${albumId}.jpg`;
    const artworkPath = path.join(artworkDir, filename);

    await sharp(buffer)
      .jpeg({ quality: 85 })
      .resize(500, 500, { fit: 'cover' })
      .toFile(artworkPath);

    return `/uploads/artwork/${filename}`;
  } catch (error: any) {
    console.error('Failed to save artwork from URL:', error);
    return null;
  }
}

export const cleanupExpiredInvites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const deletedCount = await InviteModel.cleanupExpiredInvites();

  res.json({
    success: true,
    data: { 
      message: `${deletedCount} expired invites cleaned up`
    }
  });
});

export const getUserActivity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = parseInt(id);

  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const history = await ListenHistoryModel.getUserHistory(userId, 50);
  const stats = await ListenHistoryModel.getListeningStats(userId);
  const topArtists = await ListenHistoryModel.getUserTopArtists(userId);
  const topAlbums = await ListenHistoryModel.getUserTopAlbums(userId);
  const mostPlayed = await ListenHistoryModel.getMostPlayedSongs(userId);

  res.json({
    success: true,
    data: {
      user,
      history,
      stats,
      topArtists,
      topAlbums,
      mostPlayed
    }
  });
});

export const getLibraryPaths = asyncHandler(async (req: AuthRequest, res: Response) => {
  const paths = await SettingsModel.getLibraryPaths();
  
  res.json({
    success: true,
    data: { paths }
  });
});

export const addLibraryPath = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { error, value } = addLibraryPathSchema.validate(req.body);
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }

  const { path } = value;

  try {
    const newPath = await SettingsModel.addLibraryPath(path);

    // Refresh the file watcher with updated paths
    await scannerWorkerService.refreshFileWatcher();

    res.status(201).json({
      success: true,
      data: { path: newPath }
    });
  } catch (err: any) {
    if (err.message.includes('UNIQUE constraint failed')) {
      throw new AppError('Library path already exists', 409);
    }
    throw err;
  }
});

export const updateLibraryPath = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const pathId = parseInt(id);

  const { error, value } = updateLibraryPathSchema.validate(req.body);
  if (error) {
    throw new AppError(error.details[0].message, 400);
  }

  const updatedPath = await SettingsModel.updateLibraryPath(pathId, value);

  // Refresh the file watcher with updated paths
  await scannerWorkerService.refreshFileWatcher();

  res.json({
    success: true,
    data: { path: updatedPath }
  });
});

export const deleteLibraryPath = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const pathId = parseInt(id);

  await SettingsModel.deleteLibraryPath(pathId);

  // Refresh the file watcher with updated paths
  await scannerWorkerService.refreshFileWatcher();

  res.json({
    success: true,
    message: 'Library path deleted successfully'
  });
});

export const validatePath = asyncHandler(async (req: Request, res: Response) => {
  const { path: searchPath } = req.query;

  if (searchPath === undefined || typeof searchPath !== 'string') {
    throw new AppError('Path parameter is required', 400);
  }

  const platform = process.platform;
  const isWindows = platform === 'win32';

  // Empty path or just "/" - return root directories or drive letters
  if (!searchPath.trim() || searchPath === '/') {
    let directories: string[] = [];

    if (isWindows) {
      // List all available drive letters on Windows
      for (let i = 65; i <= 90; i++) {
        const driveLetter = String.fromCharCode(i);
        const drivePath = driveLetter + ':\\';
        if (fs.existsSync(drivePath)) {
          directories.push(drivePath);
        }
      }
    } else {
      // On Linux/Unix, list root directories
      try {
        const entries = fs.readdirSync('/', { withFileTypes: true });
        directories = entries
          .filter(dirent => dirent.isDirectory())
          .map(dirent => '/' + dirent.name)
          .sort()
          .slice(0, 50);
      } catch (err) {
        console.error('Error listing root:', err);
      }
    }

    return res.json({
      success: true,
      data: {
        valid: false,
        path: searchPath || '',
        expandedPath: searchPath || '/',
        exists: false,
        directories,
        isRoot: true
      }
    });
  }

  // Expand home directory if present
  let expandedPath = searchPath;
  if (searchPath.startsWith('~/')) {
    const os = require('os');
    const homeDir = os.homedir();
    expandedPath = path.join(homeDir, searchPath.substring(2));
  } else if (searchPath === '~') {
    const os = require('os');
    expandedPath = os.homedir();
  }

  // Resolve relative paths
  if (searchPath.startsWith('./') || searchPath.startsWith('../')) {
    expandedPath = path.resolve(expandedPath);
  }

  // Check if path exists
  const exists = fs.existsSync(expandedPath);

  if (!exists) {
    // For Windows drive letters, if it doesn't exist, still try to list available drives
    if (isWindows && /^[A-Za-z]:$/.test(searchPath)) {
      try {
        // On Windows, list available drive letters
        const drives: string[] = [];
        for (let i = 65; i <= 90; i++) {
          const driveLetter = String.fromCharCode(i);
          const drivePath = driveLetter + ':\\';
          if (fs.existsSync(drivePath)) {
            drives.push(drivePath);
          }
        }
        return res.json({
          success: true,
          data: {
            valid: false,
            path: searchPath,
            expandedPath,
            exists: false,
            directories: drives
          }
        });
      } catch (err) {
        console.error('Error listing drives:', err);
      }
    }

    // If path doesn't exist, try to get parent directory and search for partial matches
    let parentDir = path.dirname(expandedPath);
    const searchPrefix = path.basename(expandedPath);

    // If parent directory exists, list and filter directories
    if (parentDir && fs.existsSync(parentDir)) {
      try {
        const entries = fs.readdirSync(parentDir, { withFileTypes: true });
        const directories = entries
          .filter(dirent => {
            // Only include directories that match the search prefix
            if (!dirent.isDirectory()) return false;
            if (!searchPrefix) return true;

            const name = dirent.name.toLowerCase();
            const prefix = searchPrefix.toLowerCase();

            // Match if directory starts with prefix or contains it
            return name.startsWith(prefix) || name.includes(prefix);
          })
          .map(dirent => {
            const fullPath = path.join(parentDir, dirent.name);
            // Return in the same format as input (relative or absolute)
            return searchPath.startsWith('./') || searchPath.startsWith('../')
              ? path.relative(process.cwd(), fullPath)
              : fullPath;
          })
          .sort()
          .slice(0, 50); // Limit to 50 results for performance

        return res.json({
          success: true,
          data: {
            valid: false,
            path: searchPath,
            expandedPath,
            exists: false,
            directories,
            partialMatch: true
          }
        });
      } catch (err) {
        console.error('Error listing parent directory:', err);
      }
    }

    return res.json({
      success: true,
      data: {
        valid: false,
        path: searchPath,
        expandedPath,
        exists: false,
        directories: []
      }
    });
  }

  // Check if it's a directory
  const stats = fs.statSync(expandedPath);
  const isDirectory = stats.isDirectory();

  let directories: string[] = [];

  if (isDirectory) {
    try {
      // List directories in the path
      const entries = fs.readdirSync(expandedPath, { withFileTypes: true });
      directories = entries
        .filter(dirent => dirent.isDirectory())
        .map(dirent => {
          const fullPath = path.join(expandedPath, dirent.name);
          // Return relative path if input was relative, absolute otherwise
          return searchPath.startsWith('./') || searchPath.startsWith('../')
            ? path.relative(process.cwd(), fullPath)
            : fullPath;
        })
        .sort()
        .slice(0, 50); // Limit to 50 results
    } catch (err) {
      // Permission denied or other error - just return empty directories
      console.error('Error listing directories:', err);
    }
  }

  return res.json({
    success: true,
    data: {
      valid: true,
      path: searchPath,
      expandedPath,
      exists: true,
      isDirectory,
      directories,
      readable: true
    }
  });
});

export const getSystemSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { key } = req.params;
  
  const value = await SettingsModel.getSetting(key);
  
  res.json({
    success: true,
    data: { key, value }
  });
});

// Library path scan reports
export const getPathScanReports = asyncHandler(async (req: Request, res: Response) => {
  const { pathId } = req.params;
  const libraryPathId = parseInt(pathId);

  const reports = await LibraryPathScanReportModel.findByLibraryPathId(libraryPathId, 50);

  res.json({
    success: true,
    data: { reports }
  });
});

export const getPathScanReportDetail = asyncHandler(async (req: Request, res: Response) => {
  const { reportId } = req.params;
  const scanReportId = parseInt(reportId);

  const report = await LibraryPathScanReportModel.findByIdWithErrors(scanReportId);

  if (!report) {
    throw new AppError('Scan report not found', 404);
  }

  res.json({
    success: true,
    data: { report }
  });
});

export const getLatestPathScanReport = asyncHandler(async (req: Request, res: Response) => {
  const { pathId } = req.params;
  const libraryPathId = parseInt(pathId);

  const report = await LibraryPathScanReportModel.getLatestByLibraryPathId(libraryPathId);

  res.json({
    success: true,
    data: { report }
  });
});

export const getAllPathScanReports = asyncHandler(async (req: Request, res: Response) => {
  const { limit = 100 } = req.query;

  // Get all reports across all paths with library path details
  const reports = await LibraryPathScanReportModel.db.query(`
    SELECT
      lpsr.*,
      lp.path as library_path
    FROM library_path_scan_reports lpsr
    LEFT JOIN library_paths lp ON lpsr.library_path_id = lp.id
    ORDER BY lpsr.started_at DESC
    LIMIT ?
  `, [parseInt(limit as string)]);

  res.json({
    success: true,
    data: { reports }
  });
});

export const deleteScanReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { reportId } = req.params;

  if (!req.user?.is_admin) {
    throw new AppError('Admin access required', 403);
  }

  const scanReportId = parseInt(reportId);

  // Check if report exists
  const report = await LibraryPathScanReportModel.findById(scanReportId);
  if (!report) {
    throw new AppError('Scan report not found', 404);
  }

  // Delete the report (this will also delete associated errors)
  await LibraryPathScanReportModel.delete(scanReportId);

  res.json({
    success: true,
    data: { message: 'Scan report deleted successfully' }
  });
});

export const setSystemSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { key } = req.params;
  const { value } = req.body;
  
  if (value === undefined || value === null) {
    throw new AppError('Setting value is required', 400);
  }
  
  await SettingsModel.setSetting(key, String(value));
  
  res.json({
    success: true,
    data: { key, value: String(value) }
  });
});

export const getAllSystemSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Get all relevant system settings
  const publicSharingEnabled = await SettingsModel.getSetting('public_sharing_enabled') || 'false';
  
  const settings = {
    public_sharing_enabled: publicSharingEnabled === 'true'
  };
  
  res.json({
    success: true,
    data: { settings }
  });
});

// Multer configuration for admin profile picture uploads
const adminProfilePictureStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(process.cwd(), 'uploads', 'profile-pictures');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const userId = req.params.userId;
    const extension = path.extname(file.originalname);
    cb(null, `user-${userId}-${Date.now()}${extension}`);
  }
});

const adminProfilePictureFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new AppError('Only image files are allowed (jpeg, jpg, png, gif, webp)', 400));
  }
};

export const adminUploadProfilePicture = multer({
  storage: adminProfilePictureStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: adminProfilePictureFilter
});

export const updateUserProfilePicture = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  
  if (!req.file) {
    throw new AppError('No image file provided', 400);
  }

  const numericUserId = parseInt(userId, 10);
  if (isNaN(numericUserId)) {
    throw new AppError('Invalid user ID', 400);
  }

  // Check if user exists
  const user = await UserModel.findById(numericUserId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const profilePicturePath = `/uploads/profile-pictures/${req.file.filename}`;

  // Delete old profile picture if it exists
  if (user.profile_picture) {
    const oldPicturePath = path.join(process.cwd(), user.profile_picture);
    if (fs.existsSync(oldPicturePath)) {
      fs.unlinkSync(oldPicturePath);
    }
  }

  await UserModel.updateProfilePicture(numericUserId, profilePicturePath);

  // Get updated user data
  const updatedUser = await UserModel.findById(numericUserId);

  res.json({
    success: true,
    data: {
      message: 'User profile picture updated successfully',
      user: updatedUser
    }
  });
});

export const deleteUserProfilePicture = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;

  const numericUserId = parseInt(userId, 10);
  if (isNaN(numericUserId)) {
    throw new AppError('Invalid user ID', 400);
  }

  // Check if user exists
  const user = await UserModel.findById(numericUserId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Delete profile picture file if it exists
  if (user.profile_picture) {
    const oldPicturePath = path.join(process.cwd(), user.profile_picture);
    if (fs.existsSync(oldPicturePath)) {
      fs.unlinkSync(oldPicturePath);
    }
  }

  await UserModel.updateProfilePicture(numericUserId, null);

  // Get updated user data
  const updatedUser = await UserModel.findById(numericUserId);

  res.json({
    success: true,
    data: {
      message: 'User profile picture removed successfully',
      user: updatedUser
    }
  });
});

export const clearAllSongsAndRescan = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Check if a scan is currently running
  const scannerService = getScannerWorkerService();
  const isScanning = scannerService.isCurrentlyScanning();

  if (isScanning) {
    throw new AppError('A scan is already in progress. Please wait for it to complete.', 400);
  }

  // Delete all songs
  const deletedCount = await SongModel.deleteAllSongs();

  // Start a fresh scan of all library paths
  await scannerService.startScan();

  res.json({
    success: true,
    data: {
      message: `Deleted ${deletedCount} songs and started fresh scan`,
      deletedCount
    }
  });
});

export const resetAllUserData = asyncHandler(async (req: AuthRequest, res: Response) => {
  const currentUserId = req.user!.id;
  const isAdmin = req.user!.is_admin;

  if (!isAdmin) {
    throw new AppError('Only admins can reset user data', 403);
  }

  const db = Database.getInstance();

  try {
    await db.transaction(async (sqliteDb) => {
      // Delete all users except the current admin
      await db.run(
        'DELETE FROM users WHERE id != ? AND is_admin = 0',
        [currentUserId]
      );

      // Delete all playlists (they will be recreated by users)
      await db.run('DELETE FROM playlists');

      // Clear listen history
      await db.run('DELETE FROM listen_history');

      // Clear playlist follows
      await db.run('DELETE FROM playlist_follows');
    });

    res.json({
      success: true,
      data: {
        message: 'Successfully reset all user data',
        stats: {
          deletedUsers: 0,
          deletedPlaylists: 0,
          deletedHistory: 0,
          deletedFollows: 0
        }
      }
    });
  } catch (error) {
    throw new AppError('Failed to reset user data', 500);
  }
});

export const getCurrentlyPlaying = asyncHandler(async (req: AuthRequest, res: Response) => {
  const db = Database.getInstance();

  // Get songs played in the last 5 minutes (increased from 2)
  const recentPlays = await db.query(`
    SELECT
      lh.song_id,
      lh.user_id,
      lh.played_at,
      lh.duration_played,
      lh.completed,
      s.title as song_title,
      s.duration as song_duration,
      al.artwork_path,
      u.username,
      a.name as artist_name,
      al.title as album_title
    FROM listen_history lh
    JOIN songs s ON lh.song_id = s.id
    JOIN users u ON lh.user_id = u.id
    JOIN song_artists sa ON s.id = sa.song_id
    JOIN artists a ON sa.artist_id = a.id
    LEFT JOIN albums al ON s.album_id = al.id
    WHERE lh.played_at >= datetime('now', '-5 minutes')
    GROUP BY lh.id, s.id, u.id, al.id
    ORDER BY lh.played_at DESC
  `);

  console.log('Recent plays found:', recentPlays.length);

  // Group by user and get the most recent play for each user
  const userLatestPlays = new Map();
  recentPlays.forEach((play: any) => {
    if (!userLatestPlays.has(play.user_id)) {
      userLatestPlays.set(play.user_id, play);
    }
  });

  // Import userSockets from websocket
  const { userSockets } = require('../websocket');

  // Convert to array and add online status
  const currentlyPlaying = Array.from(userLatestPlays.values()).map((play: any) => {
    const isOnline = userSockets.has(play.user_id);
    return {
      ...play,
      is_online: isOnline,
      // Calculate progress (if we have duration_played and song_duration)
      progress: play.duration_played && play.song_duration
        ? (play.duration_played / play.song_duration) * 100
        : 0
    };
  });

  console.log('Currently playing:', currentlyPlaying.length);

  res.json({
    success: true,
    data: { currentlyPlaying }
  });
});

export const getActiveRooms = asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    // Get all rooms from database
    const db = Database.getInstance();
    const rooms = await db.query(`
      SELECT
        r.id,
        r.code,
        r.name,
        r.current_song_id,
        r.current_position,
        r.is_playing,
        r.created_at,
        COUNT(rp.user_id) as participant_count
      FROM listening_rooms r
      LEFT JOIN room_participants rp ON r.id = rp.room_id
      GROUP BY r.id
      HAVING participant_count > 0
      ORDER BY participant_count DESC
    `);

    // Get detailed participant info for each room
    const roomsWithParticipants = await Promise.all(
      rooms.map(async (room: any) => {
        const participants = await RoomModel.getParticipants(room.id);

        // Get song info if playing
        let songInfo = null;
        if (room.current_song_id) {
          const song = await db.query(`
            SELECT
              s.id,
              s.title,
              s.duration,
              GROUP_CONCAT(a.name, ', ') as artist_name,
              al.artwork_path
            FROM songs s
            JOIN song_artists sa ON s.id = sa.song_id
            JOIN artists a ON sa.artist_id = a.id
            LEFT JOIN albums al ON s.album_id = al.id
            WHERE s.id = ?
            GROUP BY s.id, al.id
          `, [room.current_song_id]);

          if (song.length > 0) {
            songInfo = song[0];
          }
        }

        return {
          id: room.id,
          code: room.code,
          name: room.name,
          current_song_id: room.current_song_id,
          current_position: room.current_position,
          is_playing: room.is_playing === 1,
          participant_count: room.participant_count,
          participants: participants.map((p: any) => ({
            user_id: p.user_id,
            username: p.username,
            role: p.role
          })),
          song_info: songInfo
        };
      })
    );

    res.json({
      success: true,
      data: { activeRooms: roomsWithParticipants }
    });
  } catch (error) {
    console.error('Error fetching active rooms:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch active rooms' }
    });
  }
});

export const getDuplicateSongs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const allSongs = await SongModel.getAllWithDetails();

  // Group songs by title and artist
  const duplicateGroups: { [key: string]: SongWithDetails[] } = {};

  for (const song of allSongs) {
    // Normalize title and artist name for comparison
    const normalizedTitle = song.title.toLowerCase().trim();
    const normalizedArtist = song.artist_name?.toLowerCase().trim() || 'unknown';

    // Create a composite key for grouping
    const key = `${normalizedTitle}|${normalizedArtist}`;

    if (!duplicateGroups[key]) {
      duplicateGroups[key] = [];
    }

    duplicateGroups[key].push(song);
  }

  // Filter only groups with duplicates
  const duplicates = Object.values(duplicateGroups)
    .filter(group => group.length > 1)
    .sort((a, b) => b.length - a.length); // Sort by number of duplicates

  res.json({
    success: true,
    data: {
      duplicates,
      total: duplicates.length,
      totalDuplicateSongs: duplicates.reduce((sum, group) => sum + group.length, 0)
    }
  });
});


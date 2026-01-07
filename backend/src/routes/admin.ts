import { Router } from 'express';
import {
  getDashboardStats,
  getAllUsers,
  updateUser,
  deleteUser,
  createInvite,
  getAllInvites,
  revokeInvite,
  getAllHistory,
  getListeningStats,
  updateSong,
  deleteSong,
  cleanupExpiredInvites,
  cleanupEmptyArtists,
  getUserActivity,
  getLibraryPaths,
  addLibraryPath,
  updateLibraryPath,
  deleteLibraryPath,
  validatePath,
  getSystemSetting,
  setSystemSetting,
  getAllSystemSettings,
  getPathScanReports,
  getPathScanReportDetail,
  getLatestPathScanReport,
  getAllPathScanReports,
  deleteScanReport,
  adminUploadProfilePicture,
  updateUserProfilePicture,
  deleteUserProfilePicture,
  clearAllSongsAndRescan,
  resetAllUserData,
  getCurrentlyPlaying,
  getActiveRooms,
  getDuplicateSongs,
  splitSongArtists,
  batchSplitSongArtists,
  getAllArtists,
  searchArtistImages,
  saveArtistImage,
  cropArtistImage,
  uploadArtistImage as uploadArtistImageHandler,
  getAllIgnoreFilters,
  createIgnoreFilter,
  updateIgnoreFilter,
  deleteIgnoreFilter,
  getLogs,
  clearLogs,
  setLogSettings,
  getLogSettings,
  getAllAlbums,
  searchAlbumImages,
  saveAlbumImage,
  cropAlbumImage,
  uploadAlbumImage as uploadAlbumImageHandler,
  updateAlbum
} from '../controllers/adminController';
import { getAllSongs } from '../controllers/libraryController';
import multer from 'multer';
import { authenticateToken, requireAdmin } from '../middleware/auth';

// Configure multer for artist image uploads
const uploadArtistImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Configure multer for album image uploads
const uploadAlbumImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const router = Router();

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/dashboard', getDashboardStats);
router.get('/currently-playing', getCurrentlyPlaying);
router.get('/active-rooms', getActiveRooms);

router.get('/users', getAllUsers);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.get('/users/:id/activity', getUserActivity);

router.post('/invites', createInvite);
router.get('/invites', getAllInvites);
router.delete('/invites/:id', revokeInvite);
router.post('/invites/cleanup', cleanupExpiredInvites);

// Maintenance jobs
router.post('/jobs/cleanup-empty-artists', cleanupEmptyArtists);

// Logs routes
router.get('/logs', getLogs);
router.delete('/logs', clearLogs);
router.get('/logs/settings', getLogSettings);
router.put('/logs/settings', setLogSettings);

router.get('/history', getAllHistory);
router.get('/stats/listening', getListeningStats);

router.put('/songs/:id', updateSong);
router.delete('/songs/:id', deleteSong);
router.get('/songs', getAllSongs);
router.get('/songs/duplicates', getDuplicateSongs);
router.post('/songs/:id/split-artists', splitSongArtists);
router.post('/songs/batch-split-artists', batchSplitSongArtists);

// Artist image management routes
router.get('/artists', getAllArtists);
router.get('/artists/search-images', searchArtistImages);
router.post('/artists/:artistId/image', saveArtistImage);
router.post('/artists/:artistId/crop', cropArtistImage);
router.post('/artists/:artistId/upload', uploadArtistImage.single('image'), uploadArtistImageHandler);

// Album image management routes
router.get('/albums', getAllAlbums);
router.get('/albums/search-images', searchAlbumImages);
router.post('/albums/:id/image', saveAlbumImage);
router.post('/albums/:id/crop', cropAlbumImage);
router.post('/albums/:id/upload', uploadAlbumImage.single('image'), uploadAlbumImageHandler);
router.put('/albums/:id', updateAlbum);

router.get('/library/paths', getLibraryPaths);
router.post('/library/paths', addLibraryPath);
router.put('/library/paths/:id', updateLibraryPath);
router.delete('/library/paths/:id', deleteLibraryPath);
router.get('/library/validate-path', validatePath);
router.post('/library/rescan-all', clearAllSongsAndRescan);

// Data reset
router.post('/reset-all-data', resetAllUserData);

// Library path scan reports
router.get('/library/paths/:pathId/scans', getPathScanReports);
router.get('/library/paths/:pathId/scans/latest', getLatestPathScanReport);
router.get('/library/paths/:pathId/scans/:reportId', getPathScanReportDetail);
router.get('/library/scans', getAllPathScanReports);
router.delete('/library/scans/:reportId', deleteScanReport);

router.get('/settings', getAllSystemSettings);
router.get('/settings/:key', getSystemSetting);
router.put('/settings/:key', setSystemSetting);

// User profile picture management routes
router.put('/users/:userId/profile-picture', adminUploadProfilePicture.single('profilePicture'), updateUserProfilePicture);
router.delete('/users/:userId/profile-picture', deleteUserProfilePicture);

// Artist split ignore filters routes
router.get('/artist-split-ignore-filters', getAllIgnoreFilters);
router.post('/artist-split-ignore-filters', createIgnoreFilter);
router.put('/artist-split-ignore-filters/:id', updateIgnoreFilter);
router.delete('/artist-split-ignore-filters/:id', deleteIgnoreFilter);

export default router;
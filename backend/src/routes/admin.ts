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
  getAllArtists,
  searchArtistImages,
  saveArtistImage,
  cropArtistImage,
  uploadArtistImage as uploadArtistImageHandler
} from '../controllers/adminController';
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

router.get('/history', getAllHistory);
router.get('/stats/listening', getListeningStats);

router.put('/songs/:id', updateSong);
router.delete('/songs/:id', deleteSong);
router.get('/songs/duplicates', getDuplicateSongs);

// Artist image management routes
router.get('/artists', getAllArtists);
router.get('/artists/search-images', searchArtistImages);
router.post('/artists/:artistId/image', saveArtistImage);
router.post('/artists/:artistId/crop', cropArtistImage);
router.post('/artists/:artistId/upload', uploadArtistImage.single('image'), uploadArtistImageHandler);

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

export default router;
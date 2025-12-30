import { Router } from 'express';
import updateService from '../services/updateService';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

// Get current version and check for updates
router.get('/check', authenticateToken, async (req: any, res): Promise<void> => {
  try {
    const updateInfo = await updateService.checkForUpdates();

    if (!updateInfo) {
      res.status(500).json({
        success: false,
        error: { message: 'Failed to check for updates' }
      });
      return;
    }

    res.json({
      success: true,
      data: updateInfo
    });
  } catch (error) {
    console.error('Error checking for updates:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to check for updates' }
    });
  }
});

// Get all releases (for changelog)
router.get('/releases', authenticateToken, async (req: any, res): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const releases = await updateService.getAllReleases(limit);

    res.json({
      success: true,
      data: {
        releases,
        count: releases.length
      }
    });
  } catch (error) {
    console.error('Error fetching releases:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch releases' }
    });
  }
});

export default router;

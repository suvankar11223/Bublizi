import express from 'express';
import { presenceService } from '../services/presenceService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Check if user is online
 * GET /api/presence/:userId
 */
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const userId = Array.isArray(req.params.userId) 
      ? req.params.userId[0] 
      : req.params.userId;
    const isOnline = await presenceService.isOnline(userId);
    
    res.json({
      success: true,
      userId,
      isOnline,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      msg: 'Failed to check presence',
      error: error.message,
    });
  }
});

/**
 * Get presence statistics (admin only)
 * GET /api/presence/stats
 */
router.get('/admin/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await presenceService.getStats();
    
    res.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      msg: 'Failed to get presence stats',
      error: error.message,
    });
  }
});

export default router;

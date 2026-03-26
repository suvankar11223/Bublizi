import { Router } from 'express';
import { syncContacts, getCachedContacts, getSyncStatus } from '../controller/contactSync.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiter for contact sync (10 requests per 15 minutes)
const contactSyncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many contact sync requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// All routes require authentication
router.use(authenticateToken);

// Sync contacts (optimized with queue)
router.post('/sync', contactSyncLimiter, syncContacts);

// Get cached contacts (instant)
router.get('/cached', getCachedContacts);

// Get sync status
router.get('/sync-status', getSyncStatus);

export default router;

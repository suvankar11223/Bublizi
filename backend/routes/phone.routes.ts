import { Router } from 'express';
import { verifyPhoneNumber, getPhoneStatus } from '../controller/phone.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { phoneOTPRateLimit } from '../middleware/phoneRateLimit.js';

const router = Router();

// All phone routes require authentication
router.use(authenticateToken);

// Verify Firebase phone auth token (with rate limiting)
router.post('/verify', phoneOTPRateLimit, verifyPhoneNumber);

// Check if user has verified phone
router.get('/status', getPhoneStatus);

export default router;

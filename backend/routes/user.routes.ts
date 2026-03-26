import express from 'express';
import { updateProfile, getProfile, ensureStreamUsers, getAllUsers, getContacts, getMessages, createConversationAPI, getConversations } from '../controller/user.controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireSelfOnly, requireConversationAccess } from '../middleware/ownership.js';
import User from '../modals/userModal.js';
// ─── NEW IMPORT ───────────────────────────────────────────────────────
import { findUsersByPhones } from '../controller/findUsersByPhones.controller.js';
import { validateObjectId, validatePhone } from '../middleware/validation.js';

const router = express.Router();

// ── Existing routes with IDOR protection ──────────────────────────────
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);
router.post('/ensure-stream-users', authenticateToken, ensureStreamUsers);
router.get('/all', authenticateToken, getAllUsers);
router.get('/contacts', authenticateToken, getContacts);
router.get('/conversations', authenticateToken, getConversations);
// IDOR Protection: Verify user is participant before fetching messages
router.get('/messages/:conversationId', authenticateToken, validateObjectId('conversationId'), requireConversationAccess, getMessages);
router.post('/conversations', authenticateToken, createConversationAPI);

// ── NEW ROUTE: find app users by phone numbers ─────────────────────────
// Called by useContacts hook on the frontend after fetching device contacts
router.post('/find-by-phones', authenticateToken, findUsersByPhones);

// ── Debug route (keep for testing) ───────────────────────────────────
router.get('/debug-all-users', async (_req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.status(200).json({
      success: true,
      count: users.length,
      data: users.map((u) => ({ _id: u._id, name: u.name, email: u.email, phoneNumber: u.phoneNumber })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, msg: error.message });
  }
});

export default router;

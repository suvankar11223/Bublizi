import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireConversationAccess } from '../middleware/ownership.js';
import Conversation from '../modals/Conversation.js';
import Message from '../modals/Message.js';

const router = express.Router();

// Pin conversation - IDOR Protection: Verify user is participant
router.post('/:conversationId/pin', authenticateToken, requireConversationAccess, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = (req as any).user.userId;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, msg: 'Conversation not found' });
    }

    // Toggle pin
    const pinnedBy = conversation.pinnedBy || new Map();
    if (pinnedBy.has(userId)) {
      pinnedBy.delete(userId);
    } else {
      pinnedBy.set(userId, new Date());
    }
    conversation.pinnedBy = pinnedBy;
    await conversation.save();

    res.json({ success: true, data: { isPinned: pinnedBy.has(userId) } });
  } catch (error: any) {
    res.status(500).json({ success: false, msg: error.message });
  }
});

// Mute conversation - IDOR Protection: Verify user is participant
router.post('/:conversationId/mute', authenticateToken, requireConversationAccess, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = (req as any).user.userId;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, msg: 'Conversation not found' });
    }

    // Toggle mute
    const mutedBy = conversation.mutedBy || new Map();
    if (mutedBy.has(userId)) {
      mutedBy.delete(userId);
    } else {
      mutedBy.set(userId, new Date());
    }
    conversation.mutedBy = mutedBy;
    await conversation.save();

    res.json({ success: true, data: { isMuted: mutedBy.has(userId) } });
  } catch (error: any) {
    res.status(500).json({ success: false, msg: error.message });
  }
});

// Archive conversation - IDOR Protection: Verify user is participant
router.post('/:conversationId/archive', authenticateToken, requireConversationAccess, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = (req as any).user.userId;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, msg: 'Conversation not found' });
    }

    // Toggle archive
    const archivedBy = conversation.archivedBy || new Map();
    if (archivedBy.has(userId)) {
      archivedBy.delete(userId);
    } else {
      archivedBy.set(userId, new Date());
    }
    conversation.archivedBy = archivedBy;
    await conversation.save();

    res.json({ success: true, data: { isArchived: archivedBy.has(userId) } });
  } catch (error: any) {
    res.status(500).json({ success: false, msg: error.message });
  }
});

// Delete conversation (soft delete - just archive for user) - IDOR Protection
router.delete('/:conversationId', authenticateToken, requireConversationAccess, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = (req as any).user.userId;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, msg: 'Conversation not found' });
    }

    // For direct chats, just archive it
    // For groups, remove user from participants if they want to leave
    if (conversation.type === 'group') {
      conversation.participants = conversation.participants.filter(
        (p: any) => p.toString() !== userId
      );
      
      // If no participants left, delete the conversation and all messages
      if (conversation.participants.length === 0) {
        await Message.deleteMany({ conversationId });
        await Conversation.findByIdAndDelete(conversationId);
        return res.json({ success: true, msg: 'Conversation deleted' });
      }
      
      await conversation.save();
    } else {
      // For direct chats, just archive
      const archivedBy = conversation.archivedBy || new Map();
      archivedBy.set(userId, new Date());
      conversation.archivedBy = archivedBy;
      await conversation.save();
    }

    res.json({ success: true, msg: 'Conversation removed' });
  } catch (error: any) {
    res.status(500).json({ success: false, msg: error.message });
  }
});

export default router;

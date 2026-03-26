import { Request, Response, NextFunction } from 'express';
import Conversation from '../modals/Conversation.js';
import Message from '../modals/Message.js';

// Extend Express Request type to include user
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

// IDOR Prevention: Ensure user has access to conversation
export const requireConversationAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        msg: 'Authentication required' 
      });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ 
        success: false, 
        msg: 'Conversation not found' 
      });
    }

    // Check if user is a participant
    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === userId
    );

    if (!isParticipant) {
      console.log(`[Security] IDOR attempt: User ${userId} tried to access conversation ${conversationId}`);
      return res.status(403).json({ 
        success: false, 
        msg: 'Access denied: You are not a participant in this conversation' 
      });
    }

    next();
  } catch (error) {
    console.error('[Ownership] Error checking conversation access:', error);
    return res.status(500).json({ 
      success: false, 
      msg: 'Error verifying access' 
    });
  }
};

// IDOR Prevention: Ensure user owns the message
export const requireMessageOwnership = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        msg: 'Authentication required' 
      });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ 
        success: false, 
        msg: 'Message not found' 
      });
    }

    if (message.senderId.toString() !== userId) {
      console.log(`[Security] IDOR attempt: User ${userId} tried to modify message ${messageId}`);
      return res.status(403).json({ 
        success: false, 
        msg: 'Access denied: You can only modify your own messages' 
      });
    }

    next();
  } catch (error) {
    console.error('[Ownership] Error checking message ownership:', error);
    return res.status(500).json({ 
      success: false, 
      msg: 'Error verifying ownership' 
    });
  }
};

// IDOR Prevention: Ensure user can only access their own profile
export const requireSelfOnly = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      return res.status(401).json({ 
        success: false, 
        msg: 'Authentication required' 
      });
    }

    if (userId !== currentUserId) {
      console.log(`[Security] IDOR attempt: User ${currentUserId} tried to access user ${userId}`);
      return res.status(403).json({ 
        success: false, 
        msg: 'Access denied: You can only access your own profile' 
      });
    }

    next();
  } catch (error) {
    console.error('[Ownership] Error checking self access:', error);
    return res.status(500).json({ 
      success: false, 
      msg: 'Error verifying access' 
    });
  }
};

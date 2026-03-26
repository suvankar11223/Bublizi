import { Socket } from 'socket.io';
import Conversation from '../modals/Conversation.js';
import Message from '../modals/Message.js';

/**
 * Socket IDOR Protection Middleware
 * Validates that users can only access their own data through socket events
 */

// Verify user is a participant in the conversation
export const verifyConversationAccess = async (
  socket: Socket,
  conversationId: string
): Promise<boolean> => {
  try {
    const userId = (socket as any).userId;
    
    if (!userId) {
      console.log('[SocketSecurity] No userId on socket');
      return false;
    }

    const conversation = await Conversation.findById(conversationId);
    
    if (!conversation) {
      console.log('[SocketSecurity] Conversation not found:', conversationId);
      return false;
    }

    const isParticipant = conversation.participants.some(
      (p: any) => p.toString() === userId
    );

    if (!isParticipant) {
      console.log(`[SocketSecurity] IDOR ATTEMPT: User ${userId} tried to access conversation ${conversationId}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[SocketSecurity] Error verifying conversation access:', error);
    return false;
  }
};

// Verify user owns the message
export const verifyMessageOwnership = async (
  socket: Socket,
  messageId: string
): Promise<boolean> => {
  try {
    const userId = (socket as any).userId;
    
    if (!userId) {
      console.log('[SocketSecurity] No userId on socket');
      return false;
    }

    const message = await Message.findById(messageId);
    
    if (!message) {
      console.log('[SocketSecurity] Message not found:', messageId);
      return false;
    }

    if (message.senderId.toString() !== userId) {
      console.log(`[SocketSecurity] IDOR ATTEMPT: User ${userId} tried to modify message ${messageId}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[SocketSecurity] Error verifying message ownership:', error);
    return false;
  }
};

// Verify user can only block/unblock as themselves
export const verifySelfAction = (socket: Socket, targetUserId: string): boolean => {
  const userId = (socket as any).userId;
  
  if (!userId) {
    console.log('[SocketSecurity] No userId on socket');
    return false;
  }

  // User can block anyone, but we log it for monitoring
  console.log(`[SocketSecurity] User ${userId} blocking/unblocking ${targetUserId}`);
  return true;
};

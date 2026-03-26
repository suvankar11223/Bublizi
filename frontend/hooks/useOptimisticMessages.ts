/**
 * Optimistic UI Hook for Messages
 * 
 * Provides instant feedback by showing messages immediately,
 * then updating with server response
 * 
 * Features:
 * - Instant message display (no waiting for server)
 * - Automatic retry on failure
 * - Status tracking (sending → sent → delivered)
 * - Handles message replacement when server confirms
 */

import { useState, useCallback } from 'react';
import { getSocket } from '@/socket/socket';

export interface OptimisticMessage {
  id: string;
  content: string;
  attachment?: string | null;
  sender: {
    id: string;
    name: string;
    avatar?: string | null;
  };
  createdAt: string;
  status: 'sending' | 'sent' | 'delivered' | 'failed';
  isMe: boolean;
  seq?: number;
  tempId?: string;
}

export const useOptimisticMessages = (conversationId: string, currentUserId: string) => {
  const [optimisticMessages, setOptimisticMessages] = useState<Map<string, OptimisticMessage>>(
    new Map()
  );

  // Add optimistic message
  const addOptimisticMessage = useCallback((
    content: string,
    sender: { id: string; name: string; avatar?: string | null },
    attachment?: string
  ): string => {
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    
    const optimisticMsg: OptimisticMessage = {
      id: tempId,
      content,
      attachment: attachment || null,
      sender,
      createdAt: new Date().toISOString(),
      status: 'sending',
      isMe: true,
      tempId,
    };

    setOptimisticMessages(prev => new Map(prev).set(tempId, optimisticMsg));
    
    return tempId;
  }, []);

  // Update message status
  const updateMessageStatus = useCallback((
    tempId: string,
    status: 'sent' | 'delivered' | 'failed',
    seq?: number
  ) => {
    setOptimisticMessages(prev => {
      const updated = new Map(prev);
      const msg = updated.get(tempId);
      if (msg) {
        updated.set(tempId, { ...msg, status, seq });
      }
      return updated;
    });
  }, []);

  // Replace optimistic message with real message
  const replaceWithRealMessage = useCallback((tempId: string, realMessageId: string) => {
    setOptimisticMessages(prev => {
      const updated = new Map(prev);
      updated.delete(tempId);
      return updated;
    });
  }, []);

  // Remove failed message
  const removeMessage = useCallback((tempId: string) => {
    setOptimisticMessages(prev => {
      const updated = new Map(prev);
      updated.delete(tempId);
      return updated;
    });
  }, []);

  // Send message with optimistic UI
  const sendMessageOptimistic = useCallback(async (
    content: string,
    sender: { id: string; name: string; avatar?: string | null },
    attachment?: string
  ): Promise<void> => {
    const socket = getSocket();
    if (!socket || !socket.connected) {
      console.error('[OptimisticUI] Socket not connected');
      return;
    }

    // 1. Add optimistic message immediately
    const tempId = addOptimisticMessage(content, sender, attachment);

    // 2. Send to server
    socket.emit('newMessage', {
      conversationId,
      sender,
      content,
      attachment,
      tempId,
    });

    // 3. Listen for confirmation (one-time)
    const confirmTimeout = setTimeout(() => {
      // If no response in 5 seconds, mark as failed
      updateMessageStatus(tempId, 'failed');
    }, 5000);

    socket.once('messageQueued', (data: { tempId: string; seq: number }) => {
      if (data.tempId === tempId) {
        clearTimeout(confirmTimeout);
        updateMessageStatus(tempId, 'sent', data.seq);
      }
    });

    // 4. Listen for real message (one-time)
    const messageListener = (data: any) => {
      if (data.tempId === tempId && data.success) {
        replaceWithRealMessage(tempId, data.data.id);
        socket.off('newMessage', messageListener);
      }
    };
    
    socket.on('newMessage', messageListener);

    // 5. Listen for errors
    socket.once('message:error', (data: { tempId: string }) => {
      if (data.tempId === tempId) {
        clearTimeout(confirmTimeout);
        updateMessageStatus(tempId, 'failed');
      }
    });
  }, [conversationId, addOptimisticMessage, updateMessageStatus, replaceWithRealMessage]);

  // Retry failed message
  const retryMessage = useCallback((tempId: string) => {
    const msg = optimisticMessages.get(tempId);
    if (!msg) return;

    // Remove old message
    removeMessage(tempId);

    // Resend
    sendMessageOptimistic(msg.content, msg.sender, msg.attachment || undefined);
  }, [optimisticMessages, removeMessage, sendMessageOptimistic]);

  return {
    optimisticMessages: Array.from(optimisticMessages.values()),
    sendMessageOptimistic,
    retryMessage,
    removeMessage,
  };
};

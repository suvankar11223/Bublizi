/**
 * Offline-First React Hooks
 * Phase 3: React Integration
 */

import { useState, useEffect } from 'react';
import { Q } from '@nozbe/watermelondb';
import { conversations, messages } from '../db';
import SyncEngine from '../sync/SyncEngine';
import NetworkMonitor from '../sync/NetworkMonitor';

/**
 * Hook to get reactive list of conversations
 */
export function useConversations() {
  const [convList, setConvList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subscription = conversations()
      .query(
        Q.where('is_archived', false),
        Q.sortBy('last_message_at', Q.desc)
      )
      .observe()
      .subscribe((data) => {
        setConvList(data);
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  return { conversations: convList, loading };
}

/**
 * Hook to get messages for a conversation
 */
export function useMessages(conversationId, limit = 50) {
  const [msgList, setMsgList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!conversationId) {
      setMsgList([]);
      setLoading(false);
      return;
    }

    const subscription = messages()
      .query(
        Q.where('conversation_id', conversationId),
        Q.where('is_deleted', false),
        Q.sortBy('sent_at', Q.desc),
        Q.take(limit)
      )
      .observe()
      .subscribe(async (data) => {
        setMsgList(data.reverse());
        
        // Check if there are more messages
        const total = await messages()
          .query(
            Q.where('conversation_id', conversationId),
            Q.where('is_deleted', false)
          )
          .fetchCount();
        
        setHasMore(total > limit);
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, [conversationId, limit]);

  return { messages: msgList, loading, hasMore };
}

/**
 * Hook to get sync status
 */
export function useSyncStatus() {
  const [status, setStatus] = useState({
    isOnline: true,
    isSyncing: false,
    lastSyncTime: null,
  });

  useEffect(() => {
    // Update status periodically
    const updateStatus = () => {
      setStatus(SyncEngine.getStatus());
    };

    updateStatus();
    const interval = setInterval(updateStatus, 1000);

    // Listen to sync events
    const handleSyncStart = () => updateStatus();
    const handleSyncComplete = () => updateStatus();
    const handleNetworkChange = () => updateStatus();

    SyncEngine.on('syncStart', handleSyncStart);
    SyncEngine.on('syncComplete', handleSyncComplete);
    NetworkMonitor.on('change', handleNetworkChange);

    return () => {
      clearInterval(interval);
      SyncEngine.off('syncStart', handleSyncStart);
      SyncEngine.off('syncComplete', handleSyncComplete);
      NetworkMonitor.off('change', handleNetworkChange);
    };
  }, []);

  return status;
}

/**
 * Hook to get a single conversation
 */
export function useConversation(conversationId) {
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      setLoading(false);
      return;
    }

    let subscription;
    
    // Find and observe the conversation
    conversations()
      .find(conversationId)
      .then((conv) => {
        if (conv) {
          subscription = conv.observe().subscribe((data) => {
            setConversation(data);
            setLoading(false);
          });
        } else {
          setConversation(null);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error('[useConversation] Error finding conversation:', error);
        setConversation(null);
        setLoading(false);
      });

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [conversationId]);

  return { conversation, loading };
}

/**
 * Hook to get total unread count
 */
export function useUnreadCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const subscription = conversations()
      .query(Q.where('unread_count', Q.gt(0)))
      .observe()
      .subscribe(async (data) => {
        const total = data.reduce((sum, conv) => sum + conv.unreadCount, 0);
        setCount(total);
      });

    return () => subscription.unsubscribe();
  }, []);

  return count;
}

/**
 * Hook to get pending messages count
 */
export function usePendingMessages() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const subscription = messages()
      .query(Q.where('status', 'pending'))
      .observe()
      .subscribe((data) => {
        setCount(data.length);
      });

    return () => subscription.unsubscribe();
  }, []);

  return count;
}

/**
 * SyncEngine - Orchestrates bidirectional sync
 * Phase 2: Sync Infrastructure
 */

import { EventEmitter } from 'events';
import NetworkMonitor from './NetworkMonitor';
import SyncQueue, { SYNC_OPERATIONS } from './SyncQueue';
import { messages, conversations } from '../db';
import apiService from '../../services/apiService';

class SyncEngine extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.isSyncing = false;
    this.syncInterval = null;
    this.lastSyncTime = null;
  }

  start() {
    if (this.isRunning) return;

    console.log('[SyncEngine] Starting...');
    this.isRunning = true;

    // Start network monitoring
    NetworkMonitor.start();

    // Listen for network changes
    NetworkMonitor.on('online', () => {
      console.log('[SyncEngine] Network online - triggering sync');
      this.sync();
    });

    // Periodic sync every 30 seconds when online
    this.syncInterval = setInterval(() => {
      if (NetworkMonitor.getStatus()) {
        this.sync();
      }
    }, 30000);

    // Initial sync if online
    if (NetworkMonitor.getStatus()) {
      this.sync();
    }
  }

  stop() {
    console.log('[SyncEngine] Stopping...');
    this.isRunning = false;

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    NetworkMonitor.stop();
  }

  async sync() {
    if (this.isSyncing || !NetworkMonitor.getStatus()) {
      return;
    }

    this.isSyncing = true;
    this.emit('syncStart');

    try {
      console.log('[SyncEngine] Sync started');

      // Step 1: Push local changes
      await this.pushChanges();

      // Step 2: Pull server changes
      await this.pullChanges();

      this.lastSyncTime = Date.now();
      this.emit('syncComplete');
      console.log('[SyncEngine] Sync completed');
    } catch (error) {
      console.error('[SyncEngine] Sync error:', error);
      this.emit('syncError', error);
    } finally {
      this.isSyncing = false;
    }
  }

  async pushChanges() {
    const pending = await SyncQueue.getPending();
    console.log(`[SyncEngine] Pushing ${pending.length} changes`);

    for (const item of pending) {
      try {
        await SyncQueue.markProcessing(item);
        const payload = item.payload;

        switch (item.operation) {
          case SYNC_OPERATIONS.CREATE_MESSAGE:
            await this.pushCreateMessage(payload);
            break;

          case SYNC_OPERATIONS.DELETE_MESSAGE:
            await this.pushDeleteMessage(payload);
            break;

          case SYNC_OPERATIONS.REACT_MESSAGE:
            await this.pushReactMessage(payload);
            break;

          case SYNC_OPERATIONS.MARK_READ:
            await this.pushMarkRead(payload);
            break;

          default:
            console.warn(`[SyncEngine] Unknown operation: ${item.operation}`);
        }

        await SyncQueue.markCompleted(item);
      } catch (error) {
        console.error(`[SyncEngine] Push error for ${item.operation}:`, error);
        await SyncQueue.markFailed(item, error);
      }
    }
  }

  async pushCreateMessage(payload) {
    const { localId, conversationId, content, type } = payload;

    // Send to server
    const response = await apiService.post('/conversations/send-message', {
      conversationId,
      content,
      type,
      localId,
    });

    // Update local message with server ID
    const msgCollection = messages();
    const msg = await msgCollection.find(localId);

    if (msg) {
      const db = msg.database;
      await db.write(async () => {
        await msg.update((record) => {
          record._setRaw('server_id', response.data._id);
          record._setRaw('status', 'sent');
          record._setRaw('sent_at', Date.now());
          record._setRaw('updated_at', Date.now());
        });
      });
    }

    console.log(`[SyncEngine] Message synced: ${localId} -> ${response.data._id}`);
  }

  async pushDeleteMessage(payload) {
    const { messageId } = payload;
    await apiService.delete(`/messages/${messageId}`);
    console.log(`[SyncEngine] Message deleted: ${messageId}`);
  }

  async pushReactMessage(payload) {
    const { messageId, emoji } = payload;
    await apiService.post(`/messages/${messageId}/react`, { emoji });
    console.log(`[SyncEngine] Reaction synced: ${messageId}`);
  }

  async pushMarkRead(payload) {
    const { conversationId } = payload;
    await apiService.post(`/conversations/${conversationId}/mark-read`);
    console.log(`[SyncEngine] Mark read synced: ${conversationId}`);
  }

  async pullChanges() {
    if (!this.lastSyncTime) {
      // First sync - pull recent data
      console.log('[SyncEngine] First sync - pulling recent data');
      return;
    }

    // Delta sync - pull changes since last sync
    const since = this.lastSyncTime;
    console.log(`[SyncEngine] Pulling changes since ${new Date(since).toISOString()}`);

    // TODO: Implement delta sync API call
    // const response = await apiService.get(`/sync/delta?since=${since}`);
    // await this.applyServerChanges(response.data);
  }

  async applyServerChanges(data) {
    // TODO: Apply server changes to local database
    // Handle conversations, messages, deletions
    console.log('[SyncEngine] Applying server changes:', data);
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isSyncing: this.isSyncing,
      isOnline: NetworkMonitor.getStatus(),
      lastSyncTime: this.lastSyncTime,
    };
  }
}

export default new SyncEngine();

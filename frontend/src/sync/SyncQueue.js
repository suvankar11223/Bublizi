import { Q } from '@nozbe/watermelondb';
import { syncQueue } from '../db';

export const SYNC_OPERATIONS = {
  CREATE_MESSAGE: 'create_message',
  DELETE_MESSAGE: 'delete_message',
  REACT_MESSAGE: 'react_message',
  MARK_READ: 'mark_read',
  UPDATE_MESSAGE: 'update_message',
};

export const SYNC_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export const SYNC_PRIORITY = {
  HIGH: 1,
  NORMAL: 5,
  LOW: 10,
};

class SyncQueue {
  async enqueue(operation, payload, priority = SYNC_PRIORITY.NORMAL) {
    try {
      const queue = syncQueue();
      const db = queue.database;
      await db.write(async () => {
        await queue.create((item) => {
          item._setRaw('operation', operation);
          item._setRaw('payload_json', JSON.stringify(payload));
          item._setRaw('priority', priority);
          item._setRaw('status', SYNC_STATUS.PENDING);
          item._setRaw('retry_count', 0);
          item._setRaw('max_retries', 3);
          item._setRaw('created_at', Date.now());
          item._setRaw('updated_at', Date.now());
        });
      });
      console.log(`[SyncQueue] Enqueued: ${operation}`, payload);
    } catch (error) {
      console.error('[SyncQueue] Enqueue error:', error);
      throw error;
    }
  }

  async getPending() {
    try {
      const queue = syncQueue();
      const items = await queue.query(Q.where('status', SYNC_STATUS.PENDING), Q.sortBy('priority', Q.asc), Q.sortBy('created_at', Q.asc)).fetch();
      return items;
    } catch (error) {
      console.error('[SyncQueue] Get pending error:', error);
      return [];
    }
  }

  async markProcessing(item) {
    try {
      const db = item.database;
      await db.write(async () => {
        await item.update((record) => {
          record._setRaw('status', SYNC_STATUS.PROCESSING);
          record._setRaw('updated_at', Date.now());
        });
      });
    } catch (error) {
      console.error('[SyncQueue] Mark processing error:', error);
    }
  }

  async markCompleted(item) {
    try {
      const db = item.database;
      await db.write(async () => {
        await item.markAsDeleted();
      });
      console.log(`[SyncQueue] Completed: ${item.operation}`);
    } catch (error) {
      console.error('[SyncQueue] Mark completed error:', error);
    }
  }

  async markFailed(item, error) {
    try {
      const db = item.database;
      const retryCount = item.retryCount + 1;
      const maxRetries = item.maxRetries;
      await db.write(async () => {
        if (retryCount >= maxRetries) {
          await item.update((record) => {
            record._setRaw('status', SYNC_STATUS.FAILED);
            record._setRaw('retry_count', retryCount);
            record._setRaw('error', error.message || 'Unknown error');
            record._setRaw('updated_at', Date.now());
          });
          console.error(`[SyncQueue] Failed permanently: ${item.operation}`, error);
        } else {
          await item.update((record) => {
            record._setRaw('status', SYNC_STATUS.PENDING);
            record._setRaw('retry_count', retryCount);
            record._setRaw('error', error.message || 'Unknown error');
            record._setRaw('updated_at', Date.now());
          });
          console.warn(`[SyncQueue] Retry ${retryCount}/${maxRetries}: ${item.operation}`);
        }
      });
    } catch (err) {
      console.error('[SyncQueue] Mark failed error:', err);
    }
  }

  async getFailed() {
    try {
      const queue = syncQueue();
      const items = await queue.query(Q.where('status', SYNC_STATUS.FAILED)).fetch();
      return items;
    } catch (error) {
      console.error('[SyncQueue] Get failed error:', error);
      return [];
    }
  }

  async retryFailed(item) {
    try {
      const db = item.database;
      await db.write(async () => {
        await item.update((record) => {
          record._setRaw('status', SYNC_STATUS.PENDING);
          record._setRaw('retry_count', 0);
          record._setRaw('error', null);
          record._setRaw('updated_at', Date.now());
        });
      });
      console.log(`[SyncQueue] Retrying: ${item.operation}`);
    } catch (error) {
      console.error('[SyncQueue] Retry failed error:', error);
    }
  }

  async getStats() {
    try {
      const queue = syncQueue();
      const [pending, processing, failed] = await Promise.all([
        queue.query(Q.where('status', SYNC_STATUS.PENDING)).fetchCount(),
        queue.query(Q.where('status', SYNC_STATUS.PROCESSING)).fetchCount(),
        queue.query(Q.where('status', SYNC_STATUS.FAILED)).fetchCount(),
      ]);
      return { pending, processing, failed };
    } catch (error) {
      console.error('[SyncQueue] Get stats error:', error);
      return { pending: 0, processing: 0, failed: 0 };
    }
  }
}

export default new SyncQueue();

/**
 * Presence Service
 * 
 * Redis-based presence tracking for horizontal scaling
 * Replaces in-memory Map with distributed Redis storage
 */

import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

const PRESENCE_TTL = 30; // 30 seconds
const HEARTBEAT_INTERVAL = 15000; // 15 seconds

export class PresenceService {
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Mark user as online
   */
  async setOnline(userId: string, socketId: string): Promise<void> {
    try {
      const key = `presence:${userId}`;
      await redis.set(key, socketId, { ex: PRESENCE_TTL });
      
      logger.debug('User marked online', { userId, socketId });
    } catch (error: any) {
      logger.error('Failed to set user online', {
        error: error.message,
        userId,
        socketId,
      });
    }
  }

  /**
   * Mark user as offline
   */
  async setOffline(userId: string): Promise<void> {
    try {
      const key = `presence:${userId}`;
      await redis.del(key);
      
      // Stop heartbeat
      this.stopHeartbeat(userId);
      
      logger.debug('User marked offline', { userId });
    } catch (error: any) {
      logger.error('Failed to set user offline', {
        error: error.message,
        userId,
      });
    }
  }

  /**
   * Check if user is online
   */
  async isOnline(userId: string): Promise<boolean> {
    try {
      const key = `presence:${userId}`;
      const socketId = await redis.get(key);
      return socketId !== null;
    } catch (error: any) {
      logger.error('Failed to check user presence', {
        error: error.message,
        userId,
      });
      return false;
    }
  }

  /**
   * Get socket ID for online user
   */
  async getSocketId(userId: string): Promise<string | null> {
    try {
      const key = `presence:${userId}`;
      return await redis.get(key);
    } catch (error: any) {
      logger.error('Failed to get socket ID', {
        error: error.message,
        userId,
      });
      return null;
    }
  }

  /**
   * Get all online users
   */
  async getOnlineUsers(): Promise<string[]> {
    try {
      // Note: This requires scanning Redis keys
      // For production with many users, consider maintaining a separate set
      // For now, we'll return empty array and rely on individual checks
      // TODO: Implement Redis SCAN or maintain a separate online_users set
      return [];
    } catch (error: any) {
      logger.error('Failed to get online users', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Start heartbeat for user to keep presence alive
   */
  startHeartbeat(userId: string, socketId: string): void {
    // Clear existing heartbeat if any
    this.stopHeartbeat(userId);

    const interval = setInterval(async () => {
      try {
        await this.setOnline(userId, socketId);
      } catch (error: any) {
        logger.error('Heartbeat failed', {
          error: error.message,
          userId,
        });
      }
    }, HEARTBEAT_INTERVAL);

    this.heartbeatIntervals.set(userId, interval);
    
    logger.debug('Heartbeat started', { userId, interval: HEARTBEAT_INTERVAL });
  }

  /**
   * Stop heartbeat for user
   */
  stopHeartbeat(userId: string): void {
    const interval = this.heartbeatIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(userId);
      logger.debug('Heartbeat stopped', { userId });
    }
  }

  /**
   * Refresh presence TTL (called on user activity)
   */
  async refreshPresence(userId: string, socketId: string): Promise<void> {
    try {
      const key = `presence:${userId}`;
      await redis.set(key, socketId, { ex: PRESENCE_TTL });
    } catch (error: any) {
      logger.error('Failed to refresh presence', {
        error: error.message,
        userId,
      });
    }
  }

  /**
   * Get presence statistics
   */
  async getStats(): Promise<{
    totalOnline: number;
    heartbeatsActive: number;
  }> {
    return {
      totalOnline: 0, // TODO: Implement with Redis SCAN or SET
      heartbeatsActive: this.heartbeatIntervals.size,
    };
  }

  /**
   * Cleanup all heartbeats (called on server shutdown)
   */
  cleanup(): void {
    for (const [userId, interval] of this.heartbeatIntervals.entries()) {
      clearInterval(interval);
      logger.debug('Cleaned up heartbeat', { userId });
    }
    this.heartbeatIntervals.clear();
  }
}

// Singleton instance
export const presenceService = new PresenceService();

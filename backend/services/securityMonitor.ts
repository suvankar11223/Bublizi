/**
 * Security Monitoring Service (PHASE 3)
 * 
 * Tracks and detects suspicious activity:
 * - Failed login attempts
 * - IP blocking
 * - Anomaly detection
 * - Brute force prevention
 */

import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

const FAILED_ATTEMPT_THRESHOLD = 5;
const BLOCK_DURATION = 3600; // 1 hour in seconds
const ATTEMPT_WINDOW = 900; // 15 minutes in seconds

export class SecurityMonitor {
  /**
   * Track failed login attempt
   */
  async trackFailedLogin(ip: string, email: string): Promise<void> {
    try {
      const key = `failed:${ip}:${email}`;
      
      // Increment counter
      const attempts = await redis.incr(key);
      
      // Set expiry on first attempt
      if (attempts === 1) {
        await redis.expire(key, ATTEMPT_WINDOW);
      }
      
      logger.warn('Failed login attempt', {
        ip,
        email,
        attempts,
        threshold: FAILED_ATTEMPT_THRESHOLD,
      });
      
      // Block IP if threshold exceeded
      if (attempts >= FAILED_ATTEMPT_THRESHOLD) {
        await this.blockIP(ip, email, attempts);
      }
    } catch (error: any) {
      logger.error('Failed to track login attempt', {
        error: error.message,
        ip,
        email,
      });
    }
  }

  /**
   * Track successful login (clear failed attempts)
   */
  async trackSuccessfulLogin(ip: string, email: string): Promise<void> {
    try {
      const key = `failed:${ip}:${email}`;
      await redis.del(key);
      
      logger.info('Successful login', { ip, email });
    } catch (error: any) {
      logger.error('Failed to track successful login', {
        error: error.message,
        ip,
        email,
      });
    }
  }

  /**
   * Block IP address
   */
  private async blockIP(ip: string, email: string, attempts: number): Promise<void> {
    try {
      const blockKey = `blocked:${ip}`;
      
      await redis.set(blockKey, JSON.stringify({
        email,
        attempts,
        blockedAt: Date.now(),
        reason: 'Too many failed login attempts',
      }), { ex: BLOCK_DURATION });
      
      logger.warn('IP blocked', {
        ip,
        email,
        attempts,
        duration: BLOCK_DURATION,
      });
      
      // TODO: Send alert to admin
      // await sendAdminAlert('IP_BLOCKED', { ip, email, attempts });
    } catch (error: any) {
      logger.error('Failed to block IP', {
        error: error.message,
        ip,
      });
    }
  }

  /**
   * Check if IP is blocked
   */
  async isBlocked(ip: string): Promise<boolean> {
    try {
      const blockKey = `blocked:${ip}`;
      const blocked = await redis.exists(blockKey);
      return blocked;
    } catch (error: any) {
      logger.error('Failed to check if IP is blocked', {
        error: error.message,
        ip,
      });
      return false; // Fail open to avoid blocking legitimate users
    }
  }

  /**
   * Get block info for IP
   */
  async getBlockInfo(ip: string): Promise<{
    blocked: boolean;
    email?: string;
    attempts?: number;
    blockedAt?: number;
    expiresIn?: number;
  }> {
    try {
      const blockKey = `blocked:${ip}`;
      const data = await redis.get(blockKey);
      
      if (!data) {
        return { blocked: false };
      }
      
      const blockInfo = JSON.parse(data);
      const ttl = await redis.ttl(blockKey);
      
      return {
        blocked: true,
        ...blockInfo,
        expiresIn: ttl,
      };
    } catch (error: any) {
      logger.error('Failed to get block info', {
        error: error.message,
        ip,
      });
      return { blocked: false };
    }
  }

  /**
   * Unblock IP (admin function)
   */
  async unblockIP(ip: string): Promise<void> {
    try {
      const blockKey = `blocked:${ip}`;
      await redis.del(blockKey);
      
      logger.info('IP unblocked', { ip });
    } catch (error: any) {
      logger.error('Failed to unblock IP', {
        error: error.message,
        ip,
      });
    }
  }

  /**
   * Track suspicious activity patterns
   */
  async trackSuspiciousActivity(
    userId: string,
    activityType: string,
    details: any
  ): Promise<void> {
    try {
      const key = `suspicious:${userId}:${activityType}:${Date.now()}`;
      
      await redis.set(key, JSON.stringify({
        timestamp: Date.now(),
        type: activityType,
        details,
      }), { ex: 7 * 24 * 60 * 60 }); // 7 days
      
      logger.warn('Suspicious activity detected', {
        userId,
        activityType,
        details,
      });
    } catch (error: any) {
      logger.error('Failed to track suspicious activity', {
        error: error.message,
        userId,
        activityType,
      });
    }
  }

  /**
   * Get failed attempt count
   */
  async getFailedAttempts(ip: string, email: string): Promise<number> {
    try {
      const key = `failed:${ip}:${email}`;
      const count = await redis.get(key);
      return count ? parseInt(count) : 0;
    } catch (error: any) {
      logger.error('Failed to get failed attempts', {
        error: error.message,
        ip,
        email,
      });
      return 0;
    }
  }

  /**
   * Get security statistics
   */
  async getStats(): Promise<{
    blockedIPs: number;
    failedAttempts: number;
    suspiciousActivities: number;
  }> {
    try {
      // This is a simplified version
      // In production, you'd want more sophisticated tracking
      return {
        blockedIPs: 0, // TODO: Implement with Redis SCAN
        failedAttempts: 0, // TODO: Implement with Redis SCAN
        suspiciousActivities: 0, // TODO: Implement with Redis SCAN
      };
    } catch (error: any) {
      logger.error('Failed to get security stats', {
        error: error.message,
      });
      return {
        blockedIPs: 0,
        failedAttempts: 0,
        suspiciousActivities: 0,
      };
    }
  }
}

// Singleton instance
export const securityMonitor = new SecurityMonitor();

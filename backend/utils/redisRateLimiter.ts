/**
 * Redis-Based Rate Limiter
 * 
 * Production-grade rate limiting using Redis for:
 * - Multi-instance support
 * - Persistence across restarts
 * - Automatic blocking
 * - Centralized monitoring
 */

import { redis } from '../config/redis.js';
import { logger } from './logger.js';

interface RateLimitConfig {
  windowSeconds: number;
  maxRequests: number;
  blockDuration?: number; // Optional block after exceeding
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
  blocked?: boolean;
  blockExpiresIn?: number;
}

class RedisRateLimiter {
  private static instance: RedisRateLimiter;

  static getInstance(): RedisRateLimiter {
    if (!RedisRateLimiter.instance) {
      RedisRateLimiter.instance = new RedisRateLimiter();
    }
    return RedisRateLimiter.instance;
  }

  /**
   * Check if request is allowed under rate limit
   * @param key - Unique identifier (IP, email, userId, etc.)
   * @param action - Action being rate limited (login, register, etc.)
   * @param config - Rate limit configuration
   */
  async check(
    key: string,
    action: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const { windowSeconds, maxRequests, blockDuration } = config;

    // Create Redis keys
    const counterKey = `rl:${action}:${key}:counter`;
    const blockKey = `rl:${action}:${key}:blocked`;

    try {
      // Check if key is blocked
      if (blockDuration) {
        const isBlocked = await redis.exists(blockKey);
        if (isBlocked) {
          return {
            allowed: false,
            remaining: 0,
            resetIn: blockDuration,
            blocked: true,
            blockExpiresIn: blockDuration,
          };
        }
      }

      // Get current count
      const current = await redis.get(counterKey);
      const count = current ? parseInt(current) : 0;

      // Check if limit exceeded
      if (count >= maxRequests) {
        // If block duration specified, block the key
        if (blockDuration) {
          await redis.set(blockKey, '1', { ex: blockDuration });
          await redis.del(counterKey); // Clear counter after blocking

          logger.warn('Rate limit exceeded - blocking', {
            action,
            key,
            blockDuration,
          });

          return {
            allowed: false,
            remaining: 0,
            resetIn: blockDuration,
            blocked: true,
            blockExpiresIn: blockDuration,
          };
        }

        return {
          allowed: false,
          remaining: 0,
          resetIn: windowSeconds,
        };
      }

      // Increment counter
      const newCount = await redis.incr(counterKey);

      // Set expiry if first request
      if (newCount === 1) {
        await redis.expire(counterKey, windowSeconds);
      }

      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - newCount),
        resetIn: windowSeconds,
      };

    } catch (error: any) {
      logger.error('Rate limiter error', {
        error: error.message,
        action,
        key,
      });
      
      // Fail open - allow request if Redis fails
      return {
        allowed: true,
        remaining: maxRequests,
        resetIn: windowSeconds,
      };
    }
  }

  /**
   * Reset rate limit for a key
   */
  async reset(key: string, action: string): Promise<void> {
    const counterKey = `rl:${action}:${key}:counter`;
    const blockKey = `rl:${action}:${key}:blocked`;

    try {
      await redis.del(counterKey);
      await redis.del(blockKey);
      
      logger.info('Rate limit reset', { action, key });
    } catch (error: any) {
      logger.error('Failed to reset rate limit', {
        error: error.message,
        action,
        key,
      });
    }
  }

  /**
   * Get current rate limit stats for monitoring
   */
  async getStats(key: string, action: string): Promise<{
    count: number;
    blocked: boolean;
  }> {
    const counterKey = `rl:${action}:${key}:counter`;
    const blockKey = `rl:${action}:${key}:blocked`;

    try {
      const count = await redis.get(counterKey);
      const blocked = await redis.exists(blockKey);

      return {
        count: count ? parseInt(count) : 0,
        blocked: blocked,
      };
    } catch (error: any) {
      logger.error('Failed to get rate limit stats', {
        error: error.message,
        action,
        key,
      });
      
      return {
        count: 0,
        blocked: false,
      };
    }
  }
}

export const rateLimiter = RedisRateLimiter.getInstance();

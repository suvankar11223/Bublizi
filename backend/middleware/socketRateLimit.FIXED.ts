import type { Socket } from 'socket.io';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

// Rate limit configurations per event type
const RATE_LIMITS: Record<string, { max: number; window: number }> = {
  'newMessage': { max: 10, window: 10 },        // 10 messages per 10 seconds
  'getMessages': { max: 20, window: 60 },       // 20 fetches per minute
  'getConversations': { max: 10, window: 60 },  // 10 fetches per minute
  'voice:send': { max: 5, window: 60 },         // 5 voice messages per minute
  'document:send': { max: 5, window: 60 },      // 5 documents per minute
  'reaction:add': { max: 30, window: 60 },      // 30 reactions per minute
  'message:edit': { max: 10, window: 60 },      // 10 edits per minute
  'message:delete': { max: 10, window: 60 },    // 10 deletes per minute
  'message:pin': { max: 5, window: 60 },        // 5 pins per minute
  'getPinnedMessages': { max: 20, window: 60 }, // 20 fetches per minute
  'story:post': { max: 3, window: 3600 },       // 3 stories per hour
};

/**
 * Check rate limit for socket event
 * Uses Redis for distributed rate limiting across multiple servers
 */
export async function checkSocketRateLimit(
  socket: Socket,
  eventName: string
): Promise<RateLimitResult> {
  const userId = (socket as any).userId;
  
  if (!userId) {
    // No user ID = not authenticated, block
    return {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
      retryAfter: 60,
    };
  }

  const limit = RATE_LIMITS[eventName] || { max: 30, window: 60 };
  const key = `ratelimit:${userId}:${eventName}`;

  try {
    // Increment counter
    const count = await redis.incr(key);
    
    // Set expiry on first request
    if (count === 1) {
      await redis.expire(key, limit.window);
    }

    // Check if limit exceeded
    if (count > limit.max) {
      const ttl = await redis.ttl(key);
      
      logger.warn('Rate limit exceeded', {
        userId,
        eventName,
        count,
        limit: limit.max,
        resetIn: ttl,
      });

      return {
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + ttl * 1000,
        retryAfter: ttl,
      };
    }

    return {
      allowed: true,
      remaining: limit.max - count,
      resetAt: Date.now() + limit.window * 1000,
    };
  } catch (error: any) {
    logger.error('Rate limit check failed', {
      error: error.message,
      userId,
      eventName,
    });

    // On Redis failure, allow request but log error
    // In production, you might want to fail closed instead
    return {
      allowed: true,
      remaining: limit.max,
      resetAt: Date.now() + limit.window * 1000,
    };
  }
}

/**
 * Get rate limit statistics for monitoring
 */
export async function getRateLimitStats() {
  try {
    // This would require scanning Redis keys
    // For production, use Redis SCAN with pattern matching
    return {
      totalKeys: 0,
      byEvent: {},
      inMemoryKeys: 0,
    };
  } catch (error: any) {
    logger.error('Failed to get rate limit stats', {
      error: error.message,
    });
    return {
      totalKeys: 0,
      byEvent: {},
      inMemoryKeys: 0,
    };
  }
}

/**
 * Clear rate limit for a user (admin function)
 */
export async function clearRateLimit(userId: string, eventName?: string): Promise<void> {
  try {
    if (eventName) {
      const key = `ratelimit:${userId}:${eventName}`;
      await redis.del(key);
    } else {
      // Clear all rate limits for user
      // In production, use Redis SCAN to find all keys
      for (const event of Object.keys(RATE_LIMITS)) {
        const key = `ratelimit:${userId}:${event}`;
        await redis.del(key);
      }
    }
    
    logger.info('Rate limit cleared', { userId, eventName });
  } catch (error: any) {
    logger.error('Failed to clear rate limit', {
      error: error.message,
      userId,
      eventName,
    });
  }
}

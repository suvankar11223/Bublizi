/**
 * Phone OTP Rate Limiting
 * Prevents abuse of OTP sending
 */

import { Request, Response, NextFunction } from 'express';
import { getIORedisClient } from '../config/redis.js';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
  };
}

/**
 * Rate limit OTP requests
 * - 3 attempts per 5 minutes per user
 * - Prevents SMS abuse
 */
export async function phoneOTPRateLimit(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.id;
  
  if (!userId) {
    res.status(401).json({
      success: false,
      msg: 'User not authenticated',
    });
    return;
  }

  try {
    const redis = getIORedisClient();
    
    // Fallback if Redis unavailable (allow request)
    if (!redis) {
      console.warn('[PhoneRateLimit] Redis unavailable, allowing request');
      next();
      return;
    }

    const key = `otp:${userId}`;
    const count = await redis.incr(key);
    
    // Set expiry on first attempt
    if (count === 1) {
      await redis.expire(key, 300); // 5 minutes
    }

    // Check limit
    if (count > 3) {
      const ttl = await redis.ttl(key);
      const minutes = Math.ceil(ttl / 60);
      
      res.status(429).json({
        success: false,
        msg: `Too many OTP attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
        retryAfter: ttl,
      });
      return;
    }

    // Log attempt
    console.log(`[PhoneRateLimit] User ${userId}: attempt ${count}/3`);
    
    next();
  } catch (error) {
    console.error('[PhoneRateLimit] Error:', error);
    // Allow request on error (fail open)
    next();
  }
}

/**
 * Reset rate limit for a user (after successful verification)
 */
export async function resetPhoneRateLimit(userId: string): Promise<void> {
  try {
    const redis = getIORedisClient();
    if (!redis) return;

    const key = `otp:${userId}`;
    await redis.del(key);
    
    console.log(`[PhoneRateLimit] Reset for user ${userId}`);
  } catch (error) {
    console.error('[PhoneRateLimit] Reset error:', error);
  }
}

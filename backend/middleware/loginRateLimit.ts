/**
 * Redis-Based Rate Limiting Middleware
 * 
 * Production-grade rate limiting for authentication endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { rateLimiter } from '../utils/redisRateLimiter.js';
import { logger } from '../utils/logger.js';

// Rate limit configurations
const RATE_LIMITS = {
  LOGIN: {
    windowSeconds: 15 * 60, // 15 minutes
    maxRequests: 10, // 10 attempts
    blockDuration: 30 * 60, // Block for 30 minutes after exceeding
  },
  REGISTER: {
    windowSeconds: 60 * 60, // 1 hour
    maxRequests: 5, // 5 attempts
    blockDuration: 24 * 60 * 60, // Block for 24 hours
  },
  FORGOT_PASSWORD: {
    windowSeconds: 60 * 60, // 1 hour
    maxRequests: 3, // 3 attempts
    blockDuration: 12 * 60 * 60, // Block for 12 hours
  },
  REFRESH_TOKEN: {
    windowSeconds: 60 * 60, // 1 hour
    maxRequests: 20, // 20 attempts
  },
  API: {
    windowSeconds: 15 * 60, // 15 minutes
    maxRequests: 100, // 100 requests
  },
};

/**
 * Rate limit by IP address
 */
export const rateLimitByIP = (action: keyof typeof RATE_LIMITS) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const config = RATE_LIMITS[action];
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    const result = await rateLimiter.check(ip, action, config);

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', config.maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetIn);

    if (result.blocked) {
      logger.warn('Rate limit blocked', {
        action,
        ip,
        blockDuration: result.blockExpiresIn,
      });

      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many ${action} attempts. Please try again in ${Math.ceil(result.resetIn / 60)} minutes.`,
        retryAfter: result.resetIn,
        blocked: true,
      });
    }

    if (!result.allowed) {
      logger.warn('Rate limit exceeded', {
        action,
        ip,
        remaining: result.remaining,
        resetIn: result.resetIn,
      });

      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many ${action} attempts. Please try again in ${Math.ceil(result.resetIn / 60)} minutes.`,
        retryAfter: result.resetIn,
      });
    }

    next();
  };
};

/**
 * Rate limit by email (for login attempts)
 */
export const rateLimitByEmail = (action: keyof typeof RATE_LIMITS) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;

    if (!email) {
      return next();
    }

    const config = RATE_LIMITS[action];
    const emailKey = email.toLowerCase().trim();

    const result = await rateLimiter.check(emailKey, `${action}_email`, config);

    if (!result.allowed) {
      logger.warn('Rate limit email exceeded', {
        action,
        email: emailKey,
        resetIn: result.resetIn,
      });

      return res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many ${action} attempts for this email. Please try again later.`,
        retryAfter: result.resetIn,
      });
    }

    next();
  };
};

/**
 * Combined rate limit (IP + email) for login
 */
export const loginRateLimit = [
  rateLimitByIP('LOGIN'),
  rateLimitByEmail('LOGIN'),
];

/**
 * Registration rate limit
 */
export const registerRateLimit = rateLimitByIP('REGISTER');

/**
 * Forgot password rate limit
 */
export const forgotPasswordRateLimit = rateLimitByIP('FORGOT_PASSWORD');

/**
 * Refresh token rate limit
 */
export const refreshTokenRateLimit = rateLimitByIP('REFRESH_TOKEN');

/**
 * General API rate limit
 */
export const apiRateLimit = rateLimitByIP('API');

/**
 * Reset rate limits for a user (e.g., after successful login)
 */
export const resetUserRateLimits = async (email: string, ip: string) => {
  const emailKey = email.toLowerCase().trim();

  await rateLimiter.reset(emailKey, 'LOGIN_email');
  await rateLimiter.reset(ip, 'LOGIN');

  logger.info('Rate limits reset', { email: emailKey, ip });
};

// Backward compatibility export
export const resetLoginRateLimit = async (req: Request) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const email = req.body.email;
  
  if (email && ip) {
    await resetUserRateLimits(email, ip);
  }
};

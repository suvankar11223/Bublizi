/**
 * Request Timeout Middleware (PHASE 4)
 * 
 * Prevents slow requests from blocking server resources
 * - Configurable timeout per route
 * - Automatic cleanup
 * - Timeout logging
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface TimeoutOptions {
  timeout?: number;  // Timeout in milliseconds
  message?: string;  // Custom timeout message
}

/**
 * Create request timeout middleware
 */
export function requestTimeout(options: TimeoutOptions = {}) {
  const {
    timeout = 30000,  // Default 30 seconds
    message = 'Request timeout',
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if response already sent
    if (res.headersSent) {
      return next();
    }

    // Set timeout
    const timeoutId = setTimeout(() => {
      // Only send response if not already sent
      if (!res.headersSent) {
        logger.warn('Request timeout', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          timeout,
          userAgent: req.get('user-agent'),
        });

        res.status(408).json({
          success: false,
          msg: message,
          timeout: `${timeout}ms`,
        });
      }
    }, timeout);

    // Clear timeout when response finishes
    const cleanup = () => {
      clearTimeout(timeoutId);
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);

    next();
  };
}

/**
 * Timeout configurations for different route types
 */
export const timeoutConfigs = {
  // Fast endpoints (5 seconds)
  fast: requestTimeout({ timeout: 5000 }),
  
  // Normal endpoints (30 seconds)
  normal: requestTimeout({ timeout: 30000 }),
  
  // Slow endpoints (60 seconds)
  slow: requestTimeout({ timeout: 60000 }),
  
  // Upload endpoints (5 minutes)
  upload: requestTimeout({ timeout: 300000 }),
  
  // Long-running operations (10 minutes)
  longRunning: requestTimeout({ timeout: 600000 }),
};

/**
 * Apply timeout based on route pattern
 */
export function smartTimeout(req: Request, res: Response, next: NextFunction) {
  // Upload routes get longer timeout
  if (req.path.includes('/upload') || req.path.includes('/file')) {
    return timeoutConfigs.upload(req, res, next);
  }
  
  // Health checks get fast timeout
  if (req.path.includes('/health') || req.path.includes('/ping')) {
    return timeoutConfigs.fast(req, res, next);
  }
  
  // Contact sync gets longer timeout
  if (req.path.includes('/contacts/sync')) {
    return timeoutConfigs.slow(req, res, next);
  }
  
  // Default timeout
  return timeoutConfigs.normal(req, res, next);
}

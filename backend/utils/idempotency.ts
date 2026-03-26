/**
 * Idempotency Utility
 * 
 * Prevents duplicate message processing at the socket level
 * Uses Redis SET NX for atomic duplicate detection
 */

import { redis } from '../config/redis.js';
import { logger } from './logger.js';

/**
 * Check if a request with this tempId has already been processed
 * Returns true if this is a unique request (first time seeing this tempId)
 * Returns false if this is a duplicate request
 * 
 * @param tempId - Unique temporary ID from client
 * @param ttl - Time to live in seconds (default: 300 = 5 minutes)
 */
export async function checkIdempotency(tempId: string, ttl: number = 300): Promise<boolean> {
  if (!tempId) {
    logger.warn('checkIdempotency called without tempId');
    return true; // Allow if no tempId provided
  }

  const key = `idempotency:${tempId}`;
  
  try {
    // Try to set key with NX (only if not exists)
    // This is atomic - only one request will succeed
    const result = await redis.set(key, '1', { ex: ttl, nx: true });
    
    // If result is null, key already exists (duplicate request)
    const isUnique = result !== null;
    
    if (!isUnique) {
      logger.info('Duplicate request blocked', { tempId });
    }
    
    return isUnique;
  } catch (error: any) {
    logger.error('Idempotency check failed', {
      error: error.message,
      tempId,
    });
    
    // On Redis failure, allow request (fail open)
    // In production, you might want to fail closed instead
    return true;
  }
}

/**
 * Clear idempotency record for a tempId
 * Used when a request fails and needs to be retried
 * 
 * @param tempId - Unique temporary ID to clear
 */
export async function clearIdempotency(tempId: string): Promise<void> {
  if (!tempId) return;
  
  const key = `idempotency:${tempId}`;
  
  try {
    await redis.del(key);
    logger.debug('Idempotency cleared', { tempId });
  } catch (error: any) {
    logger.error('Failed to clear idempotency', {
      error: error.message,
      tempId,
    });
  }
}

/**
 * Check if a tempId exists in the idempotency store
 * Used for debugging/monitoring
 * 
 * @param tempId - Unique temporary ID to check
 */
export async function hasIdempotencyRecord(tempId: string): Promise<boolean> {
  if (!tempId) return false;
  
  const key = `idempotency:${tempId}`;
  
  try {
    return await redis.exists(key);
  } catch (error: any) {
    logger.error('Failed to check idempotency record', {
      error: error.message,
      tempId,
    });
    return false;
  }
}

/**
 * Optimized Contact Sync Controller
 * Uses queues and Redis caching for high performance
 */

import { Request, Response } from 'express';
import { Queue } from 'bullmq';
import { getIORedisClient } from '../config/redis.js';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
  };
}

// Contact sync queue
const contactQueue = new Queue('contact-sync', {
  connection: getIORedisClient() || undefined,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 3600, // Keep for 1 hour
      count: 100,
    },
    removeOnFail: {
      age: 86400, // Keep for 24 hours
    },
  },
});

/**
 * Sync contacts (optimized with queue)
 * POST /api/contacts/sync
 */
export const syncContacts = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { phones } = req.body as { phones: string[] };

  if (!userId) {
    res.status(401).json({ success: false, msg: 'User not authenticated' });
    return;
  }

  // ── INPUT VALIDATION (PHASE 0 SECURITY) ────────────────────────────────
  if (!phones || !Array.isArray(phones) || phones.length === 0) {
    res.status(400).json({ success: false, msg: 'phones array is required' });
    return;
  }
  
  // Validate array size (prevent DOS)
  if (phones.length > 10000) {
    res.status(400).json({ success: false, msg: 'Too many phone numbers (max 10,000)' });
    return;
  }
  
  // Validate and sanitize each phone number
  const validPhones = phones
    .filter(phone => typeof phone === 'string')
    .map(phone => phone.replace(/\D/g, ''))  // Remove all non-digits
    .filter(digits => digits.length >= 10 && digits.length <= 15);  // Validate length
  
  if (validPhones.length === 0) {
    res.status(400).json({ success: false, msg: 'No valid phone numbers provided' });
    return;
  }

  try {
    // Check Redis cache first
    const redis = getIORedisClient();
    const cacheKey = `contacts:${userId}`;
    
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const cachedContacts = JSON.parse(cached);
        console.log(`[ContactSync] Returning ${cachedContacts.length} cached contacts for user ${userId}`);
        
        // Return cached data immediately
        res.status(200).json({
          success: true,
          data: cachedContacts,
          cached: true,
          msg: 'Contacts loaded from cache',
        });
        
        // Refresh in background (don't wait)
        refreshContactsInBackground(userId, phones).catch(err => {
          console.error('[ContactSync] Background refresh error:', err);
        });
        
        return;
      }
    }

    // No cache - process with queue (use validPhones instead of phones)
    const BATCH_SIZE = 100;
    const batches = [];
    
    for (let i = 0; i < validPhones.length; i += BATCH_SIZE) {
      batches.push(validPhones.slice(i, i + BATCH_SIZE));
    }

    console.log(`[ContactSync] Queueing ${batches.length} batches for user ${userId}`);

    // Clear existing cache
    if (redis) {
      await redis.del(cacheKey);
    }

    // Add batches to queue
    const jobs = batches.map((batch, index) => ({
      name: `sync-${userId}-${index}`,
      data: {
        userId,
        phones: batch,
        batchIndex: index,
        totalBatches: batches.length,
      },
    }));

    await contactQueue.addBulk(jobs);

    // Respond immediately (don't wait for processing)
    res.status(202).json({
      success: true,
      msg: 'Contact sync started',
      batches: batches.length,
      totalPhones: validPhones.length,
      invalidPhones: phones.length - validPhones.length,
    });

    console.log(`[ContactSync] Queued ${batches.length} batches for user ${userId}`);
  } catch (error: any) {
    console.error('[ContactSync] Error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to start contact sync',
    });
  }
};

/**
 * Get cached contacts
 * GET /api/contacts/cached
 */
export const getCachedContacts = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ success: false, msg: 'User not authenticated' });
    return;
  }

  try {
    const redis = getIORedisClient();
    if (!redis) {
      res.status(503).json({ success: false, msg: 'Cache unavailable' });
      return;
    }

    const cacheKey = `contacts:${userId}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      const contacts = JSON.parse(cached);
      res.status(200).json({
        success: true,
        data: contacts,
        count: contacts.length,
      });
    } else {
      res.status(200).json({
        success: true,
        data: [],
        count: 0,
        msg: 'No cached contacts',
      });
    }
  } catch (error: any) {
    console.error('[ContactSync] getCachedContacts error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to get cached contacts',
    });
  }
};

/**
 * Refresh contacts in background (async)
 */
async function refreshContactsInBackground(userId: string, phones: string[]): Promise<void> {
  try {
    const BATCH_SIZE = 100;
    const batches = [];
    
    for (let i = 0; i < phones.length; i += BATCH_SIZE) {
      batches.push(phones.slice(i, i + BATCH_SIZE));
    }

    const jobs = batches.map((batch, index) => ({
      name: `refresh-${userId}-${index}`,
      data: {
        userId,
        phones: batch,
        batchIndex: index,
        totalBatches: batches.length,
      },
    }));

    await contactQueue.addBulk(jobs);
    console.log(`[ContactSync] Background refresh queued for user ${userId}`);
  } catch (error) {
    console.error('[ContactSync] Background refresh error:', error);
  }
}

/**
 * Get sync status
 * GET /api/contacts/sync-status
 */
export const getSyncStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ success: false, msg: 'User not authenticated' });
    return;
  }

  try {
    // Get pending jobs for this user
    const jobs = await contactQueue.getJobs(['waiting', 'active']);
    const userJobs = jobs.filter(job => job.data.userId === userId);

    const totalBatches = userJobs.length > 0 ? userJobs[0].data.totalBatches : 0;
    const completedBatches = totalBatches - userJobs.length;
    const progress = totalBatches > 0 ? (completedBatches / totalBatches) * 100 : 100;

    res.status(200).json({
      success: true,
      data: {
        inProgress: userJobs.length > 0,
        totalBatches,
        completedBatches,
        progress: Math.round(progress),
      },
    });
  } catch (error: any) {
    console.error('[ContactSync] getSyncStatus error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to get sync status',
    });
  }
};

/**
 * Contact Worker - WhatsApp-Level Intelligence
 * Processes contact sync jobs with smart normalization and caching
 */

import { Worker, Job } from 'bullmq';
import { getIORedisClient } from '../config/redis.js';
import User from '../modals/userModal.js';

interface ContactSyncJob {
  userId: string;
  phones: string[];
  batchIndex: number;
  totalBatches: number;
}

// WhatsApp-style phone normalization
const normalizePhone = (phone: string): string => {
  return phone
    .replace(/\D/g, '')        // Remove all non-digits
    .replace(/^0+/, '')        // Remove leading zeros
    .slice(-10);               // Last 10 digits (India)
};

// Build ALL possible phone variants for matching
const buildPhoneVariants = (phone: string): string[] => {
  const normalized = normalizePhone(phone);
  if (normalized.length !== 10) return [];
  
  return [
    normalized,           // 9876543210
    `+91${normalized}`,   // +919876543210
    `91${normalized}`,    // 919876543210
    `0${normalized}`,     // 09876543210
  ];
};

// Cache key for contact results
const getCacheKey = (userId: string) => `contacts:${userId}`;
const getMatchCacheKey = (hash: string) => `contact_match:${hash}`;

// Generate hash for phone batch (for caching)
const generateBatchHash = (phones: string[]): string => {
  return phones.sort().join(',');
};

// Contact worker with WhatsApp-level intelligence
export const contactWorker = new Worker(
  'contact-sync',
  async (job: Job<ContactSyncJob>) => {
    const { userId, phones, batchIndex, totalBatches } = job.data;

    console.log(`[ContactWorker] Processing batch ${batchIndex + 1}/${totalBatches} for user ${userId}`);

    try {
      const redis = getIORedisClient();
      
      // Check Redis cache first (WhatsApp principle: never compute twice)
      if (redis) {
        const batchHash = generateBatchHash(phones);
        const cacheKey = getMatchCacheKey(batchHash);
        const cached = await redis.get(cacheKey);
        
        if (cached) {
          const cachedResults = JSON.parse(cached);
          console.log(`[ContactWorker] Cache HIT for batch ${batchIndex + 1}: ${cachedResults.length} matches`);
          
          // Stream cached results
          const io = (global as any).io;
          if (io) {
            io.to(userId).emit('contacts:chunk', cachedResults);
          }
          
          return {
            success: true,
            matched: cachedResults.length,
            batchIndex,
            cached: true,
          };
        }
      }

      // Build ALL phone variants for better matching (2-3x improvement)
      const allVariants: string[] = [];
      phones.forEach((p) => {
        allVariants.push(...buildPhoneVariants(p));
      });

      console.log(`[ContactWorker] Matching ${phones.length} phones (${allVariants.length} variants)`);

      // Query database with indexed lookup
      const matchedUsers = await User.find({
        phoneNumber: { $in: allVariants },
        _id: { $ne: userId },
        isPhoneVerified: true,
      })
        .select('_id name email phoneNumber avatar')
        .lean(); // Use lean() for better performance

      // Deduplicate by _id
      const seen = new Set<string>();
      const uniqueUsers = matchedUsers.filter((u) => {
        const id = u._id.toString();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      console.log(`[ContactWorker] Batch ${batchIndex + 1}: Found ${uniqueUsers.length} matches`);

      // Format results
      const result = uniqueUsers.map((u) => ({
        _id: u._id.toString(),
        name: u.name,
        email: u.email,
        phoneNumber: u.phoneNumber,
        avatar: u.avatar || null,
        matchedAt: new Date(),
      }));

      // Cache results in Redis (1 hour TTL)
      if (redis) {
        const batchHash = generateBatchHash(phones);
        const cacheKey = getMatchCacheKey(batchHash);
        await redis.setex(cacheKey, 3600, JSON.stringify(result));
        console.log(`[ContactWorker] Cached results for batch ${batchIndex + 1}`);
      }

      // Stream results via socket
      const io = (global as any).io;
      if (io) {
        io.to(userId).emit('contacts:chunk', result);
        console.log(`[ContactWorker] Emitted ${result.length} contacts to user ${userId}`);
      }

      // Update user's contact cache (append to existing)
      if (redis) {
        const userCacheKey = getCacheKey(userId);
        const existing = await redis.get(userCacheKey);
        const cached = existing ? JSON.parse(existing) : [];
        
        // Merge and deduplicate
        const merged = [...cached, ...result];
        const deduped = Array.from(
          new Map(merged.map(item => [item._id, item])).values()
        );

        // Cache for 1 hour
        await redis.setex(userCacheKey, 3600, JSON.stringify(deduped));
        console.log(`[ContactWorker] Updated user cache: ${deduped.length} total contacts`);
      }

      // Update job progress
      await job.updateProgress((batchIndex + 1) / totalBatches * 100);

      return {
        success: true,
        matched: result.length,
        batchIndex,
        cached: false,
      };
    } catch (error: any) {
      console.error(`[ContactWorker] Error processing batch ${batchIndex}:`, error);
      throw error; // Will trigger retry
    }
  },
  {
    connection: getIORedisClient() || undefined,
    concurrency: 5, // Process 5 batches concurrently
    limiter: {
      max: 10, // Max 10 jobs per second
      duration: 1000,
    },
  }
);

// Worker event handlers
contactWorker.on('completed', (job) => {
  const result = job.returnvalue;
  const cacheStatus = result.cached ? '(cached)' : '(computed)';
  console.log(`[ContactWorker] Job ${job.id} completed: ${result.matched} matches ${cacheStatus}`);
});

contactWorker.on('failed', (job, err) => {
  console.error(`[ContactWorker] Job ${job?.id} failed:`, err.message);
});

contactWorker.on('error', (err) => {
  console.error('[ContactWorker] Worker error:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[ContactWorker] Shutting down gracefully...');
  await contactWorker.close();
});

export default contactWorker;

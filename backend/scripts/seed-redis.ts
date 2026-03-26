/**
 * Redis Seeding Script
 * 
 * Seeds Redis with:
 * - Sequence numbers for all conversations
 * - User presence data
 * - Cache warming for hot data
 * - Rate limit counters initialization
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { redis, getIORedisClient } from '../config/redis.js';
import Conversation from '../modals/Conversation.js';
import Message from '../modals/Message.js';
import User from '../modals/userModal.js';
import { logger } from '../utils/logger.js';

dotenv.config();

async function seedRedis() {
  console.log('='.repeat(60));
  console.log('REDIS SEEDING SCRIPT');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Connect to MongoDB
    console.log('📦 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('✅ MongoDB connected');
    console.log('');

    // Check Redis connection
    const ioredis = getIORedisClient();
    const redisConnected = ioredis !== null;
    console.log(`📦 Redis Status: ${redisConnected ? '✅ Connected' : '⚠️  Using in-memory fallback'}`);
    console.log('');

    // ========================================================================
    // 1. SEED SEQUENCE NUMBERS
    // ========================================================================
    console.log('🔢 Seeding sequence numbers...');
    
    const conversations = await Conversation.find({}).select('_id');
    console.log(`Found ${conversations.length} conversations`);

    let seededSequences = 0;
    for (const conv of conversations) {
      const convId = conv._id.toString();
      
      // Get highest sequence number for this conversation
      const lastMessage = await Message.findOne({ 
        conversationId: convId,
        seq: { $exists: true, $ne: null }
      })
      .sort({ seq: -1 })
      .select('seq');

      const maxSeq = lastMessage?.seq || 0;
      
      // Set sequence in Redis
      const seqKey = `seq:${convId}`;
      await redis.set(seqKey, maxSeq.toString());
      
      seededSequences++;
      if (seededSequences % 10 === 0) {
        process.stdout.write(`\r  Seeded ${seededSequences}/${conversations.length} sequences...`);
      }
    }
    console.log(`\r✅ Seeded ${seededSequences} sequence numbers`);
    console.log('');

    // ========================================================================
    // 2. SEED USER PRESENCE
    // ========================================================================
    console.log('👥 Seeding user presence data...');
    
    const users = await User.find({}).select('_id name email');
    console.log(`Found ${users.length} users`);

    let seededPresence = 0;
    for (const user of users) {
      const userId = user._id.toString();
      const presenceKey = `presence:${userId}`;
      
      // Set initial presence as offline
      await redis.set(presenceKey, JSON.stringify({
        userId,
        status: 'offline',
        lastSeen: new Date().toISOString(),
      }), { ex: 86400 }); // 24 hour TTL

      seededPresence++;
    }
    console.log(`✅ Seeded ${seededPresence} user presence records`);
    console.log('');

    // ========================================================================
    // 3. WARM CACHE WITH HOT DATA
    // ========================================================================
    console.log('🔥 Warming cache with hot data...');
    
    // Cache recent conversations (last 24 hours)
    const recentConversations = await Conversation.find({
      updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
    .populate('participants', 'name avatar email')
    .populate('lastMessage')
    .limit(100)
    .lean();

    for (const conv of recentConversations) {
      const cacheKey = `cache:conversation:${conv._id}`;
      await redis.set(cacheKey, JSON.stringify(conv), { ex: 3600 }); // 1 hour TTL
    }
    console.log(`✅ Cached ${recentConversations.length} recent conversations`);
    console.log('');

    // ========================================================================
    // 4. INITIALIZE RATE LIMIT COUNTERS
    // ========================================================================
    console.log('⏱️  Initializing rate limit counters...');
    
    // Pre-warm rate limit keys (prevents cold start issues)
    const rateLimitKeys = [
      'ratelimit:login',
      'ratelimit:register',
      'ratelimit:otp',
      'ratelimit:message',
    ];

    for (const key of rateLimitKeys) {
      await redis.set(key, '0', { ex: 60 });
    }
    console.log(`✅ Initialized ${rateLimitKeys.length} rate limit counters`);
    console.log('');

    // ========================================================================
    // 5. STATISTICS
    // ========================================================================
    console.log('📊 SEEDING STATISTICS:');
    console.log(`  Conversations: ${conversations.length}`);
    console.log(`  Sequence Numbers: ${seededSequences}`);
    console.log(`  User Presence: ${seededPresence}`);
    console.log(`  Cached Conversations: ${recentConversations.length}`);
    console.log(`  Rate Limit Keys: ${rateLimitKeys.length}`);
    console.log('');

    console.log('='.repeat(60));
    console.log('✅ REDIS SEEDING COMPLETE');
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('❌ Seeding failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

// Run seeding
seedRedis();

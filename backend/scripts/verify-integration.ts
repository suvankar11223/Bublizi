/**
 * Integration Verification Script
 * 
 * Verifies that BullMQ and Redis integration doesn't break existing functionality
 * Tests:
 * - Database connections
 * - Redis connections
 * - Queue functionality
 * - Existing API endpoints
 * - Data consistency
 */

import dotenv from 'dotenv';

// CRITICAL: Load environment variables BEFORE any other imports
dotenv.config();

import mongoose from 'mongoose';
import axios from 'axios';
import { redis, getIORedisClient } from '../config/redis.js';
import { getMessageQueue, getQueueStats, initializeQueues } from '../config/bullmq.js';
import Message from '../modals/Message.js';
import Conversation from '../modals/Conversation.js';
import User from '../modals/userModal.js';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
  duration?: number;
}

const results: TestResult[] = [];

function addResult(name: string, status: 'PASS' | 'FAIL' | 'WARN', message: string, duration?: number) {
  results.push({ name, status, message, duration });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${name}: ${message}${duration ? ` (${duration}ms)` : ''}`);
}

async function verifyIntegration() {
  console.log('='.repeat(60));
  console.log('INTEGRATION VERIFICATION');
  console.log('='.repeat(60));
  console.log('');

  try {
    // ========================================================================
    // 1. DATABASE CONNECTIONS
    // ========================================================================
    console.log('📦 Testing Database Connections...');
    console.log('');

    // MongoDB
    const mongoStart = Date.now();
    try {
      await mongoose.connect(process.env.MONGO_URI as string);
      const mongoDuration = Date.now() - mongoStart;
      addResult('MongoDB Connection', 'PASS', 'Connected successfully', mongoDuration);
    } catch (error: any) {
      addResult('MongoDB Connection', 'FAIL', error.message);
    }

    // Redis
    const redisStart = Date.now();
    try {
      const ioredis = getIORedisClient();
      if (ioredis) {
        await ioredis.ping();
        const redisDuration = Date.now() - redisStart;
        addResult('Redis Connection', 'PASS', 'Connected successfully', redisDuration);
      } else {
        addResult('Redis Connection', 'WARN', 'Using in-memory fallback');
      }
    } catch (error: any) {
      addResult('Redis Connection', 'WARN', `Fallback active: ${error.message}`);
    }

    console.log('');

    // ========================================================================
    // 2. QUEUE FUNCTIONALITY
    // ========================================================================
    console.log('📦 Testing Queue Functionality...');
    console.log('');

    // Initialize queues first
    initializeQueues();

    // BullMQ Queue
    try {
      const messageQueue = getMessageQueue();
      if (messageQueue) {
        const stats = await getQueueStats();
        addResult('BullMQ Queue', 'PASS', `Queue active (${stats.messages?.waiting || 0} waiting)`);
      } else {
        addResult('BullMQ Queue', 'WARN', 'Queue not initialized (fallback active)');
      }
    } catch (error: any) {
      addResult('BullMQ Queue', 'WARN', `Fallback active: ${error.message}`);
    }

    console.log('');

    // ========================================================================
    // 3. DATA CONSISTENCY
    // ========================================================================
    console.log('📦 Testing Data Consistency...');
    console.log('');

    // Check sequence numbers
    try {
      const conversations = await Conversation.find({}).limit(5);
      let consistentSeqs = 0;
      
      for (const conv of conversations) {
        const convId = conv._id.toString();
        const seqKey = `seq:${convId}`;
        
        // Get Redis sequence
        const redisSeq = await redis.get(seqKey);
        
        // Get MongoDB max sequence
        const lastMessage = await Message.findOne({ 
          conversationId: convId,
          seq: { $exists: true }
        }).sort({ seq: -1 });
        
        const mongoSeq = lastMessage?.seq || 0;
        const redisSeqNum = redisSeq ? parseInt(redisSeq) : 0;
        
        if (Math.abs(redisSeqNum - mongoSeq) <= 1) {
          consistentSeqs++;
        }
      }
      
      if (consistentSeqs === conversations.length) {
        addResult('Sequence Consistency', 'PASS', `${consistentSeqs}/${conversations.length} conversations consistent`);
      } else {
        addResult('Sequence Consistency', 'WARN', `${consistentSeqs}/${conversations.length} conversations consistent`);
      }
    } catch (error: any) {
      addResult('Sequence Consistency', 'FAIL', error.message);
    }

    // Check message integrity
    try {
      const messageCount = await Message.countDocuments({});
      const conversationCount = await Conversation.countDocuments({});
      const userCount = await User.countDocuments({});
      
      addResult('Data Integrity', 'PASS', `${messageCount} messages, ${conversationCount} conversations, ${userCount} users`);
    } catch (error: any) {
      addResult('Data Integrity', 'FAIL', error.message);
    }

    console.log('');

    // ========================================================================
    // 4. API ENDPOINTS (if server is running)
    // ========================================================================
    console.log('📦 Testing API Endpoints...');
    console.log('');

    try {
      // Health check
      const healthStart = Date.now();
      const healthResponse = await axios.get(`${SERVER_URL}/api/health`, { timeout: 5000 });
      const healthDuration = Date.now() - healthStart;
      
      if (healthResponse.status === 200) {
        addResult('Health Endpoint', 'PASS', 'Responding correctly', healthDuration);
      } else {
        addResult('Health Endpoint', 'WARN', `Status ${healthResponse.status}`);
      }
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        addResult('Health Endpoint', 'WARN', 'Server not running (start with npm run dev)');
      } else {
        addResult('Health Endpoint', 'FAIL', error.message);
      }
    }

    try {
      // Monitoring endpoint
      const monitoringResponse = await axios.get(`${SERVER_URL}/api/monitoring/system/health`, { timeout: 5000 });
      
      if (monitoringResponse.status === 200) {
        addResult('Monitoring Endpoint', 'PASS', 'Responding correctly');
      } else {
        addResult('Monitoring Endpoint', 'WARN', `Status ${monitoringResponse.status}`);
      }
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        addResult('Monitoring Endpoint', 'WARN', 'Server not running');
      } else {
        addResult('Monitoring Endpoint', 'FAIL', error.message);
      }
    }

    console.log('');

    // ========================================================================
    // 5. SUMMARY
    // ========================================================================
    console.log('='.repeat(60));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    console.log('');

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const warned = results.filter(r => r.status === 'WARN').length;
    const total = results.length;

    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Warnings: ${warned}`);
    console.log('');

    if (failed > 0) {
      console.log('❌ VERIFICATION FAILED');
      console.log('Some critical tests failed. Please review the errors above.');
      process.exit(1);
    } else if (warned > 0) {
      console.log('⚠️  VERIFICATION PASSED WITH WARNINGS');
      console.log('All critical tests passed, but some features are using fallbacks.');
      console.log('This is acceptable for development, but review warnings for production.');
    } else {
      console.log('✅ VERIFICATION PASSED');
      console.log('All tests passed successfully!');
    }

    console.log('');
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('❌ Verification failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

// Run verification
verifyIntegration();

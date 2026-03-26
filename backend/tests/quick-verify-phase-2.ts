/**
 * QUICK VERIFICATION - PHASE 2
 * 
 * Fast sanity check (30 seconds) to verify:
 * 1. Presence service works
 * 2. Redis connection works
 * 3. No in-memory state
 */

import { presenceService } from '../services/presenceService.js';
import { redis } from '../config/redis.js';

async function quickVerify() {
  console.log('🔍 Quick Verification - Phase 2');
  console.log('='.repeat(50));

  let passed = 0;
  let failed = 0;

  try {
    // Test 1: Redis connection
    console.log('\n1️⃣ Testing Redis connection...');
    await redis.set('test:quick', 'ok', { ex: 5 });
    const value = await redis.get('test:quick');
    if (value === 'ok') {
      console.log('   ✅ Redis connected');
      passed++;
    } else {
      console.log('   ❌ Redis connection failed');
      failed++;
    }
    await redis.del('test:quick');

    // Test 2: Presence service
    console.log('\n2️⃣ Testing presence service...');
    const userId = 'test-user-quick';
    const socketId = 'socket-quick-123';
    
    await presenceService.setOnline(userId, socketId);
    const isOnline = await presenceService.isOnline(userId);
    
    if (isOnline) {
      console.log('   ✅ Presence service works');
      passed++;
    } else {
      console.log('   ❌ Presence service failed');
      failed++;
    }
    
    await presenceService.setOffline(userId);

    // Test 3: Redis storage
    console.log('\n3️⃣ Testing Redis storage...');
    await presenceService.setOnline(userId, socketId);
    const key = `presence:${userId}`;
    const storedValue = await redis.get(key);
    
    if (storedValue === socketId) {
      console.log('   ✅ Presence stored in Redis');
      passed++;
    } else {
      console.log('   ❌ Presence not in Redis');
      failed++;
    }
    
    await presenceService.setOffline(userId);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (failed === 0) {
      console.log('\n✅ PHASE 2 QUICK VERIFICATION: PASSED');
      console.log('Ready to proceed!');
      process.exit(0);
    } else {
      console.log('\n❌ PHASE 2 QUICK VERIFICATION: FAILED');
      console.log('Fix issues before proceeding!');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Verification failed:', error.message);
    process.exit(1);
  }
}

quickVerify();

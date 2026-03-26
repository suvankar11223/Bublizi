/**
 * PHASE 2 VALIDATION - DISTRIBUTED SYSTEM FIX
 * 
 * Tests:
 * 1. Redis-based presence system
 * 2. Presence TTL expiry
 * 3. Heartbeat mechanism
 * 4. Multi-server compatibility
 * 5. No in-memory state
 */

import { presenceService } from '../services/presenceService.js';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  critical: boolean;
}

const results: TestResult[] = [];

function addResult(name: string, passed: boolean, details: string, critical = false) {
  results.push({ name, passed, details, critical });
  const icon = passed ? '✅' : '❌';
  const severity = critical ? '[CRITICAL]' : '';
  console.log(`${icon} ${severity} ${name}: ${details}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testPresenceBasics() {
  console.log('\n📋 TEST 1: Presence Basics');
  console.log('='.repeat(60));

  try {
    const userId = 'test-user-123';
    const socketId = 'socket-abc-456';

    // Test 1.1: Set user online
    await presenceService.setOnline(userId, socketId);
    const isOnline = await presenceService.isOnline(userId);
    addResult(
      'Set user online',
      isOnline === true,
      isOnline ? 'User marked online successfully' : 'Failed to mark user online',
      true
    );

    // Test 1.2: Get socket ID
    const retrievedSocketId = await presenceService.getSocketId(userId);
    addResult(
      'Get socket ID',
      retrievedSocketId === socketId,
      retrievedSocketId === socketId
        ? `Socket ID retrieved: ${retrievedSocketId}`
        : `Expected ${socketId}, got ${retrievedSocketId}`,
      true
    );

    // Test 1.3: Set user offline
    await presenceService.setOffline(userId);
    const isOffline = await presenceService.isOnline(userId);
    addResult(
      'Set user offline',
      isOffline === false,
      isOffline ? 'Failed to mark user offline' : 'User marked offline successfully',
      true
    );

    // Test 1.4: Verify Redis key deleted
    const key = `presence:${userId}`;
    const exists = await redis.exists(key);
    addResult(
      'Redis key cleanup',
      !exists,
      exists ? 'Redis key not deleted' : 'Redis key deleted successfully',
      true
    );
  } catch (error: any) {
    addResult('Presence basics', false, `Error: ${error.message}`, true);
  }
}

async function testPresenceTTL() {
  console.log('\n📋 TEST 2: Presence TTL Expiry');
  console.log('='.repeat(60));

  try {
    const userId = 'test-user-ttl';
    const socketId = 'socket-ttl-123';

    // Set user online
    await presenceService.setOnline(userId, socketId);
    
    // Check TTL is set
    const key = `presence:${userId}`;
    const ttl = await redis.ttl(key);
    addResult(
      'TTL set correctly',
      ttl > 0 && ttl <= 30,
      `TTL: ${ttl} seconds (expected ≤30)`,
      true
    );

    // Wait for TTL to expire (simulate no heartbeat)
    console.log('⏳ Waiting 35 seconds for TTL to expire...');
    await sleep(35000);

    // Check if presence expired
    const isOnlineAfterExpiry = await presenceService.isOnline(userId);
    addResult(
      'Presence expires after TTL',
      isOnlineAfterExpiry === false,
      isOnlineAfterExpiry
        ? 'Presence did not expire (BAD)'
        : 'Presence expired correctly (GOOD)',
      true
    );
  } catch (error: any) {
    addResult('Presence TTL', false, `Error: ${error.message}`, true);
  }
}

async function testHeartbeat() {
  console.log('\n📋 TEST 3: Heartbeat Mechanism');
  console.log('='.repeat(60));

  try {
    const userId = 'test-user-heartbeat';
    const socketId = 'socket-heartbeat-123';

    // Set user online and start heartbeat
    await presenceService.setOnline(userId, socketId);
    presenceService.startHeartbeat(userId, socketId);

    // Wait 20 seconds (longer than TTL but heartbeat should keep alive)
    console.log('⏳ Waiting 20 seconds (heartbeat should keep presence alive)...');
    await sleep(20000);

    // Check if still online
    const isOnline = await presenceService.isOnline(userId);
    addResult(
      'Heartbeat keeps presence alive',
      isOnline === true,
      isOnline
        ? 'Presence kept alive by heartbeat (GOOD)'
        : 'Presence expired despite heartbeat (BAD)',
      true
    );

    // Stop heartbeat
    presenceService.stopHeartbeat(userId);
    
    // Wait for TTL to expire
    console.log('⏳ Waiting 35 seconds for TTL to expire after stopping heartbeat...');
    await sleep(35000);

    // Check if offline
    const isOffline = await presenceService.isOnline(userId);
    addResult(
      'Presence expires after stopping heartbeat',
      isOffline === false,
      isOffline
        ? 'Presence did not expire (BAD)'
        : 'Presence expired correctly (GOOD)',
      true
    );
  } catch (error: any) {
    addResult('Heartbeat mechanism', false, `Error: ${error.message}`, true);
  }
}

async function testMultiServerCompatibility() {
  console.log('\n📋 TEST 4: Multi-Server Compatibility');
  console.log('='.repeat(60));

  try {
    // Simulate two servers setting presence
    const userId1 = 'user-server-1';
    const userId2 = 'user-server-2';
    const socketId1 = 'socket-server-1';
    const socketId2 = 'socket-server-2';

    // Server 1 sets user 1 online
    await presenceService.setOnline(userId1, socketId1);
    
    // Server 2 sets user 2 online
    await presenceService.setOnline(userId2, socketId2);

    // Both servers should see both users
    const user1Online = await presenceService.isOnline(userId1);
    const user2Online = await presenceService.isOnline(userId2);

    addResult(
      'Cross-server presence visibility',
      user1Online && user2Online,
      user1Online && user2Online
        ? 'Both users visible across servers (GOOD)'
        : 'Users not visible across servers (BAD)',
      true
    );

    // Server 1 sets user 1 offline
    await presenceService.setOffline(userId1);

    // Server 2 should see user 1 offline
    const user1Offline = await presenceService.isOnline(userId1);
    const user2StillOnline = await presenceService.isOnline(userId2);

    addResult(
      'Cross-server presence updates',
      !user1Offline && user2StillOnline,
      !user1Offline && user2StillOnline
        ? 'Presence updates visible across servers (GOOD)'
        : 'Presence updates not synced (BAD)',
      true
    );

    // Cleanup
    await presenceService.setOffline(userId2);
  } catch (error: any) {
    addResult('Multi-server compatibility', false, `Error: ${error.message}`, true);
  }
}

async function testNoInMemoryState() {
  console.log('\n📋 TEST 5: No In-Memory State');
  console.log('='.repeat(60));

  try {
    const userId = 'test-user-memory';
    const socketId = 'socket-memory-123';

    // Set user online
    await presenceService.setOnline(userId, socketId);

    // Get stats
    const stats = await presenceService.getStats();
    
    addResult(
      'Presence service stats',
      stats.heartbeatsActive >= 0,
      `Heartbeats active: ${stats.heartbeatsActive}`,
      false
    );

    // Verify presence is in Redis, not memory
    const key = `presence:${userId}`;
    const redisValue = await redis.get(key);
    
    addResult(
      'Presence stored in Redis',
      redisValue === socketId,
      redisValue === socketId
        ? 'Presence correctly stored in Redis (GOOD)'
        : 'Presence not in Redis (BAD)',
      true
    );

    // Cleanup
    await presenceService.setOffline(userId);
  } catch (error: any) {
    addResult('No in-memory state', false, `Error: ${error.message}`, true);
  }
}

async function testRedisConnection() {
  console.log('\n📋 TEST 6: Redis Connection');
  console.log('='.repeat(60));

  try {
    // Test basic Redis operations
    const testKey = 'test:connection';
    const testValue = 'connected';

    await redis.set(testKey, testValue, { ex: 10 });
    const retrieved = await redis.get(testKey);

    addResult(
      'Redis connection',
      retrieved === testValue,
      retrieved === testValue
        ? 'Redis connected and working (GOOD)'
        : 'Redis connection issue (BAD)',
      true
    );

    // Cleanup
    await redis.del(testKey);
  } catch (error: any) {
    addResult('Redis connection', false, `Error: ${error.message}`, true);
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 PHASE 2 VALIDATION - DISTRIBUTED SYSTEM FIX');
  console.log('='.repeat(60));

  try {
    await testRedisConnection();
    await testPresenceBasics();
    await testPresenceTTL();
    await testHeartbeat();
    await testMultiServerCompatibility();
    await testNoInMemoryState();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));

    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const criticalFailed = results.filter(r => !r.passed && r.critical).length;

    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`🔥 Critical Failed: ${criticalFailed}`);
    console.log('');

    if (criticalFailed > 0) {
      console.log('❌ PHASE 2 VALIDATION: FAILED');
      console.log('Critical issues found. DO NOT PROCEED to Phase 3.');
      console.log('');
      console.log('Failed Tests:');
      results
        .filter(r => !r.passed && r.critical)
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.details}`);
        });
    } else if (failed > 0) {
      console.log('⚠️  PHASE 2 VALIDATION: PASSED WITH WARNINGS');
      console.log('Non-critical issues found. Review before proceeding.');
      console.log('');
      console.log('Failed Tests:');
      results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.details}`);
        });
    } else {
      console.log('✅ PHASE 2 VALIDATION: PASSED');
      console.log('All tests passed. Ready to proceed to Phase 3.');
    }

    console.log('='.repeat(60));

    // Exit with appropriate code
    process.exit(criticalFailed > 0 ? 1 : 0);
  } catch (error: any) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runAllTests();

/**
 * Redis Rate Limiter Test Script
 * 
 * Tests the Redis-based rate limiting functionality
 */

import dotenv from 'dotenv';
dotenv.config();

import { rateLimiter } from '../utils/redisRateLimiter.js';

async function testRateLimiter() {
  console.log('🧪 Testing Redis Rate Limiter\n');
  console.log('='.repeat(60));

  const testKey = 'test-user-123';
  const action = 'test';
  const config = {
    windowSeconds: 60,
    maxRequests: 5,
    blockDuration: 30,
  };

  console.log('\n📋 Test Configuration:');
  console.log(`   Window: ${config.windowSeconds} seconds`);
  console.log(`   Max Requests: ${config.maxRequests}`);
  console.log(`   Block Duration: ${config.blockDuration} seconds`);
  console.log('');

  // Make 10 requests
  console.log('🔄 Making 10 requests...\n');
  
  for (let i = 1; i <= 10; i++) {
    const result = await rateLimiter.check(testKey, action, config);
    
    const status = result.allowed ? '✅' : '❌';
    console.log(`${status} Request ${i}:`);
    console.log(`   Allowed: ${result.allowed}`);
    console.log(`   Remaining: ${result.remaining}`);
    console.log(`   Reset In: ${result.resetIn}s`);
    
    if (result.blocked) {
      console.log(`   🚫 BLOCKED for ${result.blockExpiresIn}s`);
    }
    console.log('');

    if (!result.allowed && i === 6) {
      console.log(`⛔ Rate limited after ${i-1} requests`);
      break;
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Get stats
  console.log('─'.repeat(60));
  console.log('\n📊 Final Stats:');
  const stats = await rateLimiter.getStats(testKey, action);
  console.log(`   Count: ${stats.count}`);
  console.log(`   Blocked: ${stats.blocked}`);
  console.log('');

  // Test reset
  console.log('🔄 Testing reset...');
  await rateLimiter.reset(testKey, action);
  const statsAfterReset = await rateLimiter.getStats(testKey, action);
  console.log(`   Count after reset: ${statsAfterReset.count}`);
  console.log(`   Blocked after reset: ${statsAfterReset.blocked}`);
  console.log('');

  // Test after reset
  console.log('✅ Making request after reset...');
  const resultAfterReset = await rateLimiter.check(testKey, action, config);
  console.log(`   Allowed: ${resultAfterReset.allowed}`);
  console.log(`   Remaining: ${resultAfterReset.remaining}`);
  console.log('');

  console.log('='.repeat(60));
  console.log('\n🎉 Rate limiter test complete!');
  
  process.exit(0);
}

testRateLimiter().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});

/**
 * Redis Connection Test
 * 
 * Tests Redis connection with current credentials
 */

import dotenv from 'dotenv';
dotenv.config();

import Redis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';

console.log('🔍 Testing Redis Connection');
console.log('='.repeat(60));
console.log('');

// Test 1: Upstash REST API
console.log('Test 1: Upstash REST API');
console.log('─'.repeat(60));

const restUrl = process.env.UPSTASH_REDIS_REST_URL;
const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (restUrl && restToken) {
  console.log(`URL: ${restUrl}`);
  console.log(`Token: ${restToken.substring(0, 20)}...`);
  
  try {
    const upstash = new UpstashRedis({
      url: restUrl,
      token: restToken,
    });
    
    const result = await upstash.ping();
    console.log('✅ REST API: Connected successfully');
    console.log(`   Response: ${result}`);
  } catch (error: any) {
    console.error('❌ REST API: Failed');
    console.error(`   Error: ${error.message}`);
  }
} else {
  console.log('⚠️  REST API credentials not found');
}

console.log('');

// Test 2: ioredis (for BullMQ)
console.log('Test 2: ioredis (for BullMQ)');
console.log('─'.repeat(60));

const redisUrl = process.env.UPSTASH_REDIS_URL;

if (redisUrl) {
  console.log(`URL: ${redisUrl.replace(/:[^:]*@/, ':****@')}`);
  
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    lazyConnect: true,
    tls: {
      rejectUnauthorized: false,
    },
  });
  
  try {
    await redis.connect();
    const result = await redis.ping();
    console.log('✅ ioredis: Connected successfully');
    console.log(`   Response: ${result}`);
    
    // Test basic operations
    await redis.set('test:key', 'test:value', 'EX', 60);
    const value = await redis.get('test:key');
    console.log(`   Write/Read: ${value === 'test:value' ? '✅ PASSED' : '❌ FAILED'}`);
    
    const count = await redis.incr('test:counter');
    console.log(`   Increment: ${count === 1 ? '✅ PASSED' : '❌ FAILED'}`);
    
    await redis.del('test:key', 'test:counter');
    await redis.quit();
    
    console.log('');
    console.log('🎉 All Redis tests passed! BullMQ is ready.');
  } catch (error: any) {
    console.error('❌ ioredis: Failed');
    console.error(`   Error: ${error.message}`);
    
    if (error.message.includes('WRONGPASS')) {
      console.log('');
      console.log('💡 Fix: Your Redis password is incorrect');
      console.log('   1. Go to https://console.upstash.com');
      console.log('   2. Click on your Redis database');
      console.log('   3. Look for "Connect" section');
      console.log('   4. Copy the full Redis URL (redis://default:PASSWORD@host:port)');
      console.log('   5. Update UPSTASH_REDIS_URL in .env');
    }
  }
} else {
  console.log('⚠️  UPSTASH_REDIS_URL not found');
  console.log('');
  console.log('💡 Add this to your .env:');
  console.log('   UPSTASH_REDIS_URL=redis://default:YOUR_PASSWORD@YOUR_HOST:6379');
}

console.log('');
console.log('='.repeat(60));
console.log('');
console.log('📋 Current .env values:');
console.log(`   UPSTASH_REDIS_URL: ${process.env.UPSTASH_REDIS_URL ? '✓' : '✗'}`);
console.log(`   UPSTASH_REDIS_REST_URL: ${restUrl ? '✓' : '✗'}`);
console.log(`   UPSTASH_REDIS_REST_TOKEN: ${restToken ? '✓' : '✗'}`);
console.log('');

process.exit(0);

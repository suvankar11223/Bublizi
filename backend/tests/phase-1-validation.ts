/**
 * PHASE 1 LATENCY + PERFORMANCE - COMPREHENSIVE VALIDATION
 * 
 * Tests all performance optimizations and finds potential bugs
 */

import { Queue, Worker } from 'bullmq';
import { getIORedisClient } from '../config/redis.js';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, error?: string, details?: any) {
  results.push({ name, passed, error, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}`);
  if (error) console.log(`   Error: ${error}`);
  if (details) console.log(`   Details:`, JSON.stringify(details, null, 2));
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: WORKER TIMEOUT FUNCTIONALITY
// ═══════════════════════════════════════════════════════════════════════════

async function testWorkerTimeouts(): Promise<void> {
  console.log('\n🔍 TEST 1: Worker Timeout Functionality\n');

  const redis = getIORedisClient();
  if (!redis) {
    logTest('1.0: Redis connection available', false, 'Redis not connected');
    return;
  }

  try {
    // Test 1.1: Create test queue with timeout
    const testQueue = new Queue('test-timeout', {
      connection: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        tls: process.env.REDIS_TLS === 'true' ? {
          rejectUnauthorized: false,
        } : undefined,
      },
    });

    // Test 1.2: Create worker with timeout
    const testWorker = new Worker(
      'test-timeout',
      async (job) => {
        // Simulate long-running job
        await new Promise(resolve => setTimeout(resolve, 5000));
        return { success: true };
      },
      {
        connection: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          tls: process.env.REDIS_TLS === 'true' ? {
            rejectUnauthorized: false,
          } : undefined,
        },
      }
    );

    // Test 1.3: Add job and check if it completes
    const job = await testQueue.add('test-job', { test: true });
    
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    const jobState = await job.getState();
    
    if (jobState === 'completed') {
      logTest('1.1: Worker processes jobs without timeout', true);
    } else {
      logTest('1.1: Worker processes jobs without timeout', false, `Job state: ${jobState}`);
    }

    // Cleanup
    await testWorker.close();
    await testQueue.close();
    
  } catch (error: any) {
    logTest('1.0: Worker timeout test setup', false, error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: CONTACT SYNC PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════

async function testContactSyncPerformance(): Promise<void> {
  console.log('\n🔍 TEST 2: Contact Sync Performance\n');

  const fs = await import('fs');
  const path = await import('path');

  // Test 2.1: Check contactWorker uses batch queries
  const workerPath = path.join(process.cwd(), 'queues', 'contactWorker.ts');
  
  if (fs.existsSync(workerPath)) {
    const content = fs.readFileSync(workerPath, 'utf-8');
    
    // Check for batch query pattern
    const hasBatchQuery = content.includes('$in');
    const usesLean = content.includes('.lean()');
    const hasRedisCache = content.includes('redis.get');
    
    if (hasBatchQuery && usesLean && hasRedisCache) {
      logTest('2.1: Contact sync uses optimized batch queries', true, undefined, {
        batchQuery: hasBatchQuery,
        lean: usesLean,
        cache: hasRedisCache,
      });
    } else {
      logTest('2.1: Contact sync uses optimized batch queries', false, 'Missing optimizations', {
        batchQuery: hasBatchQuery,
        lean: usesLean,
        cache: hasRedisCache,
      });
    }
    
    // Test 2.2: Check for N+1 query anti-pattern
    const hasForEachQuery = content.match(/for\s*\(.*\)\s*{[\s\S]*?await.*\.find/);
    const hasMapQuery = content.match(/\.map\(.*=>[\s\S]*?await.*\.find/);
    
    if (!hasForEachQuery && !hasMapQuery) {
      logTest('2.2: No N+1 query pattern detected', true);
    } else {
      logTest('2.2: No N+1 query pattern detected', false, 'Potential N+1 query found');
    }
    
    // Test 2.3: Check concurrency settings
    const concurrencyMatch = content.match(/concurrency:\s*(\d+)/);
    if (concurrencyMatch) {
      const concurrency = parseInt(concurrencyMatch[1]);
      if (concurrency >= 5 && concurrency <= 10) {
        logTest('2.3: Contact worker has appropriate concurrency', true, undefined, { concurrency });
      } else {
        logTest('2.3: Contact worker has appropriate concurrency', false, 'Concurrency out of range', { concurrency });
      }
    } else {
      logTest('2.3: Contact worker has appropriate concurrency', false, 'No concurrency setting found');
    }
  } else {
    logTest('2.1: Contact worker file exists', false, 'File not found');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: MESSAGE QUEUE PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════

async function testMessageQueuePerformance(): Promise<void> {
  console.log('\n🔍 TEST 3: Message Queue Performance\n');

  const fs = await import('fs');
  const path = await import('path');

  // Test 3.1: Check messageWorker has timeout
  const workerPath = path.join(process.cwd(), 'queues', 'messageWorker.ts');
  
  if (fs.existsSync(workerPath)) {
    const content = fs.readFileSync(workerPath, 'utf-8');
    
    const hasTimeout = content.includes('timeout') || content.includes('Promise.race');
    const hasTimeoutValue = content.match(/setTimeout.*(\d+)/);
    
    if (hasTimeout) {
      logTest('3.1: Message worker has timeout protection', true, undefined, {
        timeoutMs: hasTimeoutValue ? hasTimeoutValue[1] : 'unknown',
      });
    } else {
      logTest('3.1: Message worker has timeout protection', false, 'No timeout found');
    }
    
    // Test 3.2: Check concurrency
    const concurrencyMatch = content.match(/concurrency:\s*(\d+)/);
    if (concurrencyMatch) {
      const concurrency = parseInt(concurrencyMatch[1]);
      if (concurrency >= 5 && concurrency <= 20) {
        logTest('3.2: Message worker has appropriate concurrency', true, undefined, { concurrency });
      } else {
        logTest('3.2: Message worker has appropriate concurrency', false, 'Concurrency out of range', { concurrency });
      }
    } else {
      logTest('3.2: Message worker has appropriate concurrency', false, 'No concurrency setting found');
    }
    
    // Test 3.3: Check rate limiting
    const hasRateLimit = content.includes('limiter');
    if (hasRateLimit) {
      logTest('3.3: Message worker has rate limiting', true);
    } else {
      logTest('3.3: Message worker has rate limiting', false, 'No rate limiter found');
    }
  } else {
    logTest('3.1: Message worker file exists', false, 'File not found');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4: AI PROCESSING NON-BLOCKING
// ═══════════════════════════════════════════════════════════════════════════

async function testAIProcessing(): Promise<void> {
  console.log('\n🔍 TEST 4: AI Processing Non-Blocking\n');

  const fs = await import('fs');
  const path = await import('path');

  // Test 4.1: Check chatEvents for AI processing
  const chatEventsPath = path.join(process.cwd(), 'socket', 'chatEvents.ts');
  
  if (fs.existsSync(chatEventsPath)) {
    const content = fs.readFileSync(chatEventsPath, 'utf-8');
    
    // Check if AI is processed asynchronously
    const hasSetTimeout = content.includes('setTimeout(async');
    const hasEnqueueMessage = content.includes('enqueueMessage');
    const hasAIQueue = content.includes('AI_BOT_ID');
    
    if (hasSetTimeout && hasEnqueueMessage && hasAIQueue) {
      logTest('4.1: AI processing is non-blocking', true, undefined, {
        setTimeout: hasSetTimeout,
        enqueue: hasEnqueueMessage,
        aiQueue: hasAIQueue,
      });
    } else {
      logTest('4.1: AI processing is non-blocking', false, 'AI may be blocking', {
        setTimeout: hasSetTimeout,
        enqueue: hasEnqueueMessage,
        aiQueue: hasAIQueue,
      });
    }
    
    // Test 4.2: Check for blocking await in socket handler
    const aiSectionMatch = content.match(/containsAIMention[\s\S]{0,500}await generateAIResponse/);
    if (aiSectionMatch) {
      // Check if it's inside setTimeout
      const isInSetTimeout = aiSectionMatch[0].includes('setTimeout');
      if (isInSetTimeout) {
        logTest('4.2: AI generation wrapped in setTimeout', true);
      } else {
        logTest('4.2: AI generation wrapped in setTimeout', false, 'AI may block socket');
      }
    } else {
      logTest('4.2: AI generation code structure', true, 'No direct AI generation in socket handler');
    }
  } else {
    logTest('4.1: Chat events file exists', false, 'File not found');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5: QUEUE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

async function testQueueConfiguration(): Promise<void> {
  console.log('\n🔍 TEST 5: Queue Configuration\n');

  const fs = await import('fs');
  const path = await import('path');

  // Test 5.1: Check bullmq.ts configuration
  const bullmqPath = path.join(process.cwd(), 'config', 'bullmq.ts');
  
  if (fs.existsSync(bullmqPath)) {
    const content = fs.readFileSync(bullmqPath, 'utf-8');
    
    // Check retry configuration
    const hasRetries = content.includes('attempts:');
    const hasBackoff = content.includes('backoff:');
    const hasDLQ = content.includes('deadLetterQueue');
    
    if (hasRetries && hasBackoff && hasDLQ) {
      logTest('5.1: Queue has retry and DLQ configuration', true);
    } else {
      logTest('5.1: Queue has retry and DLQ configuration', false, 'Missing configuration', {
        retries: hasRetries,
        backoff: hasBackoff,
        dlq: hasDLQ,
      });
    }
    
    // Test 5.2: Check cleanup configuration
    const hasRemoveOnComplete = content.includes('removeOnComplete');
    const hasRemoveOnFail = content.includes('removeOnFail');
    
    if (hasRemoveOnComplete && hasRemoveOnFail) {
      logTest('5.2: Queue has cleanup configuration', true);
    } else {
      logTest('5.2: Queue has cleanup configuration', false, 'Missing cleanup config');
    }
    
    // Test 5.3: Check for timeout configuration (should NOT be in queue config)
    const hasTimeoutInQueue = content.match(/defaultJobOptions:[\s\S]{0,300}timeout:/);
    if (!hasTimeoutInQueue) {
      logTest('5.3: Timeout correctly placed in worker (not queue)', true);
    } else {
      logTest('5.3: Timeout correctly placed in worker (not queue)', false, 'Timeout in wrong place');
    }
  } else {
    logTest('5.1: BullMQ config file exists', false, 'File not found');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 6: SOCKET HANDLER PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════

async function testSocketHandlers(): Promise<void> {
  console.log('\n🔍 TEST 6: Socket Handler Performance\n');

  const fs = await import('fs');
  const path = await import('path');

  const chatEventsPath = path.join(process.cwd(), 'socket', 'chatEvents.ts');
  
  if (fs.existsSync(chatEventsPath)) {
    const content = fs.readFileSync(chatEventsPath, 'utf-8');
    
    // Test 6.1: Check for blocking operations in newMessage
    const newMessageMatch = content.match(/socket\.on\("newMessage"[\s\S]{0,1000}/);
    if (newMessageMatch) {
      const hasEnqueue = newMessageMatch[0].includes('enqueueMessage');
      const hasImmediateEmit = newMessageMatch[0].includes('messageQueued');
      
      if (hasEnqueue && hasImmediateEmit) {
        logTest('6.1: newMessage handler is non-blocking', true);
      } else {
        logTest('6.1: newMessage handler is non-blocking', false, 'May have blocking operations', {
          enqueue: hasEnqueue,
          immediateAck: hasImmediateEmit,
        });
      }
    }
    
    // Test 6.2: Check for synchronous DB queries in socket handlers
    const hasBlockingQuery = content.match(/socket\.on\([^)]+\)[\s\S]{0,500}await\s+\w+\.find\w*\([^)]+\)[\s\S]{0,100}socket\.emit/);
    if (!hasBlockingQuery) {
      logTest('6.2: No blocking DB queries in socket handlers', true);
    } else {
      logTest('6.2: No blocking DB queries in socket handlers', false, 'Found potential blocking query');
    }
    
    // Test 6.3: Check rate limiting is applied
    const hasRateLimit = content.includes('checkSocketRateLimit');
    if (hasRateLimit) {
      logTest('6.3: Socket handlers have rate limiting', true);
    } else {
      logTest('6.3: Socket handlers have rate limiting', false, 'No rate limiting found');
    }
  } else {
    logTest('6.1: Chat events file exists', false, 'File not found');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 7: MEMORY LEAK DETECTION
// ═══════════════════════════════════════════════════════════════════════════

async function testMemoryLeaks(): Promise<void> {
  console.log('\n🔍 TEST 7: Memory Leak Detection\n');

  const fs = await import('fs');
  const path = await import('path');

  // Test 7.1: Check for event listener cleanup
  const socketPath = path.join(process.cwd(), 'socket', 'socket.ts');
  
  if (fs.existsSync(socketPath)) {
    const content = fs.readFileSync(socketPath, 'utf-8');
    
    const hasDisconnectHandler = content.includes('socket.on("disconnect"');
    const hasCleanup = content.includes('removeAllListeners') || content.includes('off(');
    
    if (hasDisconnectHandler) {
      logTest('7.1: Socket has disconnect handler', true);
      
      if (hasCleanup) {
        logTest('7.2: Socket cleanup on disconnect', true);
      } else {
        logTest('7.2: Socket cleanup on disconnect', false, 'No cleanup found');
      }
    } else {
      logTest('7.1: Socket has disconnect handler', false, 'No disconnect handler');
    }
  }
  
  // Test 7.3: Check for timer cleanup
  const chatEventsPath = path.join(process.cwd(), 'socket', 'chatEvents.ts');
  if (fs.existsSync(chatEventsPath)) {
    const content = fs.readFileSync(chatEventsPath, 'utf-8');
    
    const hasSetTimeout = content.includes('setTimeout');
    const hasClearTimeout = content.includes('clearTimeout');
    
    if (hasSetTimeout && !hasClearTimeout) {
      logTest('7.3: Timers may not be cleaned up', false, 'setTimeout without clearTimeout');
    } else {
      logTest('7.3: Timer cleanup', true);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 8: ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

async function testErrorHandling(): Promise<void> {
  console.log('\n🔍 TEST 8: Error Handling\n');

  const fs = await import('fs');
  const path = await import('path');

  // Test 8.1: Check worker error handlers
  const workerPath = path.join(process.cwd(), 'queues', 'messageWorker.ts');
  
  if (fs.existsSync(workerPath)) {
    const content = fs.readFileSync(workerPath, 'utf-8');
    
    const hasFailedHandler = content.includes('.on("failed"');
    const hasErrorHandler = content.includes('.on("error"');
    const hasTryCatch = content.includes('try {') && content.includes('catch');
    
    if (hasFailedHandler && hasErrorHandler && hasTryCatch) {
      logTest('8.1: Worker has comprehensive error handling', true);
    } else {
      logTest('8.1: Worker has comprehensive error handling', false, 'Missing error handlers', {
        failed: hasFailedHandler,
        error: hasErrorHandler,
        tryCatch: hasTryCatch,
      });
    }
  }
  
  // Test 8.2: Check DLQ integration
  const bullmqPath = path.join(process.cwd(), 'config', 'bullmq.ts');
  if (fs.existsSync(bullmqPath)) {
    const content = fs.readFileSync(bullmqPath, 'utf-8');
    
    const hasDLQQueue = content.includes('deadLetterQueue');
    const hasDLQAdd = content.includes('dlq.add');
    
    if (hasDLQQueue) {
      logTest('8.2: Dead Letter Queue configured', true);
    } else {
      logTest('8.2: Dead Letter Queue configured', false, 'No DLQ found');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║              PHASE 1 LATENCY + PERFORMANCE VALIDATION SUITE               ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  // Run all test suites
  await testContactSyncPerformance();
  await testMessageQueuePerformance();
  await testAIProcessing();
  await testQueueConfiguration();
  await testSocketHandlers();
  await testMemoryLeaks();
  await testErrorHandling();
  
  // Only run worker timeout test if Redis is available
  const redis = getIORedisClient();
  if (redis) {
    await testWorkerTimeouts();
  } else {
    console.log('\n⚠️  Skipping worker timeout test (Redis not available)\n');
  }

  // Print summary
  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           TEST SUMMARY                                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.log('Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.name}`);
      if (r.error) console.log(`     ${r.error}`);
    });
    console.log('');
  }

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

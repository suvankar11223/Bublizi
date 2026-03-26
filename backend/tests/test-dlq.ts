/**
 * Dead Letter Queue Test Script
 * 
 * Tests that failed messages are captured in the DLQ after 3 retry attempts
 */

import { getMessageQueue, getDeadLetterQueue } from '../config/bullmq.js';
import { logger } from '../utils/logger.js';

async function testDLQ() {
  console.log('\n' + '='.repeat(60));
  console.log('DEAD LETTER QUEUE TEST');
  console.log('='.repeat(60) + '\n');

  try {
    const messageQueue = getMessageQueue();
    const dlq = getDeadLetterQueue();

    if (!messageQueue) {
      console.log('❌ Message queue not available');
      console.log('   Make sure Redis is running and configured');
      process.exit(1);
    }

    if (!dlq) {
      console.log('❌ DLQ not available');
      console.log('   Make sure Redis is running and configured');
      process.exit(1);
    }

    console.log('✅ Queues initialized');
    console.log('   Message Queue:', messageQueue ? 'available' : 'unavailable');
    console.log('   DLQ:', dlq ? 'available' : 'unavailable');

    // Get initial DLQ count
    const initialCount = await dlq.getWaitingCount();
    console.log(`\n📊 Initial DLQ count: ${initialCount}`);

    // Add a job that will fail (missing required fields)
    console.log('\n🔥 Adding a job that will fail...');
    await messageQueue.add('process-message', {
      conversationId: 'invalid-id-test',
      senderId: 'invalid-sender',
      senderName: 'Test User',
      senderAvatar: '',
      content: 'This message will fail',
      type: 'text',
      seq: 999999,
      roomId: 'invalid-room',
      // Missing required fields - will cause DB error
    } as any, {
      jobId: `test-dlq-${Date.now()}`,
    });

    console.log('✅ Failing job added to queue');
    console.log('   Waiting for 3 retry attempts (this takes ~7 seconds)...');
    console.log('   Attempt 1: immediate');
    console.log('   Attempt 2: after 1 second');
    console.log('   Attempt 3: after 2 seconds');
    console.log('   Then moved to DLQ');

    // Wait for retries to complete
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check DLQ count
    const finalCount = await dlq.getWaitingCount();
    console.log(`\n📊 Final DLQ count: ${finalCount}`);

    if (finalCount > initialCount) {
      console.log('\n✅ DLQ TEST PASSED!');
      console.log('   Failed job was captured in DLQ');
      
      // Get the DLQ job details
      const jobs = await dlq.getJobs(['waiting'], 0, 1);
      if (jobs.length > 0) {
        const job = jobs[0];
        console.log('\n📋 DLQ Job Details:');
        console.log('   Job ID:', job.id);
        console.log('   Failed At:', job.data.failedAt);
        console.log('   Attempts:', job.data.attempts);
        console.log('   Error:', job.data.error?.substring(0, 100));
        console.log('   Original Job:', JSON.stringify(job.data.originalJob, null, 2).substring(0, 200));
      }
    } else {
      console.log('\n❌ DLQ TEST FAILED');
      console.log('   Failed job was NOT captured in DLQ');
      console.log('   Check worker logs for errors');
    }

    console.log('\n' + '='.repeat(60));
    console.log('TEST COMPLETE');
    console.log('='.repeat(60) + '\n');

    process.exit(finalCount > initialCount ? 0 : 1);
  } catch (error: any) {
    console.error('\n❌ TEST ERROR:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Run test
testDLQ();

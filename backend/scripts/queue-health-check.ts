/**
 * Queue Health Check Script
 * 
 * Monitors BullMQ queue health and alerts on issues
 */

import dotenv from 'dotenv';

// CRITICAL: Load environment variables BEFORE any other imports
dotenv.config();

import { getMessageQueue, initializeQueues } from '../config/bullmq.js';
import { logger } from '../utils/logger.js';

async function checkQueueHealth() {
  try {
    console.log('🔍 Checking queue health...\n');

    // Initialize queues first
    initializeQueues();
    
    const messageQueue = getMessageQueue();

    if (!messageQueue) {
      console.error('❌ Message queue not initialized');
      process.exit(1);
    }

    // Get queue metrics
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      messageQueue.getWaitingCount(),
      messageQueue.getActiveCount(),
      messageQueue.getCompletedCount(),
      messageQueue.getFailedCount(),
      messageQueue.getDelayedCount(),
    ]);

    console.log('📊 Queue Statistics:');
    console.log('─'.repeat(40));
    console.log(`  Waiting:   ${waiting}`);
    console.log(`  Active:    ${active}`);
    console.log(`  Completed: ${completed}`);
    console.log(`  Failed:    ${failed}`);
    console.log(`  Delayed:   ${delayed}`);
    console.log('');

    // Health checks
    let hasIssues = false;

    // Check for backlog
    if (waiting > 100) {
      console.warn(`⚠️  WARNING: Queue backlog detected (${waiting} waiting)`);
      hasIssues = true;
    }

    // Check for high failure rate
    const totalProcessed = completed + failed;
    if (totalProcessed > 0) {
      const failureRate = (failed / totalProcessed) * 100;
      if (failureRate > 5) {
        console.warn(`⚠️  WARNING: High failure rate (${failureRate.toFixed(2)}%)`);
        hasIssues = true;
      }
    }

    // Check for stalled jobs
    if (active > 50) {
      console.warn(`⚠️  WARNING: Many active jobs (${active}), possible stall`);
      hasIssues = true;
    }

    if (!hasIssues) {
      console.log('✅ Queue health: GOOD\n');
    } else {
      console.log('⚠️  Queue health: NEEDS ATTENTION\n');
    }

    // Get failed jobs
    if (failed > 0) {
      console.log('📋 Recent Failed Jobs:');
      console.log('─'.repeat(40));
      const failedJobs = await messageQueue.getFailed(0, 5);
      
      for (const job of failedJobs) {
        console.log(`  Job ID: ${job.id}`);
        console.log(`  Failed: ${job.failedReason}`);
        console.log(`  Attempts: ${job.attemptsMade}/${job.opts.attempts}`);
        console.log('');
      }
    }

    process.exit(hasIssues ? 1 : 0);

  } catch (error: any) {
    console.error('❌ Health check failed:', error.message);
    process.exit(1);
  }
}

checkQueueHealth();

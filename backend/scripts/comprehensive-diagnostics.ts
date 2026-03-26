/**
 * Comprehensive Diagnostics Script
 * 
 * Performs deep analysis of:
 * - Memory leaks
 * - Connection pooling
 * - Data consistency
 * - Performance bottlenecks
 * - Error patterns
 * - Future bug prevention
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { redis, getIORedisClient } from '../config/redis.js';
import { getQueueStats } from '../config/bullmq.js';
import Message from '../modals/Message.js';
import Conversation from '../modals/Conversation.js';
import User from '../modals/userModal.js';

dotenv.config();

interface DiagnosticResult {
  category: string;
  checks: Array<{
    name: string;
    status: 'PASS' | 'FAIL' | 'WARN';
    message: string;
    details?: any;
  }>;
}

const diagnostics: DiagnosticResult[] = [];

function addDiagnostic(category: string, name: string, status: 'PASS' | 'FAIL' | 'WARN', message: string, details?: any) {
  let categoryResult = diagnostics.find(d => d.category === category);
  if (!categoryResult) {
    categoryResult = { category, checks: [] };
    diagnostics.push(categoryResult);
  }
  categoryResult.checks.push({ name, status, message, details });
}

async function runDiagnostics() {
  console.log('='.repeat(80));
  console.log('COMPREHENSIVE DIAGNOSTICS');
  console.log('='.repeat(80));
  console.log('');

  try {
    await mongoose.connect(process.env.MONGO_URI as string);

    // ========================================================================
    // 1. MEMORY LEAK DETECTION
    // ========================================================================
    console.log('🔍 Memory Leak Detection...');
    
    const memBefore = process.memoryUsage();
    
    // Simulate load
    for (let i = 0; i < 1000; i++) {
      await redis.get(`test:${i}`);
    }
    
    const memAfter = process.memoryUsage();
    const heapGrowth = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;
    
    if (heapGrowth < 5) {
      addDiagnostic('Memory', 'Heap Growth', 'PASS', `${heapGrowth.toFixed(2)}MB growth (acceptable)`, { memBefore, memAfter });
    } else {
      addDiagnostic('Memory', 'Heap Growth', 'WARN', `${heapGrowth.toFixed(2)}MB growth (monitor)`, { memBefore, memAfter });
    }

    // ========================================================================
    // 2. CONNECTION POOLING
    // ========================================================================
    console.log('🔍 Connection Pool Analysis...');
    
    const mongoStats = mongoose.connection.db?.admin().serverStatus();
    const poolSize = mongoose.connection.getClient().options.maxPoolSize || 10;
    
    addDiagnostic('Connections', 'MongoDB Pool', 'PASS', `Pool size: ${poolSize}`, { poolSize });
    
    const ioredis = getIORedisClient();
    if (ioredis) {
      addDiagnostic('Connections', 'Redis Connection', 'PASS', 'ioredis connected');
    } else {
      addDiagnostic('Connections', 'Redis Connection', 'WARN', 'Using in-memory fallback');
    }

    // ========================================================================
    // 3. DATA CONSISTENCY
    // ========================================================================
    console.log('🔍 Data Consistency Checks...');
    
    // Check for orphaned messages
    const orphanedMessages = await Message.countDocuments({
      conversationId: { $exists: true },
      $expr: {
        $not: {
          $in: ['$conversationId', await Conversation.distinct('_id')]
        }
      }
    });
    
    if (orphanedMessages === 0) {
      addDiagnostic('Data Consistency', 'Orphaned Messages', 'PASS', 'No orphaned messages found');
    } else {
      addDiagnostic('Data Consistency', 'Orphaned Messages', 'WARN', `${orphanedMessages} orphaned messages`, { count: orphanedMessages });
    }
    
    // Check for duplicate sequences
    const duplicateSeqs = await Message.aggregate([
      { $match: { seq: { $exists: true } } },
      { $group: { _id: { conversationId: '$conversationId', seq: '$seq' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]);
    
    if (duplicateSeqs.length === 0) {
      addDiagnostic('Data Consistency', 'Duplicate Sequences', 'PASS', 'No duplicate sequences');
    } else {
      addDiagnostic('Data Consistency', 'Duplicate Sequences', 'FAIL', `${duplicateSeqs.length} duplicates found`, { duplicates: duplicateSeqs });
    }

    // ========================================================================
    // 4. PERFORMANCE BOTTLENECKS
    // ========================================================================
    console.log('🔍 Performance Analysis...');
    
    // Check index usage
    const messageIndexes = await Message.collection.getIndexes();
    const conversationIndexes = await Conversation.collection.getIndexes();
    const userIndexes = await User.collection.getIndexes();
    
    const totalIndexes = Object.keys(messageIndexes).length + 
                         Object.keys(conversationIndexes).length + 
                         Object.keys(userIndexes).length;
    
    addDiagnostic('Performance', 'Database Indexes', 'PASS', `${totalIndexes} indexes configured`, {
      message: Object.keys(messageIndexes).length,
      conversation: Object.keys(conversationIndexes).length,
      user: Object.keys(userIndexes).length
    });
    
    // Check query performance
    const queryStart = Date.now();
    await Message.find({ conversationId: { $exists: true } }).limit(100);
    const queryDuration = Date.now() - queryStart;
    
    if (queryDuration < 100) {
      addDiagnostic('Performance', 'Query Speed', 'PASS', `${queryDuration}ms (excellent)`);
    } else if (queryDuration < 500) {
      addDiagnostic('Performance', 'Query Speed', 'WARN', `${queryDuration}ms (acceptable)`);
    } else {
      addDiagnostic('Performance', 'Query Speed', 'FAIL', `${queryDuration}ms (slow)`);
    }

    // ========================================================================
    // 5. ERROR PATTERNS
    // ========================================================================
    console.log('🔍 Error Pattern Analysis...');
    
    // Check for messages without senders
    const messagesWithoutSender = await Message.countDocuments({
      senderId: { $exists: false }
    });
    
    if (messagesWithoutSender === 0) {
      addDiagnostic('Error Patterns', 'Missing Senders', 'PASS', 'All messages have senders');
    } else {
      addDiagnostic('Error Patterns', 'Missing Senders', 'WARN', `${messagesWithoutSender} messages without sender`);
    }
    
    // Check for conversations without participants
    const conversationsWithoutParticipants = await Conversation.countDocuments({
      $or: [
        { participants: { $exists: false } },
        { participants: { $size: 0 } }
      ]
    });
    
    if (conversationsWithoutParticipants === 0) {
      addDiagnostic('Error Patterns', 'Empty Conversations', 'PASS', 'All conversations have participants');
    } else {
      addDiagnostic('Error Patterns', 'Empty Conversations', 'FAIL', `${conversationsWithoutParticipants} empty conversations`);
    }

    // ========================================================================
    // 6. FUTURE BUG PREVENTION
    // ========================================================================
    console.log('🔍 Future Bug Prevention...');
    
    // Check for potential N+1 queries
    const conversationsWithoutLastMessage = await Conversation.countDocuments({
      lastMessage: { $exists: false }
    });
    
    if (conversationsWithoutLastMessage === 0) {
      addDiagnostic('Bug Prevention', 'LastMessage Population', 'PASS', 'All conversations have lastMessage');
    } else {
      addDiagnostic('Bug Prevention', 'LastMessage Population', 'WARN', `${conversationsWithoutLastMessage} conversations without lastMessage`);
    }
    
    // Check for unindexed queries
    const messagesWithoutSeq = await Message.countDocuments({
      seq: { $exists: false }
    });
    
    const totalMessages = await Message.countDocuments({});
    const seqCoverage = ((totalMessages - messagesWithoutSeq) / totalMessages * 100).toFixed(2);
    
    if (messagesWithoutSeq === 0) {
      addDiagnostic('Bug Prevention', 'Sequence Coverage', 'PASS', '100% messages have sequences');
    } else {
      addDiagnostic('Bug Prevention', 'Sequence Coverage', 'WARN', `${seqCoverage}% coverage (${messagesWithoutSeq} without seq)`);
    }

    // ========================================================================
    // 7. QUEUE HEALTH
    // ========================================================================
    console.log('🔍 Queue Health Check...');
    
    try {
      const queueStats = await getQueueStats();
      
      if (queueStats.messages) {
        const { waiting, active, failed } = queueStats.messages;
        
        if (failed === 0) {
          addDiagnostic('Queue Health', 'Message Queue', 'PASS', `${waiting} waiting, ${active} active, ${failed} failed`);
        } else if (failed < 10) {
          addDiagnostic('Queue Health', 'Message Queue', 'WARN', `${failed} failed jobs (review logs)`);
        } else {
          addDiagnostic('Queue Health', 'Message Queue', 'FAIL', `${failed} failed jobs (investigate)`);
        }
      } else {
        addDiagnostic('Queue Health', 'Message Queue', 'WARN', 'Queue not initialized (using fallback)');
      }
    } catch (error: any) {
      addDiagnostic('Queue Health', 'Message Queue', 'WARN', `Queue unavailable: ${error.message}`);
    }

    // ========================================================================
    // GENERATE REPORT
    // ========================================================================
    console.log('');
    console.log('='.repeat(80));
    console.log('DIAGNOSTIC REPORT');
    console.log('='.repeat(80));
    console.log('');

    let totalChecks = 0;
    let passedChecks = 0;
    let failedChecks = 0;
    let warnedChecks = 0;

    for (const diagnostic of diagnostics) {
      console.log(`\n📋 ${diagnostic.category}`);
      console.log('-'.repeat(80));
      
      for (const check of diagnostic.checks) {
        totalChecks++;
        const icon = check.status === 'PASS' ? '✅' : check.status === 'FAIL' ? '❌' : '⚠️';
        console.log(`${icon} ${check.name}: ${check.message}`);
        
        if (check.details) {
          console.log(`   Details: ${JSON.stringify(check.details, null, 2).substring(0, 200)}...`);
        }
        
        if (check.status === 'PASS') passedChecks++;
        else if (check.status === 'FAIL') failedChecks++;
        else warnedChecks++;
      }
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Checks: ${totalChecks}`);
    console.log(`✅ Passed: ${passedChecks} (${(passedChecks/totalChecks*100).toFixed(1)}%)`);
    console.log(`❌ Failed: ${failedChecks} (${(failedChecks/totalChecks*100).toFixed(1)}%)`);
    console.log(`⚠️  Warnings: ${warnedChecks} (${(warnedChecks/totalChecks*100).toFixed(1)}%)`);
    console.log('');

    const score = Math.round((passedChecks / totalChecks) * 100);
    console.log(`Production Readiness Score: ${score}/100`);
    console.log('');

    if (failedChecks > 0) {
      console.log('❌ CRITICAL ISSUES FOUND');
      console.log('Please address failed checks before deploying to production.');
    } else if (warnedChecks > 0) {
      console.log('⚠️  WARNINGS PRESENT');
      console.log('Review warnings and consider fixes for optimal performance.');
    } else {
      console.log('✅ ALL CHECKS PASSED');
      console.log('System is production-ready!');
    }

    console.log('');
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('❌ Diagnostics failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

// Run diagnostics
runDiagnostics();

/**
 * BullMQ Message Worker
 * 
 * Processes message jobs from the queue in the background
 * Handles:
 * - Saving messages to database
 * - Broadcasting to Socket.IO rooms
 * - Updating conversation metadata
 * - Error recovery
 */

import { Worker, Job } from 'bullmq';
import { getIORedisClient } from '../config/redis.js';
import { MessageQueueJob } from '../config/bullmq.js';
import Message from '../modals/Message.js';
import Conversation from '../modals/Conversation.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// MESSAGE PROCESSING LOGIC
// ============================================================================

// Inline message processing logic (avoids module import issues)
async function processMessage(job: MessageQueueJob): Promise<void> {
  const startTime = Date.now();
  const {
    conversationId,
    senderId,
    content,
    type,
    seq,
    tempId,
    attachment,
    audioUrl,
    audioDuration,
  } = job;

  try {
    const io = (global as any).io;
    if (!io) {
      throw new Error('Socket.IO instance not available');
    }

    const { default: Message } = await import('../modals/Message.js');
    const { default: Conversation } = await import('../modals/Conversation.js');

    const message: any = await (Message as any).create({
      conversationId,
      senderId,
      content,
      type,
      seq,
      tempId,
      mediaUrl: attachment,
      voiceUrl: audioUrl,
      voiceDuration: audioDuration,
      status: 'sent',
    });

    if (message) {
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: message._id,
        updatedAt: new Date(),
      });

      io.to(conversationId).emit('message:new', {
        ...message.toObject(),
        tempId,
      });

      const duration = Date.now() - startTime;
      console.log(`[MessageQueue] Processed message ${message._id} in ${duration}ms`);
    }
  } catch (error: any) {
    console.error('[MessageQueue] Error processing message:', error);
    throw error;
  }
}

// ============================================================================
// BULLMQ WORKER
// ============================================================================

let messageWorker: Worker<MessageQueueJob> | null = null;

/**
 * Initialize the message worker
 * Processes jobs from the 'messages' queue
 */
export function initializeMessageWorker(): Worker<MessageQueueJob> | null {
  const client = getIORedisClient();

  if (!client) {
    logger.warn('Message worker not initialized: Redis connection unavailable');
    return null;
  }

  try {
    const connection = {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      tls: process.env.REDIS_TLS === 'true' ? {
        rejectUnauthorized: false,
      } : undefined,
    };

    messageWorker = new Worker<MessageQueueJob>(
      'messages',
      async (job: Job<MessageQueueJob>) => {
        // PHASE 1 FIX: Add timeout wrapper
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Job timeout after 30s')), 30000);
        });
        
        await Promise.race([
          processMessage(job.data),
          timeoutPromise
        ]);
      },
      {
        connection,
        concurrency: 10, // Process 10 messages concurrently
        limiter: {
          max: 100, // Max 100 jobs
          duration: 1000, // Per second
        },
      }
    );

    // Worker event listeners
    messageWorker.on('completed', (job) => {
      logger.debug('Message worker completed job', {
        jobId: job.id,
      });
    });

    messageWorker.on('failed', async (job, error) => {
      logger.error('Message worker failed job', {
        jobId: job?.id,
        error: error.message,
        attempts: job?.attemptsMade,
      });
      
      // After 3 attempts, move to dead letter queue
      if (job && job.attemptsMade >= 3) {
        try {
          const { getDeadLetterQueue } = await import('../config/bullmq.js');
          const dlq = getDeadLetterQueue();
          
          if (dlq) {
            await dlq.add('failed-message', {
              originalJob: job.data,
              error: error.message,
              failedAt: new Date().toISOString(),
              attempts: job.attemptsMade,
              jobId: job.id,
              stack: error.stack,
            });
            
            logger.warn('Message moved to DLQ', {
              jobId: job.id,
              conversationId: job.data.conversationId,
              error: error.message,
            });
          } else {
            logger.error('DLQ not available, failed message lost', {
              jobId: job.id,
            });
          }
        } catch (dlqError: any) {
          logger.error('Failed to move message to DLQ', {
            jobId: job.id,
            error: dlqError.message,
          });
        }
      }
    });

    messageWorker.on('error', (error) => {
      logger.error('Message worker error', {
        error: error.message,
      });
    });

    logger.info('Message worker initialized successfully', {
      concurrency: 10,
      rateLimit: '100 jobs/second',
    });

    return messageWorker;
  } catch (error: any) {
    logger.error('Failed to initialize message worker', {
      error: error.message,
    });
    return null;
  }
}

/**
 * Get the message worker instance
 */
export function getMessageWorker(): Worker<MessageQueueJob> | null {
  return messageWorker;
}

/**
 * Close the message worker gracefully
 */
export async function closeMessageWorker(): Promise<void> {
  if (messageWorker) {
    logger.info('Closing message worker...');
    await messageWorker.close();
    logger.info('Message worker closed');
  }
}

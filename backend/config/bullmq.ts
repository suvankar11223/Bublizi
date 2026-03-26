/**
 * BullMQ Configuration
 * 
 * Manages message queues for:
 * - Message processing
 * - AI response generation
 * - File uploads
 * - Email notifications
 * - Background tasks
 */

import { Queue, Worker, QueueEvents, ConnectionOptions } from 'bullmq';
import { getIORedisClient, getIORedisSubscriber } from './redis.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// REDIS CONNECTION FOR BULLMQ
// ============================================================================

/**
 * Get Redis connection options for BullMQ
 * Returns null if Redis is not configured (queues will be disabled)
 */
function getRedisConnection(): ConnectionOptions | null {
  const client = getIORedisClient();
  
  if (!client) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('❌ BullMQ requires Redis connection in production');
    }
    logger.warn('⚠️ BullMQ disabled: Redis connection not available (dev mode only)');
    return null;
  }

  // Option 1: Use UPSTASH_REDIS_URL (preferred)
  const redisUrl = process.env.UPSTASH_REDIS_URL;
  if (redisUrl) {
    // Parse the URL to extract connection details
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password,
      username: url.username || 'default',
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      tls: {
        rejectUnauthorized: false,
      },
    };
  }

  // Option 2: Use individual environment variables (fallback)
  return {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: process.env.REDIS_TLS === 'true' ? {
      rejectUnauthorized: false,
    } : undefined,
  };
}

// ============================================================================
// QUEUE DEFINITIONS
// ============================================================================

export interface MessageQueueJob {
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  attachment?: string | null;
  type: 'text' | 'image' | 'voice' | 'document' | 'ai';
  seq: number;
  tempId?: string;
  roomId: string;
  isAI?: boolean;
  audioUrl?: string;
  audioDuration?: number;
  document?: {
    url: string;
    name: string;
    size: number;
    mimeType: string;
  };
  // NOTE: io instance is NOT included here because:
  // 1. Socket.IO instances cannot be serialized to Redis
  // 2. Worker process uses global io instance instead
  // 3. See processMessageJob() in messageQueue.ts for implementation
}

export interface AIQueueJob {
  conversationId: string;
  userMessage: string;
  userName: string;
  seq: number;
}

export interface FileUploadJob {
  userId: string;
  fileUrl: string;
  fileType: 'image' | 'voice' | 'document';
  conversationId: string;
}

// ============================================================================
// QUEUE INSTANCES
// ============================================================================

let messageQueue: Queue<MessageQueueJob> | null = null;
let aiQueue: Queue<AIQueueJob> | null = null;
let fileUploadQueue: Queue<FileUploadJob> | null = null;
let deadLetterQueue: Queue | null = null;

/**
 * Initialize all BullMQ queues
 */
export function initializeQueues(): void {
  const connection = getRedisConnection();

  if (!connection) {
    logger.warn('Queues not initialized: Redis connection unavailable');
    logger.info('Messages will be processed synchronously (slower performance)');
    return;
  }

  try {
    // Message Queue - High priority, fast processing
    messageQueue = new Queue<MessageQueueJob>('messages', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 1000, // Keep last 1000 completed jobs
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
        },
      },
    });

    // AI Queue - Lower priority, longer processing time
    aiQueue = new Queue('ai-responses', {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600,
          count: 500,
        },
        removeOnFail: {
          age: 86400,
        },
      },
    }) as any;

    // File Upload Queue - Medium priority
    fileUploadQueue = new Queue('file-uploads', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1500,
        },
        removeOnComplete: {
          age: 7200,
          count: 500,
        },
        removeOnFail: {
          age: 86400,
        },
      },
    }) as any;

    // Dead Letter Queue - Captures failed messages after all retries exhausted
    deadLetterQueue = new Queue('messages-dlq', {
      connection,
      defaultJobOptions: {
        attempts: 1, // DLQ jobs don't retry
        removeOnComplete: {
          age: 7 * 24 * 3600, // Keep for 7 days
          count: 10000,
        },
        removeOnFail: false, // Never remove failed DLQ jobs
      },
    });

    logger.info('BullMQ queues initialized successfully', {
      queues: ['messages', 'ai-responses', 'file-uploads', 'messages-dlq'],
    });

    // Set up queue event listeners
    setupQueueEvents();
  } catch (error: any) {
    logger.error('Failed to initialize BullMQ queues', {
      error: error.message,
    });
  }
}

/**
 * Set up event listeners for queue monitoring
 */
function setupQueueEvents(): void {
  const connection = getRedisConnection();
  if (!connection) return;

  try {
    // Message Queue Events
    const messageQueueEvents = new QueueEvents('messages', { connection });
    
    messageQueueEvents.on('completed', ({ jobId }) => {
      logger.debug('Message job completed', { jobId });
    });

    messageQueueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error('Message job failed', { jobId, reason: failedReason });
    });

    // AI Queue Events
    const aiQueueEvents = new QueueEvents('ai-responses', { connection });
    
    aiQueueEvents.on('completed', ({ jobId }) => {
      logger.debug('AI job completed', { jobId });
    });

    aiQueueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error('AI job failed', { jobId, reason: failedReason });
    });

    logger.info('Queue event listeners configured');
  } catch (error: any) {
    logger.error('Failed to setup queue events', {
      error: error.message,
    });
  }
}

// ============================================================================
// QUEUE GETTERS
// ============================================================================

export function getMessageQueue(): Queue<MessageQueueJob> | null {
  return messageQueue;
}

export function getAIQueue(): Queue<AIQueueJob> | null {
  return aiQueue;
}

export function getFileUploadQueue(): Queue<FileUploadJob> | null {
  return fileUploadQueue;
}

export function getDeadLetterQueue(): Queue | null {
  return deadLetterQueue;
}

// ============================================================================
// QUEUE HELPERS
// ============================================================================

/**
 * Add a message to the queue
 */
export async function enqueueMessage(data: MessageQueueJob): Promise<void> {
  if (!messageQueue) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('❌ Message queue not available in production - Redis required');
    }
    
    logger.warn('⚠️ Message queue not available (dev mode), skipping message');
    // In dev mode without Redis, just skip the message
    return;
  }

  try {
    // Use tempId as jobId for idempotency
    const jobId = data.tempId || `msg-${Date.now()}-${Math.random()}`;
    
    await messageQueue.add('process-message', data, {
      jobId, // 🔥 Prevents duplicate jobs with same tempId
      priority: data.isAI ? 2 : 1, // AI messages have lower priority
    });
    
    logger.debug('✅ Message enqueued', {
      conversationId: data.conversationId,
      seq: data.seq,
      tempId: data.tempId,
      jobId,
    });
  } catch (error: any) {
    logger.error('❌ Failed to enqueue message', {
      error: error.message,
      conversationId: data.conversationId,
    });
    
    // Fail fast in production
    throw error;
  }
}

/**
 * Add an AI response job to the queue
 */
export async function enqueueAIResponse(data: AIQueueJob): Promise<void> {
  if (!aiQueue) {
    logger.warn('AI queue not available, skipping AI response');
    return;
  }

  try {
    await aiQueue.add('generate-ai-response', data);
    
    logger.debug('AI response job enqueued', {
      conversationId: data.conversationId,
    });
  } catch (error: any) {
    logger.error('Failed to enqueue AI response', {
      error: error.message,
      conversationId: data.conversationId,
    });
  }
}

/**
 * Add a file upload job to the queue
 */
export async function enqueueFileUpload(data: FileUploadJob): Promise<void> {
  if (!fileUploadQueue) {
    logger.warn('File upload queue not available, processing synchronously');
    return;
  }

  try {
    await fileUploadQueue.add('process-file-upload', data);
    
    logger.debug('File upload job enqueued', {
      userId: data.userId,
      fileType: data.fileType,
    });
  } catch (error: any) {
    logger.error('Failed to enqueue file upload', {
      error: error.message,
      userId: data.userId,
    });
  }
}

// ============================================================================
// QUEUE STATISTICS
// ============================================================================

export async function getQueueStats() {
  const stats: any = {
    messages: null,
    ai: null,
    fileUploads: null,
  };

  try {
    if (messageQueue) {
      const [waiting, active, completed, failed] = await Promise.all([
        messageQueue.getWaitingCount(),
        messageQueue.getActiveCount(),
        messageQueue.getCompletedCount(),
        messageQueue.getFailedCount(),
      ]);
      
      stats.messages = { waiting, active, completed, failed };
    }

    if (aiQueue) {
      const [waiting, active, completed, failed] = await Promise.all([
        aiQueue.getWaitingCount(),
        aiQueue.getActiveCount(),
        aiQueue.getCompletedCount(),
        aiQueue.getFailedCount(),
      ]);
      
      stats.ai = { waiting, active, completed, failed };
    }

    if (fileUploadQueue) {
      const [waiting, active, completed, failed] = await Promise.all([
        fileUploadQueue.getWaitingCount(),
        fileUploadQueue.getActiveCount(),
        fileUploadQueue.getCompletedCount(),
        fileUploadQueue.getFailedCount(),
      ]);
      
      stats.fileUploads = { waiting, active, completed, failed };
    }
  } catch (error: any) {
    logger.error('Failed to get queue stats', {
      error: error.message,
    });
  }

  return stats;
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

export async function closeQueues(): Promise<void> {
  logger.info('Closing BullMQ queues...');

  try {
    const closePromises: Promise<void>[] = [];

    if (messageQueue) {
      closePromises.push(messageQueue.close());
    }
    if (aiQueue) {
      closePromises.push(aiQueue.close());
    }
    if (fileUploadQueue) {
      closePromises.push(fileUploadQueue.close());
    }
    if (deadLetterQueue) {
      closePromises.push(deadLetterQueue.close());
    }

    await Promise.all(closePromises);
    logger.info('All BullMQ queues closed successfully');
  } catch (error: any) {
    logger.error('Error closing BullMQ queues', {
      error: error.message,
    });
  }
}

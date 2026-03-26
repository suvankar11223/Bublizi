/**
 * Redis Configuration
 * 
 * Supports two Redis clients:
 * 1. Upstash REST API (@upstash/redis) - For rate limiting and simple operations
 * 2. ioredis - For BullMQ queue management
 * 
 * Falls back to in-memory storage if Redis is unavailable
 */

import { Redis as UpstashRedis } from '@upstash/redis';
import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

// ============================================================================
// UPSTASH REST API CLIENT (for rate limiting and simple operations)
// ============================================================================

class RedisClient {
  private client: UpstashRedis | null = null;
  private inMemoryStore: Map<string, { value: any; expiry?: number }> = new Map();
  private isConnected: boolean = false;

  constructor() {
    this.connect();
  }

  private connect() {
    try {
      const url = process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN;

      if (!url || !token) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('❌ Redis is REQUIRED in production. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN');
        } else {
          logger.warn('⚠️ Redis not configured (dev mode only) - using in-memory fallback');
          this.isConnected = false;
          return;
        }
      }

      this.client = new UpstashRedis({
        url,
        token,
      });
      this.isConnected = true;
      logger.info('✅ Upstash Redis REST client initialized', {
        url: url.substring(0, 30) + '...',
      });
    } catch (error: any) {
      logger.error('Failed to initialize Upstash Redis', {
        error: error.message,
      });
      
      if (process.env.NODE_ENV === 'production') {
        throw error; // Fail fast in production
      }
      
      this.isConnected = false;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      if (this.client && this.isConnected) {
        const value = await this.client.get(key);
        return value as string | null;
      }

      // In-memory fallback
      const item = this.inMemoryStore.get(key);
      if (!item) return null;
      if (item.expiry && Date.now() > item.expiry) {
        this.inMemoryStore.delete(key);
        return null;
      }
      return item.value;
    } catch (error: any) {
      logger.error('Redis GET error', { key, error: error.message });
      return null;
    }
  }

  async set(key: string, value: string, options?: { ex?: number; nx?: boolean }): Promise<string | null> {
    try {
      if (this.client && this.isConnected) {
        if (options?.ex && options?.nx) {
          const result = await this.client.set(key, value, { ex: options.ex, nx: true });
          return result as string | null;
        } else if (options?.ex) {
          await this.client.set(key, value, { ex: options.ex });
          return 'OK';
        } else if (options?.nx) {
          const result = await this.client.set(key, value, { nx: true });
          return result as string | null;
        } else {
          await this.client.set(key, value);
          return 'OK';
        }
      }

      // In-memory fallback
      const expiry = options?.ex ? Date.now() + options.ex * 1000 : undefined;
      
      // Handle NX option (only set if not exists)
      if (options?.nx) {
        if (this.inMemoryStore.has(key)) {
          return null; // Key exists, NX failed
        }
      }
      
      this.inMemoryStore.set(key, { value, expiry });
      return 'OK';
    } catch (error: any) {
      logger.error('Redis SET error', { key, error: error.message });
      return 'OK'; // Fail open
    }
  }

  async incr(key: string): Promise<number> {
    try {
      if (this.client && this.isConnected) {
        const result = await this.client.incr(key);
        return result as number;
      }

      // In-memory fallback
      const item = this.inMemoryStore.get(key);
      const currentValue = item ? parseInt(item.value) || 0 : 0;
      const newValue = currentValue + 1;
      this.inMemoryStore.set(key, { value: newValue.toString() });
      return newValue;
    } catch (error: any) {
      logger.error('Redis INCR error', { key, error: error.message });
      return 1;
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    try {
      if (this.client && this.isConnected) {
        await this.client.expire(key, seconds);
        return;
      }

      // In-memory fallback
      const item = this.inMemoryStore.get(key);
      if (item) {
        item.expiry = Date.now() + seconds * 1000;
        this.inMemoryStore.set(key, item);
      }
    } catch (error: any) {
      logger.error('Redis EXPIRE error', { key, error: error.message });
    }
  }

  async del(key: string): Promise<void> {
    try {
      if (this.client && this.isConnected) {
        await this.client.del(key);
        return;
      }

      // In-memory fallback
      this.inMemoryStore.delete(key);
    } catch (error: any) {
      logger.error('Redis DEL error', { key, error: error.message });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (this.client && this.isConnected) {
        const result = await this.client.exists(key);
        return result === 1;
      }

      // In-memory fallback
      return this.inMemoryStore.has(key);
    } catch (error: any) {
      logger.error('Redis EXISTS error', { key, error: error.message });
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      if (this.client && this.isConnected) {
        const result = await this.client.ttl(key);
        return result as number;
      }

      // In-memory fallback
      const item = this.inMemoryStore.get(key);
      if (!item || !item.expiry) return -1;
      const remaining = Math.ceil((item.expiry - Date.now()) / 1000);
      return remaining > 0 ? remaining : -2;
    } catch (error: any) {
      logger.error('Redis TTL error', { key, error: error.message });
      return -1;
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  // Cleanup expired in-memory items periodically
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, item] of this.inMemoryStore.entries()) {
        if (item.expiry && now > item.expiry) {
          this.inMemoryStore.delete(key);
        }
      }
    }, 60000); // Clean up every minute
  }
}

// ============================================================================
// IOREDIS CLIENT (for BullMQ)
// ============================================================================

let ioredisClient: Redis | null = null;
let ioredisSubscriber: Redis | null = null;

/**
 * Create ioredis connection for BullMQ
 * Upstash requires TLS and specific configuration
 * 
 * Supports two formats:
 * 1. UPSTASH_REDIS_URL (preferred): redis://default:password@host:port
 * 2. Individual vars: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_TLS
 */
export function createIORedisConnection(): Redis | null {
  try {
    const redisUrl = process.env.UPSTASH_REDIS_URL;
    
    // Option 1: Use full Redis URL (preferred)
    if (redisUrl) {
      const client = new Redis(redisUrl, {
        maxRetriesPerRequest: null, // Required for BullMQ
        enableReadyCheck: false,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        tls: {
          rejectUnauthorized: false, // Upstash uses self-signed certs
        },
      });

      client.on('connect', () => {
        logger.info('✅ ioredis connected successfully for BullMQ (via UPSTASH_REDIS_URL)');
      });

      client.on('error', (error) => {
        logger.error('ioredis connection error', {
          error: error.message,
        });
      });

      client.on('close', () => {
        logger.warn('ioredis connection closed');
      });

      return client;
    }

    // Option 2: Use individual environment variables (fallback)
    const host = process.env.REDIS_HOST;
    const port = parseInt(process.env.REDIS_PORT || '6379');
    const password = process.env.REDIS_PASSWORD;
    const useTLS = process.env.REDIS_TLS === 'true';

    if (!host || !password) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('❌ Redis (ioredis) is REQUIRED in production for BullMQ. Set UPSTASH_REDIS_URL or REDIS_HOST and REDIS_PASSWORD');
      }
      logger.warn('⚠️ Redis connection details not found for BullMQ (dev mode only), queues will be disabled');
      return null;
    }

    const config: any = {
      host,
      port,
      password,
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    };

    // Add TLS configuration for Upstash
    if (useTLS) {
      config.tls = {
        rejectUnauthorized: false, // Upstash uses self-signed certs
      };
    }

    const client = new Redis(config);

    client.on('connect', () => {
      logger.info('✅ ioredis connected successfully for BullMQ', {
        host,
        port,
        tls: useTLS,
      });
    });

    client.on('error', (error) => {
      logger.error('ioredis connection error', {
        error: error.message,
      });
    });

    client.on('close', () => {
      logger.warn('ioredis connection closed');
    });

    return client;
  } catch (error: any) {
    logger.error('Failed to create ioredis connection', {
      error: error.message,
    });
    return null;
  }
}

/**
 * Get or create ioredis client for BullMQ
 */
export function getIORedisClient(): Redis | null {
  if (!ioredisClient) {
    ioredisClient = createIORedisConnection();
  }
  return ioredisClient;
}

/**
 * Get or create ioredis subscriber for BullMQ
 * BullMQ requires a separate connection for subscriptions
 */
export function getIORedisSubscriber(): Redis | null {
  if (!ioredisSubscriber) {
    ioredisSubscriber = createIORedisConnection();
  }
  return ioredisSubscriber;
}

/**
 * Close ioredis connections gracefully
 */
export async function closeIORedisConnections(): Promise<void> {
  try {
    if (ioredisClient) {
      await ioredisClient.quit();
      logger.info('ioredis client closed');
    }
    if (ioredisSubscriber) {
      await ioredisSubscriber.quit();
      logger.info('ioredis subscriber closed');
    }
  } catch (error: any) {
    logger.error('Error closing ioredis connections', {
      error: error.message,
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Upstash REST client (for rate limiting) - lazy initialization
let redisInstance: RedisClient | null = null;

export function getRedisClient(): RedisClient {
  if (!redisInstance) {
    redisInstance = new RedisClient();
    redisInstance.startCleanup();
  }
  return redisInstance;
}

// For backward compatibility
export const redis = new Proxy({} as RedisClient, {
  get(target, prop) {
    return getRedisClient()[prop as keyof RedisClient];
  }
});

// ioredis clients (for BullMQ)
export { ioredisClient, ioredisSubscriber };

// Log connection status only when first accessed
let hasLoggedStatus = false;
export function logRedisStatus() {
  if (!hasLoggedStatus) {
    const client = getRedisClient();
    logger.info('Redis configuration loaded', {
      upstashRest: client.getConnectionStatus() ? 'connected' : 'in-memory fallback',
      ioredis: getIORedisClient() ? 'connected' : 'disabled',
    });
    hasLoggedStatus = true;
  }
}

/**
 * Health Check Service (PHASE 4)
 * 
 * Comprehensive health monitoring for:
 * - MongoDB connection
 * - Redis connection
 * - Queue system
 * - External APIs
 * - System resources
 */

import mongoose from 'mongoose';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { getMessageQueue } from '../config/bullmq.js';

export interface HealthStatus {
  healthy: boolean;
  latency?: number;
  error?: string;
  details?: Record<string, any>;
}

export interface OverallHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    mongodb: HealthStatus;
    redis: HealthStatus;
    queues: HealthStatus;
    memory: HealthStatus;
  };
}

export class HealthCheckService {
  private startTime: number = Date.now();

  /**
   * Check MongoDB connection health
   */
  async checkMongoDB(): Promise<HealthStatus> {
    try {
      const start = Date.now();
      
      // Check connection state
      if (mongoose.connection.readyState !== 1) {
        return {
          healthy: false,
          error: 'MongoDB not connected',
          details: {
            readyState: mongoose.connection.readyState,
            states: {
              0: 'disconnected',
              1: 'connected',
              2: 'connecting',
              3: 'disconnecting',
            }[mongoose.connection.readyState],
          },
        };
      }
      
      // Ping database
      await mongoose.connection.db.admin().ping();
      const latency = Date.now() - start;
      
      return {
        healthy: true,
        latency,
        details: {
          readyState: 'connected',
          host: mongoose.connection.host,
          name: mongoose.connection.name,
        },
      };
    } catch (error: any) {
      logger.error('MongoDB health check failed', {
        error: error.message,
      });
      
      return {
        healthy: false,
        error: error.message,
      };
    }
  }

  /**
   * Check Redis connection health
   */
  async checkRedis(): Promise<HealthStatus> {
    try {
      const start = Date.now();
      
      // Test Redis with a simple operation
      const testKey = 'health:check:redis';
      await redis.set(testKey, Date.now().toString(), { ex: 5 });
      const value = await redis.get(testKey);
      
      if (!value) {
        return {
          healthy: false,
          error: 'Redis read/write test failed',
        };
      }
      
      const latency = Date.now() - start;
      await redis.del(testKey);
      
      return {
        healthy: true,
        latency,
        details: {
          connected: true,
        },
      };
    } catch (error: any) {
      logger.error('Redis health check failed', {
        error: error.message,
      });
      
      return {
        healthy: false,
        error: error.message,
      };
    }
  }

  /**
   * Check queue system health
   */
  async checkQueues(): Promise<HealthStatus> {
    try {
      const messageQueue = getMessageQueue();
      
      if (!messageQueue) {
        return {
          healthy: false,
          error: 'Message queue not initialized',
        };
      }
      
      // Get job counts
      const jobCounts = await messageQueue.getJobCounts();
      
      // Check for excessive failed jobs
      const failedJobsThreshold = 100;
      const tooManyFailed = jobCounts.failed > failedJobsThreshold;
      
      return {
        healthy: !tooManyFailed,
        error: tooManyFailed ? `Too many failed jobs: ${jobCounts.failed}` : undefined,
        details: {
          waiting: jobCounts.waiting,
          active: jobCounts.active,
          completed: jobCounts.completed,
          failed: jobCounts.failed,
          delayed: jobCounts.delayed,
        },
      };
    } catch (error: any) {
      logger.error('Queue health check failed', {
        error: error.message,
      });
      
      return {
        healthy: false,
        error: error.message,
      };
    }
  }

  /**
   * Check system memory
   */
  checkMemory(): HealthStatus {
    try {
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
      const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);
      
      // Warn if heap usage is above 80%
      const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      const memoryPressure = heapUsagePercent > 80;
      
      return {
        healthy: !memoryPressure,
        error: memoryPressure ? 'High memory usage' : undefined,
        details: {
          heapUsed: `${heapUsedMB}MB`,
          heapTotal: `${heapTotalMB}MB`,
          heapUsagePercent: `${Math.round(heapUsagePercent)}%`,
          rss: `${rssMB}MB`,
        },
      };
    } catch (error: any) {
      logger.error('Memory health check failed', {
        error: error.message,
      });
      
      return {
        healthy: false,
        error: error.message,
      };
    }
  }

  /**
   * Get overall system health
   */
  async getOverallHealth(): Promise<OverallHealth> {
    const checks = {
      mongodb: await this.checkMongoDB(),
      redis: await this.checkRedis(),
      queues: await this.checkQueues(),
      memory: this.checkMemory(),
    };
    
    // Determine overall status
    const allHealthy = Object.values(checks).every(c => c.healthy);
    const someHealthy = Object.values(checks).some(c => c.healthy);
    const criticalUnhealthy = !checks.mongodb.healthy || !checks.redis.healthy;
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (allHealthy) {
      status = 'healthy';
    } else if (criticalUnhealthy) {
      status = 'unhealthy';
    } else {
      status = 'degraded';
    }
    
    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      checks,
    };
  }

  /**
   * Get readiness status (for Kubernetes readiness probe)
   */
  async isReady(): Promise<boolean> {
    const health = await this.getOverallHealth();
    
    // Ready if MongoDB and Redis are healthy
    return health.checks.mongodb.healthy && health.checks.redis.healthy;
  }

  /**
   * Get liveness status (for Kubernetes liveness probe)
   */
  isAlive(): boolean {
    // Alive if process is running and not out of memory
    const memory = this.checkMemory();
    return memory.healthy;
  }
}

// Singleton instance
export const healthCheckService = new HealthCheckService();

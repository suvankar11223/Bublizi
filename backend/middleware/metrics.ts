/**
 * Performance Metrics Middleware (FIX #10)
 * 
 * Tracks request duration, database queries, and system metrics
 * Provides data for monitoring and optimization
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import os from 'os';

// Store metrics in memory (in production, use Redis or metrics service)
interface Metrics {
  requests: {
    total: number;
    byStatus: Record<number, number>;
    byPath: Record<string, number>;
  };
  performance: {
    avgResponseTime: number;
    slowRequests: number; // >1 second
    totalResponseTime: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
  };
  system: {
    startTime: number;
    lastCheck: number;
  };
}

const metrics: Metrics = {
  requests: {
    total: 0,
    byStatus: {},
    byPath: {},
  },
  performance: {
    avgResponseTime: 0,
    slowRequests: 0,
    totalResponseTime: 0,
  },
  errors: {
    total: 0,
    byType: {},
  },
  system: {
    startTime: Date.now(),
    lastCheck: Date.now(),
  },
};

/**
 * FIX #10: Request timing middleware
 * Tracks how long each request takes
 */
export function requestTimer(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  // Generate unique request ID
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  (req as any).requestId = requestId;

  // Use res.on('finish') instead of overriding res.json
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Normalize path to prevent memory leak (remove IDs)
    const normalizedPath = req.path
      .replace(/\/[0-9a-f]{24}/g, '/:id') // MongoDB ObjectIds
      .replace(/\/\d+/g, '/:id'); // Numeric IDs

    // Update metrics
    metrics.requests.total++;
    metrics.requests.byStatus[statusCode] = (metrics.requests.byStatus[statusCode] || 0) + 1;
    
    // FIX #10: Limit path entries to prevent memory leak
    const MAX_PATH_ENTRIES = 100;
    if (Object.keys(metrics.requests.byPath).length < MAX_PATH_ENTRIES) {
      metrics.requests.byPath[normalizedPath] = (metrics.requests.byPath[normalizedPath] || 0) + 1;
    }

    // Update response time metrics
    metrics.performance.totalResponseTime += duration;
    metrics.performance.avgResponseTime = 
      Math.round(metrics.performance.totalResponseTime / metrics.requests.total);

    // Track slow requests
    if (duration > 1000) {
      metrics.performance.slowRequests++;
      logger.warn('Slow request detected', {
        method: req.method,
        path: normalizedPath,
        duration,
        requestId,
      });
    }

    // Log request
    logger.request(req.method, normalizedPath, statusCode, duration, {
      requestId,
      userId: (req as any).userId,
      ip: req.ip,
    });
  });

  next();
}

/**
 * Get current metrics
 */
export function getMetrics(): Metrics & { system: any } {
  return {
    ...metrics,
    system: {
      ...metrics.system,
      ...getSystemMetrics(),
    },
  };
}

/**
 * Reset metrics (useful for testing)
 */
export function resetMetrics(): void {
  metrics.requests.total = 0;
  metrics.requests.byStatus = {};
  metrics.requests.byPath = {};
  metrics.performance.avgResponseTime = 0;
  metrics.performance.slowRequests = 0;
  metrics.performance.totalResponseTime = 0;
  metrics.errors.total = 0;
  metrics.errors.byType = {};
  metrics.system.startTime = Date.now();
}

/**
 * Track error
 */
export function trackError(errorType: string): void {
  metrics.errors.total++;
  metrics.errors.byType[errorType] = (metrics.errors.byType[errorType] || 0) + 1;
}

/**
 * FIX #10: Get system metrics (memory, CPU, etc.)
 */
export function getSystemMetrics() {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  return {
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
      rss: Math.round(memUsage.rss / 1024 / 1024), // MB
      external: Math.round(memUsage.external / 1024 / 1024), // MB
      heapUsedPercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    },
    cpu: {
      user: Math.round(cpuUsage.user / 1000), // microseconds to milliseconds
      system: Math.round(cpuUsage.system / 1000),
    },
    os: {
      totalMemory: Math.round(os.totalmem() / 1024 / 1024), // MB
      freeMemory: Math.round(os.freemem() / 1024 / 1024), // MB
      loadAverage: os.loadavg(),
      cpuCount: os.cpus().length,
    },
    uptime: Math.round(process.uptime()), // seconds
    nodeVersion: process.version,
    platform: process.platform,
  };
}

/**
 * FIX #10: Get active connections count
 */
export function getActiveConnections(): number {
  // This would be tracked by Socket.IO
  const io = (global as any).io;
  if (io && io.sockets) {
    return io.sockets.sockets.size;
  }
  return 0;
}

/**
 * FIX #10: Start periodic metrics logging
 */
export function startMetricsLogging(intervalMs: number = 60000): NodeJS.Timeout {
  return setInterval(() => {
    const systemMetrics = getSystemMetrics();
    const activeConnections = getActiveConnections();
    
    logger.info('System metrics', {
      memory: systemMetrics.memory,
      cpu: systemMetrics.cpu,
      uptime: systemMetrics.uptime,
      activeConnections,
      requests: {
        total: metrics.requests.total,
        avgResponseTime: metrics.performance.avgResponseTime,
        slowRequests: metrics.performance.slowRequests,
      },
      errors: metrics.errors.total,
    });
    
    metrics.system.lastCheck = Date.now();
  }, intervalMs);
}

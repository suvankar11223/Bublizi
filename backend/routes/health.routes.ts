import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { checkDBHealth, getDBStats } from '../config/db.js';
import { redis } from '../config/redis.js';
import { getMessageQueue } from '../config/bullmq.js';
import { healthCheckService } from '../services/healthCheck.js';

const router = Router();

// Track server start time for uptime calculation
const serverStartTime = Date.now();

// 🔒 PHASE 4: Comprehensive health check endpoint
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await healthCheckService.getOverallHealth();
    
    // Return 200 if healthy, 503 if degraded/unhealthy
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error: any) {
    console.error('[Health] Error:', error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// 🔒 PHASE 4: Readiness check - used by load balancers
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    const isReady = await healthCheckService.isReady();
    
    if (isReady) {
      res.status(200).json({
        ready: true,
        timestamp: new Date().toISOString(),
      });
    } else {
      const health = await healthCheckService.getOverallHealth();
      res.status(503).json({
        ready: false,
        checks: health.checks,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    res.status(503).json({
      ready: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// 🔒 PHASE 4: Liveness check - used by orchestrators (Kubernetes, etc.)
router.get('/live', (_req: Request, res: Response) => {
  try {
    const isAlive = healthCheckService.isAlive();
    
    if (isAlive) {
      res.status(200).json({
        alive: true,
        uptime: Math.floor((Date.now() - serverStartTime) / 1000),
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        alive: false,
        reason: 'High memory usage',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    res.status(503).json({
      alive: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Detailed stats endpoint (protected - for monitoring)
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const dbStats = await getDBStats();
    const memUsage = process.memoryUsage();
    
    res.status(200).json({
      database: dbStats,
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
        external: Math.round(memUsage.external / 1024 / 1024) + 'MB',
      },
      process: {
        uptime: Math.floor(process.uptime()),
        pid: process.pid,
        version: process.version,
        platform: process.platform,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

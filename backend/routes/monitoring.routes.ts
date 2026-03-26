/**
 * Monitoring Routes
 * 
 * Provides real-time stats for queue, rate limiting, and system health
 * Useful for debugging and performance monitoring
 */

import { Router, Request, Response } from 'express';
import { getQueueStats } from '../config/bullmq.js';
import { getRateLimitStats } from '../middleware/socketRateLimit.js';
import { getMetrics, getSystemMetrics, getActiveConnections } from '../middleware/metrics.js';
import { authenticateToken } from '../middleware/auth.js';
import mongoose from 'mongoose';

const router = Router();

// Queue statistics (protected - requires auth)
router.get('/queue/stats', authenticateToken, async (_req: Request, res: Response) => {
  try {
    const queueStats = await getQueueStats();
    
    res.json({
      success: true,
      data: {
        ...queueStats,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Monitoring] Queue stats error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to get queue stats',
    });
  }
});

// Rate limit statistics (protected - requires auth)
router.get('/ratelimit/stats', authenticateToken, async (_req: Request, res: Response) => {
  try {
    const stats = await getRateLimitStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Monitoring] Rate limit stats error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to get rate limit stats',
    });
  }
});

// System health (public - for monitoring services)
router.get('/system/health', async (_req: Request, res: Response) => {
  try {
    const queueStats = await getQueueStats();
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    const health = {
      status: 'ok',
      services: {
        database: dbStatus,
        messageQueue: queueStats.messages ? 'connected' : 'disconnected',
      },
      metrics: {
        messageQueueWaiting: queueStats.messages?.waiting || 0,
        messageQueueActive: queueStats.messages?.active || 0,
      },
      timestamp: new Date().toISOString(),
    };
    
    // Return 503 if any service is degraded
    const isHealthy = dbStatus === 'connected' && queueStats.messages !== null;
    const statusCode = isHealthy ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('[Monitoring] System health error:', error);
    res.status(503).json({
      status: 'error',
      services: {
        database: 'unknown',
        messageQueue: 'unknown',
      },
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================================
// DEAD LETTER QUEUE ENDPOINTS
// ============================================================================

// Get DLQ statistics
router.get('/dlq/stats', authenticateToken, async (_req: Request, res: Response) => {
  try {
    const { getDeadLetterQueue } = await import('../config/bullmq.js');
    const dlq = getDeadLetterQueue();
    
    if (!dlq) {
      return res.json({
        success: true,
        data: {
          count: 0,
          message: 'DLQ not available',
        },
      });
    }

    const [waiting, failed, completed] = await Promise.all([
      dlq.getWaitingCount(),
      dlq.getFailedCount(),
      dlq.getCompletedCount(),
    ]);

    res.json({
      success: true,
      data: {
        waiting,
        failed,
        completed,
        total: waiting + failed + completed,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Monitoring] DLQ stats error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to get DLQ stats',
      error: error.message,
    });
  }
});

// Get recent DLQ jobs
router.get('/dlq/jobs', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { getDeadLetterQueue } = await import('../config/bullmq.js');
    const dlq = getDeadLetterQueue();
    
    if (!dlq) {
      return res.json({
        success: true,
        data: {
          jobs: [],
          message: 'DLQ not available',
        },
      });
    }

    const limitParam = req.query.limit;
    const limit = limitParam ? parseInt(limitParam as string) : 50;
    const jobs = await dlq.getJobs(['waiting', 'failed'], 0, limit);
    
    const formattedJobs = jobs.map(job => ({
      id: job.id,
      data: job.data,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    }));

    res.json({
      success: true,
      data: {
        jobs: formattedJobs,
        count: formattedJobs.length,
      },
    });
  } catch (error: any) {
    console.error('[Monitoring] DLQ jobs error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to get DLQ jobs',
      error: error.message,
    });
  }
});

// Retry a DLQ job
router.post('/dlq/retry/:jobId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const jobIdParam = req.params.jobId;
    const jobId = Array.isArray(jobIdParam) ? jobIdParam[0] : jobIdParam;
    
    const { getDeadLetterQueue, enqueueMessage } = await import('../config/bullmq.js');
    const dlq = getDeadLetterQueue();
    
    if (!dlq) {
      return res.status(503).json({
        success: false,
        msg: 'DLQ not available',
      });
    }

    const job = await dlq.getJob(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        msg: 'Job not found in DLQ',
      });
    }

    // Re-enqueue the original message
    await enqueueMessage(job.data.originalJob);
    
    // Remove from DLQ
    await job.remove();

    res.json({
      success: true,
      msg: 'Job re-queued successfully',
      data: {
        jobId,
        conversationId: job.data.originalJob?.conversationId,
      },
    });
  } catch (error: any) {
    console.error('[Monitoring] DLQ retry error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to retry DLQ job',
      error: error.message,
    });
  }
});

// Clear all completed DLQ jobs
router.delete('/dlq/clear-completed', authenticateToken, async (_req: Request, res: Response) => {
  try {
    const { getDeadLetterQueue } = await import('../config/bullmq.js');
    const dlq = getDeadLetterQueue();
    
    if (!dlq) {
      return res.status(503).json({
        success: false,
        msg: 'DLQ not available',
      });
    }

    await dlq.clean(0, 1000, 'completed');

    res.json({
      success: true,
      msg: 'Completed DLQ jobs cleared',
    });
  } catch (error: any) {
    console.error('[Monitoring] DLQ clear error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to clear DLQ',
      error: error.message,
    });
  }
});

// ============================================================================
// CIRCUIT BREAKER ENDPOINTS
// ============================================================================

// Get all circuit breaker states
router.get('/circuit-breakers', authenticateToken, (_req: Request, res: Response) => {
  try {
    const {
      clerkCircuitBreaker,
      firebaseCircuitBreaker,
      geminiCircuitBreaker,
    } = require('../utils/circuitBreaker.js');

    res.json({
      success: true,
      data: {
        clerk: clerkCircuitBreaker.getState(),
        firebase: firebaseCircuitBreaker.getState(),
        gemini: geminiCircuitBreaker.getState(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Monitoring] Circuit breaker stats error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to get circuit breaker stats',
      error: error.message,
    });
  }
});

// ============================================================================
// FIX #10: PERFORMANCE METRICS ENDPOINTS
// ============================================================================

// Get comprehensive performance metrics
router.get('/metrics', authenticateToken, (_req: Request, res: Response) => {
  try {
    const metrics = getMetrics();
    const activeConnections = getActiveConnections();
    
    res.json({
      success: true,
      data: {
        ...metrics,
        activeConnections,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Monitoring] Metrics error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to get metrics',
      error: error.message,
    });
  }
});

// Get system metrics only
router.get('/metrics/system', authenticateToken, (_req: Request, res: Response) => {
  try {
    const systemMetrics = getSystemMetrics();
    const activeConnections = getActiveConnections();
    
    res.json({
      success: true,
      data: {
        ...systemMetrics,
        activeConnections,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Monitoring] System metrics error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to get system metrics',
      error: error.message,
    });
  }
});

// Prometheus-compatible metrics endpoint (plain text format)
router.get('/metrics/prometheus', (_req: Request, res: Response) => {
  try {
    const metrics = getMetrics();
    const activeConnections = getActiveConnections();
    
    // Format metrics in Prometheus format
    const prometheusMetrics = `
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total ${metrics.requests.total}

# HELP http_request_duration_ms Average HTTP request duration in milliseconds
# TYPE http_request_duration_ms gauge
http_request_duration_ms ${metrics.performance.avgResponseTime}

# HELP http_slow_requests_total Total number of slow requests (>1s)
# TYPE http_slow_requests_total counter
http_slow_requests_total ${metrics.performance.slowRequests}

# HELP http_errors_total Total number of errors
# TYPE http_errors_total counter
http_errors_total ${metrics.errors.total}

# HELP process_heap_used_bytes Process heap used in bytes
# TYPE process_heap_used_bytes gauge
process_heap_used_bytes ${metrics.system.memory.heapUsed * 1024 * 1024}

# HELP process_heap_total_bytes Process heap total in bytes
# TYPE process_heap_total_bytes gauge
process_heap_total_bytes ${metrics.system.memory.heapTotal * 1024 * 1024}

# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds counter
process_uptime_seconds ${metrics.system.uptime}

# HELP websocket_connections_active Active WebSocket connections
# TYPE websocket_connections_active gauge
websocket_connections_active ${activeConnections}
`.trim();

    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(prometheusMetrics);
  } catch (error: any) {
    console.error('[Monitoring] Prometheus metrics error:', error);
    res.status(500).send('# Error generating metrics');
  }
});

// ============================================================================
// END PERFORMANCE METRICS
// ============================================================================

// Reset a specific circuit breaker
router.post('/circuit-breakers/:name/reset', authenticateToken, (req: Request, res: Response) => {
  try {
    const nameParam = req.params.name;
    const name = Array.isArray(nameParam) ? nameParam[0] : nameParam;
    
    const {
      clerkCircuitBreaker,
      firebaseCircuitBreaker,
      geminiCircuitBreaker,
    } = require('../utils/circuitBreaker.js');
    
    switch (name) {
      case 'clerk':
        clerkCircuitBreaker.reset();
        break;
      case 'firebase':
        firebaseCircuitBreaker.reset();
        break;
      case 'gemini':
        geminiCircuitBreaker.reset();
        break;
      default:
        return res.status(404).json({
          success: false,
          msg: 'Circuit breaker not found. Valid names: clerk, firebase, gemini',
        });
    }
    
    res.json({
      success: true,
      msg: `${name} circuit breaker reset successfully`,
    });
  } catch (error: any) {
    console.error('[Monitoring] Circuit breaker reset error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to reset circuit breaker',
      error: error.message,
    });
  }
});

// Reset all circuit breakers
router.post('/circuit-breakers/reset-all', authenticateToken, (_req: Request, res: Response) => {
  try {
    const { resetAllCircuitBreakers } = require('../utils/circuitBreaker.js');
    resetAllCircuitBreakers();
    
    res.json({
      success: true,
      msg: 'All circuit breakers reset successfully',
    });
  } catch (error: any) {
    console.error('[Monitoring] Reset all circuit breakers error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to reset all circuit breakers',
      error: error.message,
    });
  }
});

export default router;

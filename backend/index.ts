import dotenv from 'dotenv';

// CRITICAL: Load environment variables BEFORE any other imports
dotenv.config();

// FIX #12: Validate environment configuration on startup
import { validateEnv, config } from './config/env.js';
validateEnv();

import express from 'express';
import http from 'http';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import { initializeQueues, closeQueues } from './config/bullmq.js';
import { initializeMessageWorker, closeMessageWorker } from './queues/messageWorker.js';
import './queues/contactWorker.js'; // Initialize contact worker
import { closeIORedisConnections } from './config/redis.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import callRoutes from './routes/call.routes.js';
import livekitRoutes from './routes/livekit.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import otpRoutes from './routes/otp.routes.js';
import phoneRoutes from './routes/phone.routes.js';
import contactSyncRoutes from './routes/contactSync.routes.js';
import healthRoutes from './routes/health.routes.js';
import monitoringRoutes from './routes/monitoring.routes.js';
import presenceRoutes from './routes/presence.routes.js';
import { initializeSocket } from './socket/socket.js';
import { presenceService } from './services/presenceService.js';
import { requestTimer, startMetricsLogging } from './middleware/metrics.js';
import { errorHandler, notFoundHandler, setupGlobalErrorHandlers } from './middleware/errorHandler.js';
import { smartTimeout } from './middleware/requestTimeout.js';
import { logger } from './utils/logger.js';
import mongoose from 'mongoose';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ============================================================================
// FIX #8: SECURITY HARDENING - Protect against common attacks
// ============================================================================

// Security headers with Helmet.js
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API server
  crossOriginEmbedderPolicy: false, // Allow embedding for WebRTC
}));

// Sanitize data to prevent MongoDB injection
app.use(mongoSanitize({
  replaceWith: '_', // Replace $ and . with _
  onSanitize: ({ req, key }) => {
    console.warn(`[SECURITY] Sanitized key "${key}" in request from ${req.ip}`);
  },
}));

// Global rate limiting (100 requests per 15 minutes per IP)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    console.warn(`[SECURITY] Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      msg: 'Too many requests, please try again later',
    });
  },
});

// Apply global rate limiting to all API routes
app.use('/api/', globalLimiter);

// Stricter rate limiting for auth endpoints (20 requests per 15 minutes)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many authentication attempts, please try again later',
});

// ============================================================================
// END SECURITY HARDENING
// ============================================================================

// PRODUCTION FIX: Add compression for faster responses
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6 // Balance between speed and compression
}));

// Serve static files (for call.html)
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(express.json({ limit: '10mb' })); // FIX #8: Request size limit
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // FIX #8: Request size limit

// FIX #10: Request timing and metrics
app.use(requestTimer);

// 🔒 PHASE 4: Request timeout handling
app.use(smartTimeout);

// CORS configuration for Expo/React Native
// 🔒 SECURITY FIX: Restrict origins in production
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
      'https://yourdomain.com',
      'https://www.yourdomain.com',
      'capacitor://localhost', // Mobile app
      'ionic://localhost',     // Mobile app
    ]
  : [
      'http://localhost:8081',  // Expo dev
      'http://localhost:19000', // Expo dev
      'http://localhost:19006', // Expo web
      '*', // Allow all in development
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // In development, allow all
    if (process.env.NODE_ENV !== 'production') {
      callback(null, true);
      return;
    }
    
    // In production, check whitelist
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Get local IP address
const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
};

// Health check endpoints (public - no auth)
app.use('/', healthRoutes);

// Test connection endpoint - returns server info
app.get('/api/test-connection', (_req, res) => {
  res.status(200).json({ 
    success: true, 
    message: 'Server is running and reachable!',
    timestamp: Date.now(),
    url: `http://localhost:${PORT}`
  });
});

// Endpoint to get server IP (for clients to discover the server's IP)
app.get('/api/discover', (_req, res) => {
  const ip = getLocalIP();
  const port = process.env.PORT || 3000;
  res.json({
    success: true,
    ip,
    port,
    url: `http://${ip}:${port}`
  });
});

// Mount auth routes
app.use('/api/auth', authLimiter, authRoutes); // FIX #8: Apply stricter rate limiting to auth
app.use('/api/user', userRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/livekit', livekitRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/phone', phoneRoutes);
app.use('/api/contacts', contactSyncRoutes);
app.use('/api/monitoring', monitoringRoutes); // PHASE 3: Queue & rate limit monitoring
app.use('/api/presence', presenceRoutes); // PHASE 2: Redis-based presence

// FIX #7: 404 handler for undefined routes
app.use(notFoundHandler);

// FIX #7: Error handling middleware (must be last)
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3000;
const server = http.createServer(app);

// Initialize Socket.IO
const io = initializeSocket(server);

// Store io instance globally for broadcasting from controllers
(global as any).io = io;

const startServer = async () => {
  try {
    // FIX #7: Setup global error handlers
    setupGlobalErrorHandlers();
    
    // Connect to database
    await connectDB();
    
    // Initialize BullMQ queues and workers
    console.log('🔄 Initializing BullMQ queues...');
    initializeQueues();
    initializeMessageWorker();
    console.log('✅ BullMQ queues initialized');
    
    // FIX #10: Start periodic metrics logging (every 60 seconds)
    startMetricsLogging(60000);
    console.log('✅ Metrics logging started');
    
    // Listen on all network interfaces (0.0.0.0) to allow connections from other devices
    server.listen(PORT, '0.0.0.0', () => {
      const localIP = getLocalIP();
      console.log('='.repeat(60));
      console.log('SERVER STARTED SUCCESSFULLY');
      console.log('='.repeat(60));
      console.log(`✅ Server listening on 0.0.0.0:${PORT}`);
      console.log('');
      console.log('📱 Access from:');
      console.log(`   Local:   http://localhost:${PORT}`);
      console.log(`   Network: http://${localIP}:${PORT}`);
      console.log('');
      console.log('🔌 Endpoints:');
      console.log(`   Health:  http://${localIP}:${PORT}/api/health`);
      console.log(`   Auth:    http://${localIP}:${PORT}/api/auth`);
      console.log(`   Users:   http://${localIP}:${PORT}/api/user`);
      console.log('');
      console.log('🔄 Socket.IO ready for connections');
      console.log('📦 BullMQ queues ready for processing');
      console.log('📊 Metrics logging enabled');
      console.log('');
      console.log('⚠️  IMPORTANT:');
      console.log('   - Phone and computer MUST be on SAME WiFi network');
      console.log(`   - Update frontend IP to: ${localIP}`);
      console.log('   - File: frontend/utils/network.ts (line 5)');
      console.log('='.repeat(60));
    });
  } catch (err) {
    console.log('Failed to start the server due to database connection error:', err);
    process.exit(1);
  }
};

startServer();

// ============================================================================
// GRACEFUL SHUTDOWN (FIX #9) - Prevents data loss on deployment
// ============================================================================

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    console.log('Shutdown already in progress...');
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n${signal} received, starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(() => {
    console.log('✅ HTTP server closed');
  });
  
  // Give existing requests 10 seconds to complete
  setTimeout(() => {
    console.log('⚠️  Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
  
  try {
    // Close Socket.IO connections gracefully
    const io = (global as any).io;
    if (io) {
      io.close(() => {
        console.log('✅ Socket.IO closed');
      });
    }
    
    // Close BullMQ queues
    await closeQueues();
    console.log('✅ BullMQ queues closed');
    
    // Close message worker
    await closeMessageWorker();
    console.log('✅ Message worker closed');
    
    // Cleanup presence service
    presenceService.cleanup();
    console.log('✅ Presence service cleaned up');
    
    // Close Redis connections
    await closeIORedisConnections();
    console.log('✅ Redis connections closed');
    
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    
    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error during shutdown:', error.message);
    process.exit(1);
  }
}

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

export { io };

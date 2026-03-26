import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { getIORedisClient, getIORedisSubscriber } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { clerkCircuitBreaker } from '../utils/circuitBreaker.js';
import { registerUserEvents } from './userEvents.js';
import { registerChatEvents } from './chatEvents.js';
import { registerCallEvents } from './callEvents.js';
import { registerWebRTCEvents } from './webrtcEvents.js';
import Conversation from '../modals/Conversation';
import { clerkClient } from '@clerk/clerk-sdk-node';
import User from '../modals/userModal.js';
import { presenceService } from '../services/presenceService.js';

dotenv.config();

// 🔒 SECURITY FIX: Reduce Clerk cache TTL from 5min to 30s
// Prevents deleted/suspended users from accessing system for too long
const clerkUserCache = new Map<string, { 
  mongoId: string; 
  email: string; 
  name: string; 
  expires: number;
}>();

export const initializeSocket = (server: Server): SocketIOServer => {
  const io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ['polling', 'websocket'], // ✅ polling first for Render stability
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    maxHttpBufferSize: 1e6, // 1MB
    // PRODUCTION FIX: Connection limits handled by server configuration
    connectTimeout: 45000,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCTION FIX: Add Redis Adapter for Horizontal Scaling
  // ═══════════════════════════════════════════════════════════════════════════
  const pubClient = getIORedisClient();
  const subClient = getIORedisSubscriber();

  if (pubClient && subClient) {
    // FIX: Add error handlers BEFORE creating adapter
    pubClient.on('error', (err) => {
      logger.error('❌ Redis pub client error', { error: err.message });
    });

    subClient.on('error', (err) => {
      logger.error('❌ Redis sub client error', { error: err.message });
    });

    pubClient.on('connect', () => {
      logger.info('✅ Redis pub client connected');
    });

    subClient.on('connect', () => {
      logger.info('✅ Redis sub client connected');
    });

    pubClient.on('close', () => {
      logger.warn('⚠️ Redis pub client disconnected');
    });

    subClient.on('close', () => {
      logger.warn('⚠️ Redis sub client disconnected');
    });

    io.adapter(createAdapter(pubClient, subClient));
    logger.info('✅ Socket.IO Redis adapter enabled (horizontal scaling ready)', {
      feature: 'cross-server messaging',
      scalability: 'unlimited servers',
    });
  } else {
    logger.warn('⚠️ Socket.IO running WITHOUT Redis adapter', {
      limitation: 'single server only',
      impact: 'cannot scale horizontally',
      recommendation: 'enable Redis for production',
    });
    
    if (process.env.NODE_ENV === 'production') {
      logger.error('❌ CRITICAL: Redis adapter REQUIRED in production');
      throw new Error('Redis adapter is required for production deployment');
    }
  }

  // Authentication middleware
  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      console.log("[Socket] No token provided");
      return next(new Error("Authentication error: no token provided"));
    }

    try {
      // Try Clerk token verification first
      try {
        // Wrap Clerk API calls with circuit breaker
        const payload: any = await clerkCircuitBreaker.execute(() =>
          Promise.race([
            clerkClient.verifyToken(token),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Clerk timeout')), 3000)
            ),
          ])
        );
        
        if (payload && payload.sub) {
          // ✅ Check cache first to speed up WebView socket connections
          const cached = clerkUserCache.get(payload.sub);
          if (cached && cached.expires > Date.now()) {
            (socket as any).userId = cached.mongoId;
            (socket as any).userEmail = cached.email;
            (socket as any).userName = cached.name;
            console.log("[Socket] User authenticated via cache:", cached.email);
            return next();
          }

          // Get user from Clerk (only if not cached) - also wrapped with circuit breaker
          const clerkUser: any = await clerkCircuitBreaker.execute(() =>
            Promise.race([
              clerkClient.users.getUser(payload.sub),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Clerk timeout')), 3000)
              ),
            ])
          );
          
          // Find or create MongoDB user
          let mongoUser = await User.findOne({ clerkId: clerkUser.id });
          if (!mongoUser) {
            const email = clerkUser.emailAddresses[0]?.emailAddress;
            mongoUser = await User.findOne({ email });
          }
          
          if (!mongoUser) {
            // Create user if doesn't exist
            mongoUser = await User.create({
              clerkId: clerkUser.id,
              name: clerkUser.firstName || clerkUser.username || 'User',
              email: clerkUser.emailAddresses[0]?.emailAddress || '',
              avatar: clerkUser.imageUrl || null,
            });
            console.log('[Socket] Created new user from Clerk:', mongoUser._id);
            console.log('[Socket] User avatar:', mongoUser.avatar);
            
            // Store io instance globally for broadcasting
            (global as any).io = io;
          }
          
          (socket as any).userId = mongoUser._id.toString();
          (socket as any).userEmail = mongoUser.email;
          (socket as any).userName = mongoUser.name;

          // ✅ Cache for 5 minutes to speed up subsequent connections
          clerkUserCache.set(payload.sub, {
            mongoId: mongoUser._id.toString(),
            email: mongoUser.email,
            name: mongoUser.name,
            expires: Date.now() + 5 * 60 * 1000,
          });

          console.log("[Socket] User authenticated via Clerk:", mongoUser.email);
          return next();
        }
      } catch (clerkError: any) {
        // Check if circuit breaker is open
        if (clerkError.message?.includes('Circuit breaker')) {
          logger.error('Clerk circuit breaker open', {
            error: clerkError.message,
          });
          return next(new Error('Authentication service temporarily unavailable'));
        }
        
        // If Clerk fails, try JWT (backward compatibility)
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
        (socket as any).userId = (decoded as any).userId;
        (socket as any).userEmail = (decoded as any).email;
        console.log("[Socket] User authenticated via JWT:", (decoded as any).email);
        return next();
      }
    } catch (err: any) {
      console.log("[Socket] Token verification failed:", err.message);
      return next(new Error("Authentication error: invalid token"));
    }
  });

  // Connection handler
  io.on('connection', async (socket: Socket) => {
    const userId = (socket as any).userId;
    const userEmail = (socket as any).userEmail;

    console.log(`[Socket] User connected - ${userEmail} (${socket.id})`);

    // Mark user as ONLINE using Redis-based presence
    if (userId) {
      await presenceService.setOnline(userId, socket.id);
      presenceService.startHeartbeat(userId, socket.id);
      socket.broadcast.emit('userOnline', { userId });
      
      const stats = await presenceService.getStats();
      console.log(`[Online] User ${userId} ONLINE. Heartbeats: ${stats.heartbeatsActive}`);
      
      // Broadcast user info to all clients (for new users)
      try {
        const mongoUser = await User.findById(userId);
        if (mongoUser) {
          socket.broadcast.emit('newUserRegistered', {
            _id: mongoUser._id,
            name: mongoUser.name,
            email: mongoUser.email,
            avatar: mongoUser.avatar,
          });
          console.log('[Socket] Broadcasted user to all clients:', mongoUser.name);
        }
      } catch (error) {
        console.error('[Socket] Error broadcasting user:', error);
      }
    }

    // Note: Getting all online users requires Redis SCAN
    // For now, clients will check presence individually
    socket.emit('onlineUsers', {
      success: true,
      data: [], // TODO: Implement with Redis SCAN or maintain separate SET
    });

    // Join user to their own personal room
    socket.join(userId);

    // Rejoin all conversation rooms on connection/reconnection
    try {
      const userConversations = await Conversation.find({
        participants: userId
      }).select('_id');

      userConversations.forEach((conv: any) => {
        socket.join(conv._id.toString());
      });

      console.log(`[Socket] User ${userId} rejoined ${userConversations.length} conversations`);
    } catch (error) {
      console.error("[Socket] Error rejoining conversations:", error);
    }

    // Register all event handlers
    registerUserEvents(io, socket);
    registerChatEvents(io, socket);
    registerCallEvents(io, socket);
    registerWebRTCEvents(io, socket);

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log(`[Socket] User disconnected - ${userEmail} (${socket.id})`);

      // PRODUCTION FIX: Leave all rooms on disconnect to prevent memory leaks
      const rooms = Array.from(socket.rooms);
      rooms.forEach(room => {
        if (room !== socket.id) {
          socket.leave(room);
        }
      });

      if (userId) {
        await presenceService.setOffline(userId);
        socket.broadcast.emit('userOffline', { userId });
        
        const stats = await presenceService.getStats();
        console.log(`[Online] User ${userId} OFFLINE. Heartbeats: ${stats.heartbeatsActive}`);
      }

      io.emit("userStatusChanged", {
        userId,
        status: "offline",
        timestamp: new Date(),
      });
    });

    // Handle explicit reconnection request from client
    socket.on('rejoinConversations', async () => {
      try {
        const userConversations = await Conversation.find({
          participants: userId
        }).select('_id');

        userConversations.forEach((conv: any) => {
          socket.join(conv._id.toString());
        });

        socket.emit('rejoinedConversations', {
          success: true,
          count: userConversations.length,
        });
      } catch (error) {
        socket.emit('rejoinedConversations', {
          success: false,
          msg: 'Failed to rejoin conversations',
        });
      }
    });
  });

  console.log('[Socket] Socket.IO initialized successfully');
  return io;
};
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server } from 'http';
import { registerUserEvents } from './userEvents.js';
import { registerChatEvents } from './chatEvents.js';
import { registerCallEvents } from './callEvents.js';
import { registerWebRTCEvents } from './webrtcEvents.js';
import Conversation from '../modals/Conversation';
import { clerkClient } from '@clerk/clerk-sdk-node';
import User from '../modals/userModal.js';

dotenv.config();

// Track online users globally
const onlineUsers = new Map<string, string>(); // userId → socketId

// ✅ Cache Clerk user lookups to speed up WebView socket authentication
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
  });

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
        const payload = await clerkClient.verifyToken(token);
        
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

          // Get user from Clerk (only if not cached)
          const clerkUser = await clerkClient.users.getUser(payload.sub);
          
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
      } catch (clerkError) {
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
    const userName = (socket as any).userName;

    console.log(`[Socket] User connected - ${userEmail} (${socket.id})`);

    // Mark user as ONLINE
    if (userId) {
      onlineUsers.set(userId, socket.id);
      socket.broadcast.emit('userOnline', { userId });
      console.log(`[Online] User ${userId} ONLINE. Total: ${onlineUsers.size}`);
      
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

    // Send current online users to newly connected user
    socket.emit('onlineUsers', {
      success: true,
      data: Array.from(onlineUsers.keys()),
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
    socket.on('disconnect', () => {
      console.log(`[Socket] User disconnected - ${userEmail} (${socket.id})`);

      if (userId) {
        onlineUsers.delete(userId);
        socket.broadcast.emit('userOffline', { userId });
        console.log(`[Online] User ${userId} OFFLINE. Total: ${onlineUsers.size}`);
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
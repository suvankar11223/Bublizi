import { Server as SocketIOServer, Socket } from "socket.io";
import Conversation from "../modals/Conversation";
import Message from "../modals/Message";
import { generateAIResponse, containsAIMention, AI_BOT_ID } from './aiService.js';
import { verifyConversationAccess, verifyMessageOwnership } from '../middleware/socketOwnership.js';
import { checkSocketRateLimit } from '../middleware/socketRateLimit.js';
import { enqueueMessage } from '../config/bullmq.js';
import { redis } from '../config/redis.js';
import { validateSocketData, socketSchemas } from '../middleware/validation.js';
import { logger } from '../utils/logger.js';

// Debug logging helper
const logDebug = (message: string, ...args: any[]) => {
  console.log(`[ChatEvents:${new Date().toISOString()}]`, message, ...args);
};

export function registerChatEvents(io: SocketIOServer, socket: Socket) {
  socket.on("getConversations", async (data?: { limit?: number; skip?: number }) => {
    logDebug('=== getConversations EVENT ===');
    try {
      const userId = (socket as any).userId;
      logDebug('User ID:', userId);
      
      if (!userId) {
        logDebug('ERROR: No userId found on socket');
        socket.emit("getConversations", {
          success: false,
          msg: "Unauthorized",
        });
        return;
      }

      // PRODUCTION FIX: Add pagination (default 100 conversations)
      const limit = data?.limit || 100;
      const skip = data?.skip || 0;

      // PRODUCTION FIX: Use aggregation to prevent N+1 queries
      // This reduces 201 queries to 1 query for 100 conversations
      const conversations = await Conversation.aggregate([
        // Match conversations where user is participant
        { $match: { participants: userId } },
        
        // Sort by most recent
        { $sort: { updatedAt: -1 } },
        
        // Pagination
        { $skip: skip },
        { $limit: limit },
        
        // Lookup lastMessage (replaces populate)
        {
          $lookup: {
            from: 'messages',
            localField: 'lastMessage',
            foreignField: '_id',
            as: 'lastMessageData'
          }
        },
        
        // Lookup participants (replaces populate)
        {
          $lookup: {
            from: 'users',
            localField: 'participants',
            foreignField: '_id',
            as: 'participantsData'
          }
        },
        
        // Project fields
        {
          $project: {
            type: 1,
            name: 1,
            avatar: 1,
            createdBy: 1,
            unreadCount: 1,
            pinnedBy: 1,
            mutedBy: 1,
            archivedBy: 1,
            createdAt: 1,
            updatedAt: 1,
            lastMessage: { $arrayElemAt: ['$lastMessageData', 0] },
            participants: {
              $map: {
                input: '$participantsData',
                as: 'participant',
                in: {
                  _id: '$$participant._id',
                  name: '$$participant.name',
                  avatar: '$$participant.avatar',
                  email: '$$participant.email'
                }
              }
            }
          }
        }
      ]);

      logDebug(`Found ${conversations.length} conversations (limit: ${limit}, skip: ${skip})`);

      // Add unread count for each conversation
      const conversationsWithUnread = conversations.map((conv: any) => ({
        ...conv,
        unreadCount: conv.unreadCount?.get(userId.toString()) || 0,
      }));

      socket.emit("getConversations", {
        success: true,
        data: conversationsWithUnread,
        pagination: {
          limit,
          skip,
          hasMore: conversations.length === limit
        }
      });

      logDebug(`Socket: Sent ${conversations.length} conversations to user ${userId}`);
      logDebug('=== getConversations COMPLETED ===');
    } catch (error: any) {
      logDebug('getConversations ERROR:', error.message);
      socket.emit("getConversations", {
        success: false,
        msg: "Failed to fetch conversations",
      });
    }
  });

  socket.on("newConversation", async (data) => {
    console.log("=== NEW CONVERSATION EVENT RECEIVED ===");
    console.log("Socket ID:", socket.id);
    console.log("User ID:", (socket as any).userId);
    console.log("Data:", JSON.stringify(data, null, 2));

    try {
      const userId = (socket as any).userId;

      if (!userId) {
        console.log("ERROR: No userId found on socket");
        socket.emit("newConversation", {
          success: false,
          msg: "Unauthorized - no user ID",
        });
        return;
      }

      if (data.type === 'direct') {
        console.log("Checking for existing direct conversation...");
        // check if already exists
        const existingConversation = await Conversation.findOne({
          type: "direct",
          participants: { $all: data.participants, $size: 2 },
        });

        if (existingConversation) {
          console.log("Direct conversation already exists:", existingConversation._id);
          
          // Populate the existing conversation
          const populated = await Conversation.findById(existingConversation._id)
            .populate({
              path: "participants",
              select: "name avatar email"
            }).lean();
          
          socket.emit("newConversation", {
            success: true,
            data: populated,
            msg: "Conversation already exists",
          });
          return;
        }
        
        console.log("No existing conversation found, creating new one...");
      }

      // Create new conversation
      console.log("Creating new conversation with data:", {
        type: data.type,
        name: data.name || null,
        participants: data.participants,
        createdBy: userId,
        avatar: data.avatar || "",
      });
      
      const newConversation = await Conversation.create({
        type: data.type,
        name: data.name || null,
        participants: data.participants,
        createdBy: userId,
        avatar: data.avatar || "",
      });

      console.log("New conversation created successfully:", newConversation._id);

      // Get all connected sockets that are participants
      const connectedSockets = Array.from(io.sockets.sockets.values()).filter(
        (s) => data.participants.includes((s as any).userId)
      );

      console.log("Found", connectedSockets.length, "connected participants");

      // Join this conversation by all online participants
      connectedSockets.forEach((participantSocket) => {
        participantSocket.join(newConversation._id.toString());
        console.log("Socket", participantSocket.id, "joined room", newConversation._id.toString());
      });

      // Send conversation data back (populated)
      const populatedConversation = await Conversation.findById(newConversation._id)
        .populate({
          path: "participants",
          select: "name avatar email"
        }).lean();

      if (!populatedConversation) {
        throw new Error("Failed to populate conversation");
      }

      console.log("Emitting newConversation to room:", newConversation._id.toString());
      console.log("Populated conversation:", JSON.stringify(populatedConversation, null, 2));

      // Emit conversation to all participants individually
      const allSockets = Array.from(io.sockets.sockets.values());
      data.participants.forEach((participantId: string) => {
        const participantSockets = allSockets.filter(
          (s) => (s as any).userId === participantId
        );
        
        participantSockets.forEach((participantSocket) => {
          participantSocket.emit("newConversation", {
            success: true,
            data: { ...populatedConversation, isNew: true },
          });
          console.log(`Emitted newConversation to participant ${participantId}, socket: ${participantSocket.id}`);
        });
      });
      
      console.log("=== NEW CONVERSATION EVENT COMPLETED ===");

    } catch (error: any) {
      console.log("=== NEW CONVERSATION ERROR ===");
      console.log("Error:", error);
      console.log("Error message:", error.message);
      console.log("Error stack:", error.stack);
      
      socket.emit("newConversation", {
        success: false,
        msg: "Failed to create conversation: " + error.message,
      });
    }
  });

  socket.on("newMessage", async (data) => {
    console.log('=== NEW MESSAGE EVENT ===');
    console.log('From:', (socket as any).userEmail);
    console.log('Content:', data.content);
    console.log('Has attachment:', !!data.attachment);
    
    try {
      // ── STEP 1: INPUT VALIDATION (PHASE 0 SECURITY) ────────────────────────
      const validator = validateSocketData(socketSchemas.newMessage);
      const validationResult = validator(data);
      
      if (!validationResult.valid) {
        logger.warn('Socket validation failed', {
          event: 'newMessage',
          error: validationResult.error,
          userId: (socket as any).userId,
          userEmail: (socket as any).userEmail,
        });
        socket.emit("newMessage", {
          success: false,
          msg: validationResult.error || 'Invalid message data',
        });
        console.log('⚠️ Validation failed:', validationResult.error);
        return;
      }
      
      // Use sanitized data
      const sanitizedData = validationResult.sanitized || data;

      // ── STEP 2: IDEMPOTENCY CHECK (CRITICAL FIX #2) ────────────────────────
      if (sanitizedData.tempId) {
        const { checkIdempotency, clearIdempotency } = await import('../utils/idempotency.js');
        const isUnique = await checkIdempotency(sanitizedData.tempId);
        
        if (!isUnique) {
          // Duplicate request - return ACK without processing
          socket.emit('messageQueued', {
            tempId: sanitizedData.tempId,
            duplicate: true,
            timestamp: new Date().toISOString(),
          });
          console.log(`⚠️ Duplicate message blocked: ${sanitizedData.tempId}`);
          return;
        }
      }

      // ── STEP 3: RATE LIMITING ──────────────────────────────────────────────
      const rateLimitResult = await checkSocketRateLimit(socket, 'newMessage');
      if (!rateLimitResult.allowed) {
        // Clear idempotency on rate limit failure so user can retry
        if (sanitizedData.tempId) {
          const { clearIdempotency } = await import('../utils/idempotency.js');
          await clearIdempotency(sanitizedData.tempId);
        }
        
        socket.emit("newMessage", {
          success: false,
          msg: "Rate limit exceeded. Please slow down.",
          retryAfter: rateLimitResult.retryAfter,
        });
        console.log('⚠️ Rate limit exceeded for user:', (socket as any).userId);
        return;
      }

      // ── STEP 4: ADDITIONAL VALIDATION ─────────────────────────────────────
      if (!sanitizedData.conversationId || !sanitizedData.sender?.id) {
        throw new Error('Missing conversation ID or sender');
      }
      
      if (!sanitizedData.content && !sanitizedData.attachment) {
        throw new Error('Message must have either content or attachment');
      }

      // ── STEP 5: GENERATE SEQUENCE NUMBER (CRITICAL FIX #3) ─────────────────
      // FAIL FAST - No timestamp fallback
      let seq: number;
      try {
        const seqKey = `seq:${sanitizedData.conversationId}`;
        seq = await redis.incr(seqKey);
        
        if (!seq || seq < 1) {
          throw new Error('Invalid sequence number returned');
        }
        
        console.log(`✓ Generated sequence number: ${seq}`);
      } catch (error: any) {
        console.error('[Sequence] Redis error - FAILING FAST:', error.message);
        
        // Clear idempotency so user can retry
        if (sanitizedData.tempId) {
          const { clearIdempotency } = await import('../utils/idempotency.js');
          await clearIdempotency(sanitizedData.tempId);
        }
        
        socket.emit("newMessage", {
          success: false,
          msg: "Service temporarily unavailable. Please try again.",
          code: 'SEQUENCE_UNAVAILABLE',
          retryable: true,
        });
        return;
      }

      // ── STEP 6: SEND IMMEDIATE ACK ─────────────────────────────────────────
      socket.emit('messageQueued', {
        tempId: sanitizedData.tempId,
        seq,
        timestamp: new Date().toISOString(),
      });

      // ── STEP 7: ENQUEUE FOR BACKGROUND PROCESSING ──────────────────────────
      enqueueMessage({
        conversationId: sanitizedData.conversationId,
        senderId: sanitizedData.sender.id,
        senderName: sanitizedData.sender.name,
        senderAvatar: sanitizedData.sender.avatar,
        content: sanitizedData.content || '',
        attachment: sanitizedData.attachment || null,
        type: 'text',
        seq,
        tempId: sanitizedData.tempId,
        roomId: sanitizedData.conversationId,
      });

      console.log(`✓ Message enqueued with seq ${seq}`);

      // ── STEP 8: @AI TRIGGER ────────────────────────────────────────────────
      if (sanitizedData.content && containsAIMention(sanitizedData.content)) {
        console.log('[AI] @ai detected — triggering AI response');
        
        // Short delay so user sees their message appear first
        setTimeout(async () => {
          const aiTypingPayload = {
            conversationId: sanitizedData.conversationId,
            userId: AI_BOT_ID,
            userName: 'Chatzi AI',
            isTyping: true,
          };

          // Show typing indicator
          io.to(sanitizedData.conversationId).emit('ai:typing', aiTypingPayload);

          try {
            // Generate AI response (with 15s timeout safety net)
            const aiText = await Promise.race([
              generateAIResponse(
                sanitizedData.conversationId,
                sanitizedData.content,
                sanitizedData.sender.name || 'User'
              ),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Gemini timeout')), 15000)
              ),
            ]);

            // Generate sequence number for AI message (FAIL FAST)
            let aiSeq: number;
            try {
              const seqKey = `seq:${sanitizedData.conversationId}`;
              aiSeq = await redis.incr(seqKey);
              
              if (!aiSeq || aiSeq < 1) {
                throw new Error('Invalid AI sequence number');
              }
            } catch (error: any) {
              console.error('[AI Sequence] Redis error - skipping AI response:', error.message);
              return; // Skip AI response if sequence fails
            }

            // Enqueue AI message
            enqueueMessage({
              conversationId: sanitizedData.conversationId,
              senderId: AI_BOT_ID,
              senderName: 'Chatzi AI',
              senderAvatar: '',
              content: aiText,
              type: 'ai',
              seq: aiSeq,
              roomId: sanitizedData.conversationId,
              isAI: true,
            });

            console.log('[AI] ✅ Response queued');
          } catch (aiErr: any) {
            console.error('[AI] ❌ Error:', aiErr.message);
            
            // Send a graceful fallback message
            const fallbackText = aiErr.message.includes('timeout')
              ? "Sorry, I'm taking too long. Please try again! 🤖"
              : "I ran into an issue. Try asking me again! 🤖";

            // Queue fallback message (with sequence check)
            try {
              const seqKey = `seq:${sanitizedData.conversationId}`;
              const fallbackSeq = await redis.incr(seqKey);
              
              if (fallbackSeq && fallbackSeq > 0) {
                enqueueMessage({
                  conversationId: sanitizedData.conversationId,
                  senderId: AI_BOT_ID,
                  senderName: 'Chatzi AI',
                  senderAvatar: '',
                  content: fallbackText,
                  type: 'ai',
                  seq: fallbackSeq,
                  roomId: sanitizedData.conversationId,
                  isAI: true,
                });
              }
            } catch (fallbackErr) {
              console.error('[AI] Failed to queue fallback message:', fallbackErr);
            }
          } finally {
            // Always stop typing indicator
            io.to(sanitizedData.conversationId).emit('ai:typing', {
              ...aiTypingPayload,
              isTyping: false,
            });
          }
        }, 600);
      }

      console.log('=== MESSAGE SENT ===');

    } catch (error: any) {
      console.log('=== ERROR ===');
      console.log(error.message);
      
      // Clear idempotency on failure so user can retry
      if (data?.tempId) {
        const { clearIdempotency } = await import('../utils/idempotency.js');
        await clearIdempotency(data.tempId);
      }
      
      socket.emit("newMessage", {
        success: false,
        msg: "Failed to send message: " + error.message,
      });
    }
  });

  socket.on("getMessages", async (data: { conversationId: string; limit?: number; skip?: number; before?: string }) => {
    console.log("=== GET MESSAGES EVENT ===");
    console.log("User:", (socket as any).userEmail);
    console.log("Socket ID:", socket.id);
    console.log("Conversation ID:", data.conversationId);
    
    try {
      // ── INPUT VALIDATION (PHASE 0 SECURITY) ────────────────────────────────
      if (!data.conversationId || typeof data.conversationId !== 'string') {
        socket.emit("getMessages", {
          success: false,
          msg: "Invalid conversation ID",
        });
        return;
      }
      
      // Validate ObjectId format
      const objectIdRegex = /^[0-9a-fA-F]{24}$/;
      if (!objectIdRegex.test(data.conversationId)) {
        socket.emit("getMessages", {
          success: false,
          msg: "Invalid conversation ID format",
        });
        return;
      }

      // ── RATE LIMITING ──────────────────────────────────────────────────────
      // FIX: Add rate limiting to prevent DOS attacks
      const rateLimitResult = await checkSocketRateLimit(socket, 'getMessages');
      if (!rateLimitResult.allowed) {
        socket.emit("getMessages", {
          success: false,
          msg: "Too many requests. Please slow down.",
          retryAfter: rateLimitResult.retryAfter,
        });
        console.log('⚠️ Rate limit exceeded for getMessages');
        return;
      }

      // IDOR Protection: Verify user is participant
      const hasAccess = await verifyConversationAccess(socket, data.conversationId);
      if (!hasAccess) {
        socket.emit("getMessages", {
          success: false,
          msg: "Access denied: You are not a participant in this conversation",
        });
        return;
      }

      // PRODUCTION FIX: Add pagination (default 50 messages per page)
      const limit = data.limit || 50;
      const skip = data.skip || 0;

      // PRODUCTION FIX: Use aggregation to prevent N+1 queries
      // This reduces 1001 queries to 1 query for 1000 messages
      const messages = await Message.aggregate([
        // Match messages in conversation
        { $match: { conversationId: data.conversationId } },
        
        // Sort by most recent
        { $sort: { createdAt: -1 } },
        
        // Pagination
        { $skip: skip },
        { $limit: limit },
        
        // Lookup sender (replaces populate)
        {
          $lookup: {
            from: 'users',
            localField: 'senderId',
            foreignField: '_id',
            as: 'senderData'
          }
        },
        
        // Project fields
        {
          $project: {
            _id: 1,
            content: 1,
            attachment: 1,
            type: 1,
            audioUrl: 1,
            audioDuration: 1,
            reactions: 1,
            createdAt: 1,
            isCallMessage: 1,
            callData: 1,
            isEdited: 1,
            editedAt: 1,
            isDeleted: 1,
            isPinned: 1,
            document: 1,
            readBy: 1,
            isAI: 1,
            seq: 1,
            sender: {
              $let: {
                vars: { senderDoc: { $arrayElemAt: ['$senderData', 0] } },
                in: {
                  id: '$$senderDoc._id',
                  name: '$$senderDoc.name',
                  avatar: '$$senderDoc.avatar'
                }
              }
            }
          }
        }
      ]);

      console.log(`Found ${messages.length} messages (limit: ${limit}, skip: ${skip})`);

      const messagesWithSender = messages.map((message: any) => ({
        id: message._id,
        content: message.content,
        attachment: message.attachment,
        type: message.type || 'text',
        audioUrl: message.audioUrl,
        audioDuration: message.audioDuration,
        reactions: message.reactions || [],
        createdAt: message.createdAt,
        isCallMessage: message.isCallMessage,
        callData: message.callData,
        isEdited: message.isEdited,
        editedAt: message.editedAt,
        isDeleted: message.isDeleted,
        isPinned: message.isPinned,
        document: message.document,
        readBy: message.readBy || [],
        isAI: message.isAI,
        seq: message.seq,
        sender: message.sender,
      }));

      socket.emit("getMessages", {
        success: true,
        data: messagesWithSender,
        pagination: {
          limit,
          skip,
          hasMore: messages.length === limit
        }
      });

      console.log("=== GET MESSAGES COMPLETED ===");

    } catch (error) {
      console.log("=== GET MESSAGES ERROR ===");
      console.log("getMessages error: ", error);
      socket.emit("getMessages", {
        success: false,
        msg: "Failed to fetch messages",
      });
    }
  });

  socket.on("joinConversation", (conversationId: string) => {
    console.log("=== JOIN CONVERSATION EVENT ===");
    console.log("User:", (socket as any).userEmail);
    console.log("Socket ID:", socket.id);
    console.log("Conversation ID:", conversationId);
    
    // ── INPUT VALIDATION (PHASE 0 SECURITY) ────────────────────────────────
    if (!conversationId || typeof conversationId !== 'string') {
      socket.emit("conversationJoined", { 
        success: false,
        msg: "Invalid conversation ID" 
      });
      return;
    }
    
    // Validate ObjectId format
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (!objectIdRegex.test(conversationId)) {
      socket.emit("conversationJoined", { 
        success: false,
        msg: "Invalid conversation ID format" 
      });
      return;
    }
    
    socket.join(conversationId);
    
    // Get all sockets in this room
    const socketsInRoom = io.sockets.adapter.rooms.get(conversationId);
    console.log("Sockets in room:", socketsInRoom ? socketsInRoom.size : 0);
    
    socket.emit("conversationJoined", { conversationId });
    console.log("=== JOIN CONVERSATION COMPLETED ===");
  });

  socket.on("markAsRead", async (data: { conversationId: string }) => {
    console.log("=== MARK AS READ EVENT ===");
    console.log("User:", (socket as any).userEmail);
    console.log("Conversation ID:", data.conversationId);
    
    try {
      // ── INPUT VALIDATION (PHASE 0 SECURITY) ────────────────────────────────
      if (!data.conversationId || typeof data.conversationId !== 'string') {
        socket.emit("markAsRead", {
          success: false,
          msg: "Invalid conversation ID",
        });
        return;
      }
      
      // Validate ObjectId format
      const objectIdRegex = /^[0-9a-fA-F]{24}$/;
      if (!objectIdRegex.test(data.conversationId)) {
        socket.emit("markAsRead", {
          success: false,
          msg: "Invalid conversation ID format",
        });
        return;
      }

      const userId = (socket as any).userId;
      if (!userId) {
        socket.emit("markAsRead", {
          success: false,
          msg: "Unauthorized",
        });
        return;
      }

      // IDOR Protection: Verify user is participant
      const hasAccess = await verifyConversationAccess(socket, data.conversationId);
      if (!hasAccess) {
        socket.emit("markAsRead", {
          success: false,
          msg: "Access denied: You are not a participant in this conversation",
        });
        return;
      }

      // Reset unread count for this user in this conversation
      const conversation = await Conversation.findById(data.conversationId);
      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const unreadCount = conversation.unreadCount || new Map();
      unreadCount.set(userId.toString(), 0);
      conversation.unreadCount = unreadCount;
      await conversation.save();

      // Mark all messages in this conversation as read by this user
      await Message.updateMany(
        {
          conversationId: data.conversationId,
          senderId: { $ne: userId },
          readBy: { $ne: userId },
        },
        {
          $addToSet: { readBy: userId },
        }
      );

      socket.emit("markAsRead", {
        success: true,
        data: { conversationId: data.conversationId },
      });

      console.log("✓ Marked conversation as read for user");
      console.log("=== MARK AS READ COMPLETED ===");

    } catch (error: any) {
      console.log("=== MARK AS READ ERROR ===");
      console.log(error.message);
      socket.emit("markAsRead", {
        success: false,
        msg: "Failed to mark as read: " + error.message,
      });
    }
  });

  // Voice message handler
  socket.on("voice:send", async (data) => {
    console.log('=== VOICE MESSAGE EVENT ===');
    console.log('From:', (socket as any).userEmail);
    console.log('Audio URL:', data.audioUrl);
    console.log('Duration:', data.duration);
    
    try {
      // ── RATE LIMITING ──────────────────────────────────────────────────────
      const rateLimitResult = await checkSocketRateLimit(socket, 'voice:send');
      if (!rateLimitResult.allowed) {
        socket.emit("voice:error", {
          success: false,
          msg: "Rate limit exceeded. Please slow down.",
          retryAfter: rateLimitResult.retryAfter,
        });
        return;
      }

      if (!data.conversationId || !data.senderId || !data.audioUrl) {
        throw new Error('Missing required voice message data');
      }

      // FIX #7: Queue voice messages instead of direct DB write
      // Generate sequence number
      let seq: number;
      try {
        const seqKey = `seq:${data.conversationId}`;
        seq = await redis.incr(seqKey);
        console.log(`✓ Generated sequence number for voice: ${seq}`);
      } catch (error) {
        console.error('[Voice Sequence] Redis error, falling back to timestamp');
        seq = Date.now();
      }

      // Send immediate ACK
      socket.emit('messageQueued', {
        tempId: data.tempId,
        seq,
        timestamp: new Date().toISOString(),
      });

      // Enqueue voice message
      enqueueMessage({
        conversationId: data.conversationId,
        senderId: data.senderId,
        senderName: data.senderName || 'User',
        senderAvatar: data.senderAvatar || '',
        content: '',
        type: 'voice',
        audioUrl: data.audioUrl,
        audioDuration: data.duration,
        seq,
        tempId: data.tempId,
        roomId: data.conversationId,
      });

      console.log('✓ Voice message enqueued');

    } catch (error: any) {
      console.log('=== VOICE MESSAGE ERROR ===');
      console.log(error.message);
      socket.emit("voice:error", {
        success: false,
        msg: "Failed to send voice message: " + error.message,
      });
    }
  });

  // Pin message handler
  socket.on("message:pin", async (data) => {
    console.log('=== PIN MESSAGE EVENT ===');
    console.log('Message ID:', data.messageId);
    
    try {
      // ── RATE LIMITING ──────────────────────────────────────────────────────
      const rateLimitResult = await checkSocketRateLimit(socket, 'message:pin');
      if (!rateLimitResult.allowed) {
        socket.emit("message:pin:error", {
          success: false,
          msg: "Rate limit exceeded. Please slow down.",
          retryAfter: rateLimitResult.retryAfter,
        });
        return;
      }

      const userId = (socket as any).userId;
      if (!userId) {
        throw new Error('Unauthorized');
      }

      const message = await Message.findById(data.messageId)
        .populate('senderId', 'name avatar');
      
      if (!message) {
        throw new Error('Message not found');
      }

      message.isPinned = true;
      message.pinnedAt = new Date();
      message.pinnedBy = userId;
      await message.save();

      const pinnedMessageData = {
        _id: message._id,
        content: message.content,
        type: message.type,
        audioUrl: message.audioUrl,
        attachment: message.attachment,
        sender: {
          id: (message.senderId as any)._id,
          name: (message.senderId as any).name,
          avatar: (message.senderId as any).avatar,
        },
      };

      io.to(data.conversationId).emit("message:pinned", {
        success: true,
        message: pinnedMessageData,
      });

      console.log('✓ Message pinned:', message._id);

    } catch (error: any) {
      console.log('=== PIN MESSAGE ERROR ===');
      console.log(error.message);
      socket.emit("message:pin:error", {
        success: false,
        msg: error.message,
      });
    }
  });

  // Unpin message handler
  socket.on("message:unpin", async (data) => {
    console.log('=== UNPIN MESSAGE EVENT ===');
    console.log('Message ID:', data.messageId);
    
    try {
      const message = await Message.findById(data.messageId);
      
      if (!message) {
        throw new Error('Message not found');
      }

      message.isPinned = false;
      message.pinnedAt = undefined;
      message.pinnedBy = undefined;
      await message.save();

      io.to(data.conversationId).emit("message:unpinned", {
        success: true,
        messageId: data.messageId,
      });

      console.log('✓ Message unpinned:', message._id);

    } catch (error: any) {
      console.log('=== UNPIN MESSAGE ERROR ===');
      console.log(error.message);
      socket.emit("message:unpin:error", {
        success: false,
        msg: error.message,
      });
    }
  });

  // Add reaction handler
  socket.on("reaction:add", async (data) => {
    console.log('=== ADD REACTION EVENT ===');
    console.log('Message ID:', data.messageId);
    console.log('Emoji:', data.emoji);
    console.log('User ID:', data.userId);
    
    try {
      // ── RATE LIMITING ──────────────────────────────────────────────────────
      const rateLimitResult = await checkSocketRateLimit(socket, 'reaction:add');
      if (!rateLimitResult.allowed) {
        socket.emit("reaction:error", {
          success: false,
          msg: "Rate limit exceeded. Please slow down.",
          retryAfter: rateLimitResult.retryAfter,
        });
        return;
      }

      const message = await Message.findById(data.messageId);
      
      if (!message) {
        throw new Error('Message not found');
      }

      // Initialize reactions array if it doesn't exist
      if (!message.reactions || !Array.isArray(message.reactions)) {
        message.reactions = [] as any;
      }

      // Find existing reaction with this emoji
      const existingReactionIndex = message.reactions.findIndex(
        (r: any) => r.emoji === data.emoji
      );

      if (existingReactionIndex > -1) {
        // Reaction exists
        const existingReaction = message.reactions[existingReactionIndex];
        const userIndex = existingReaction.users.findIndex(
          (id: any) => id.toString() === data.userId
        );

        if (userIndex > -1) {
          // Remove reaction (toggle off)
          existingReaction.users.splice(userIndex, 1);
          
          // Remove emoji if no users left
          if (existingReaction.users.length === 0) {
            message.reactions.splice(existingReactionIndex, 1);
          }
        } else {
          // Add user to existing reaction
          existingReaction.users.push(data.userId);
        }
      } else {
        // Create new reaction
        (message.reactions as any).push({
          emoji: data.emoji,
          users: [data.userId],
        });
      }

      await message.save();

      // Format reactions for client
      const formattedReactions = message.reactions.map((r: any) => ({
        emoji: r.emoji,
        count: r.users.length,
        users: r.users.map((id: any) => id.toString()),
      }));

      io.to(data.conversationId).emit("reaction:updated", {
        success: true,
        messageId: data.messageId,
        reactions: formattedReactions,
      });

      console.log('✓ Reaction updated:', data.emoji);

    } catch (error: any) {
      console.log('=== ADD REACTION ERROR ===');
      console.log(error.message);
      socket.emit("reaction:error", {
        success: false,
        msg: error.message,
      });
    }
  });

  // Get pinned messages
  socket.on("getPinnedMessages", async (data: { conversationId: string }) => {
    console.log('=== GET PINNED MESSAGES EVENT ===');
    console.log('Conversation ID:', data.conversationId);
    
    try {
      // ── RATE LIMITING ──────────────────────────────────────────────────────
      // FIX: Add rate limiting to prevent DOS attacks
      const rateLimitResult = await checkSocketRateLimit(socket, 'getPinnedMessages');
      if (!rateLimitResult.allowed) {
        socket.emit("pinnedMessages:error", {
          success: false,
          msg: "Too many requests. Please slow down.",
          retryAfter: rateLimitResult.retryAfter,
        });
        console.log('⚠️ Rate limit exceeded for getPinnedMessages');
        return;
      }

      const pinnedMessages = await Message.find({
        conversationId: data.conversationId,
        isPinned: true,
      })
        .sort({ pinnedAt: -1 })
        .limit(3)
        .populate('senderId', 'name avatar')
        .lean();

      const formattedMessages = pinnedMessages.map((msg: any) => ({
        _id: msg._id,
        content: msg.content,
        type: msg.type,
        audioUrl: msg.audioUrl,
        attachment: msg.attachment,
        sender: {
          id: msg.senderId._id,
          name: msg.senderId.name,
          avatar: msg.senderId.avatar,
        },
      }));

      socket.emit("pinnedMessages", {
        success: true,
        data: formattedMessages,
      });

      console.log('✓ Sent', formattedMessages.length, 'pinned messages');

    } catch (error: any) {
      console.log('=== GET PINNED MESSAGES ERROR ===');
      console.log(error.message);
      socket.emit("pinnedMessages:error", {
        success: false,
        msg: error.message,
      });
    }
  });

  // Register additional event handlers
  registerMessageEditDeleteEvents(io, socket);
  registerStoryEvents(io, socket);
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE EDIT & DELETE EVENTS
// ─────────────────────────────────────────────────────────────────────────────
export function registerMessageEditDeleteEvents(io: SocketIOServer, socket: Socket) {
  const userId = (socket as any).userId;

  // ── EDIT MESSAGE ──────────────────────────────────────────────────────────
  socket.on("message:edit", async (data: {
    messageId: string;
    newContent: string;
    conversationId: string;
  }) => {
    try {
      // ── RATE LIMITING ──────────────────────────────────────────────────────
      const rateLimitResult = await checkSocketRateLimit(socket, 'message:edit');
      if (!rateLimitResult.allowed) {
        socket.emit("message:edit:error", {
          success: false,
          msg: "Rate limit exceeded. Please slow down.",
          retryAfter: rateLimitResult.retryAfter,
        });
        return;
      }

      // IDOR Protection: Verify message ownership
      const isOwner = await verifyMessageOwnership(socket, data.messageId);
      if (!isOwner) {
        socket.emit("message:edit:error", { 
          success: false, 
          msg: "Access denied: You can only edit your own messages" 
        });
        return;
      }

      const message = await Message.findById(data.messageId);
      if (!message) throw new Error("Message not found");
      if (message.isDeleted) throw new Error("Cannot edit deleted message");
      if (message.type !== 'text') throw new Error("Only text messages can be edited");

      // Save original on first edit
      if (!message.isEdited) message.originalContent = message.content;

      message.content = data.newContent.trim();
      message.isEdited = true;
      message.editedAt = new Date();
      await message.save();

      io.to(data.conversationId).emit("message:edited", {
        success: true,
        messageId: data.messageId,
        newContent: message.content,
        editedAt: message.editedAt,
      });
    } catch (err: any) {
      socket.emit("message:edit:error", { success: false, msg: err.message });
    }
  });

  // ── DELETE MESSAGE ────────────────────────────────────────────────────────
  socket.on("message:delete", async (data: {
    messageId: string;
    conversationId: string;
    deleteFor: 'me' | 'everyone';
  }) => {
    try {
      // ── RATE LIMITING ──────────────────────────────────────────────────────
      const rateLimitResult = await checkSocketRateLimit(socket, 'message:delete');
      if (!rateLimitResult.allowed) {
        socket.emit("message:delete:error", {
          success: false,
          msg: "Rate limit exceeded. Please slow down.",
          retryAfter: rateLimitResult.retryAfter,
        });
        return;
      }

      const message = await Message.findById(data.messageId);
      if (!message) throw new Error("Message not found");

      if (data.deleteFor === 'everyone') {
        // IDOR Protection: Only owner can delete for everyone
        const isOwner = await verifyMessageOwnership(socket, data.messageId);
        if (!isOwner) {
          socket.emit("message:delete:error", { 
            success: false, 
            msg: "Access denied: You can only delete your own messages for everyone" 
          });
          return;
        }

        message.isDeleted = true;
        message.deletedAt = new Date();
        message.content = '';
        message.attachment = undefined;
        (message as any).document = undefined;
        message.audioUrl = undefined;
        await message.save();

        io.to(data.conversationId).emit("message:deleted", {
          success: true,
          messageId: data.messageId,
          deleteFor: 'everyone',
        });
      } else {
        // Delete for me only - anyone can do this
        await Message.findByIdAndUpdate(data.messageId, {
          $addToSet: { deletedFor: userId },
        });

        socket.emit("message:deleted", {
          success: true,
          messageId: data.messageId,
          deleteFor: 'me',
        });
      }
    } catch (err: any) {
      socket.emit("message:delete:error", { success: false, msg: err.message });
    }
  });

  // ── SEND DOCUMENT ─────────────────────────────────────────────────────────
  socket.on("document:send", async (data: {
    conversationId: string;
    senderId: string;
    senderName: string;
    senderAvatar: string;
    document: { url: string; name: string; size: number; mimeType: string; };
    tempId?: string;
  }) => {
    try {
      // FIX #9: Add rate limiting to document send
      const rateLimitResult = await checkSocketRateLimit(socket, 'document:send');
      if (!rateLimitResult.allowed) {
        socket.emit("document:error", {
          success: false,
          msg: "Rate limit exceeded. Please slow down.",
          retryAfter: rateLimitResult.retryAfter,
        });
        return;
      }

      if (!data.conversationId || !data.senderId || !data.document?.url) {
        throw new Error('Missing required document data');
      }

      // FIX #8: Queue document messages instead of direct DB write
      // Generate sequence number
      let seq: number;
      try {
        const seqKey = `seq:${data.conversationId}`;
        seq = await redis.incr(seqKey);
        console.log(`✓ Generated sequence number for document: ${seq}`);
      } catch (error) {
        console.error('[Document Sequence] Redis error, falling back to timestamp');
        seq = Date.now();
      }

      // Send immediate ACK
      socket.emit('messageQueued', {
        tempId: data.tempId,
        seq,
        timestamp: new Date().toISOString(),
      });

      // Enqueue document message
      enqueueMessage({
        conversationId: data.conversationId,
        senderId: data.senderId,
        senderName: data.senderName,
        senderAvatar: data.senderAvatar,
        content: data.document.name,
        type: 'document',
        document: data.document,
        seq,
        tempId: data.tempId,
        roomId: data.conversationId,
      });

      console.log('✓ Document message enqueued');
    } catch (err: any) {
      socket.emit("document:error", { success: false, msg: err.message });
    }
  });

  // ── BLOCK USER ────────────────────────────────────────────────────────────
  socket.on("user:block", async (data: { targetUserId: string }) => {
    try {
      const User = (await import('../modals/userModal.js')).default;
      await User.findByIdAndUpdate(userId, {
        $addToSet: { blockedUsers: data.targetUserId },
      });

      socket.emit("user:blocked", { success: true, blockedUserId: data.targetUserId });
    } catch (err: any) {
      socket.emit("user:block:error", { success: false, msg: err.message });
    }
  });

  // ── UNBLOCK USER ──────────────────────────────────────────────────────────
  socket.on("user:unblock", async (data: { targetUserId: string }) => {
    try {
      const User = (await import('../modals/userModal.js')).default;
      await User.findByIdAndUpdate(userId, {
        $pull: { blockedUsers: data.targetUserId },
      });

      socket.emit("user:unblocked", { success: true, unblockedUserId: data.targetUserId });
    } catch (err: any) {
      socket.emit("user:unblock:error", { success: false, msg: err.message });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// STORIES & STATUS EVENTS
// ─────────────────────────────────────────────────────────────────────────────
export function registerStoryEvents(io: SocketIOServer, socket: Socket) {
  const userId = (socket as any).userId;

  // ── POST STORY ────────────────────────────────────────────────────────────
  socket.on("story:post", async (data: {
    mediaUrl: string;
    mediaType: 'image' | 'video';
    caption?: string;
  }) => {
    try {
      // ── RATE LIMITING ──────────────────────────────────────────────────────
      const rateLimitResult = await checkSocketRateLimit(socket, 'story:post');
      if (!rateLimitResult.allowed) {
        socket.emit("story:error", {
          success: false,
          msg: "Rate limit exceeded. Please slow down.",
          retryAfter: rateLimitResult.retryAfter,
        });
        return;
      }

      const User = (await import('../modals/userModal.js')).default;
      const story = {
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType || 'image',
        caption: data.caption || '',
        viewers: [],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };

      const user = await User.findByIdAndUpdate(userId,
        { $push: { stories: story } },
        { new: true }
      ).select('name avatar stories');

      if (!user) throw new Error('User not found');

      const newStory = (user as any).stories[(user as any).stories.length - 1];

      socket.broadcast.emit("story:new", {
        userId,
        userName: (user as any).name,
        userAvatar: (user as any).avatar,
        story: {
          id: newStory._id,
          mediaUrl: newStory.mediaUrl,
          mediaType: newStory.mediaType,
          caption: newStory.caption,
          expiresAt: newStory.expiresAt,
          createdAt: newStory.createdAt,
          viewCount: 0,
        },
      });

      socket.emit("story:posted", {
        success: true,
        story: { id: newStory._id, ...newStory },
      });
    } catch (err: any) {
      socket.emit("story:error", { success: false, msg: err.message });
    }
  });

  // ── VIEW STORY ────────────────────────────────────────────────────────────
  socket.on("story:view", async (data: { storyOwnerId: string; storyId: string }) => {
    try {
      const User = (await import('../modals/userModal.js')).default;
      await User.updateOne(
        { _id: data.storyOwnerId, "stories._id": data.storyId },
        { $addToSet: { "stories.$.viewers": userId } }
      );

      const allSockets = Array.from(io.sockets.sockets.values());
      const ownerSockets = allSockets.filter((s) => (s as any).userId === data.storyOwnerId);

      ownerSockets.forEach((s) => {
        s.emit("story:viewed", { storyId: data.storyId, viewerId: userId });
      });
    } catch (err: any) {
      console.error('[Story] view error:', err.message);
    }
  });

  // ── DELETE STORY ──────────────────────────────────────────────────────────
  socket.on("story:delete", async (data: { storyId: string }) => {
    try {
      const User = (await import('../modals/userModal.js')).default;
      await User.findByIdAndUpdate(userId, {
        $pull: { stories: { _id: data.storyId } },
      });

      socket.emit("story:deleted", { success: true, storyId: data.storyId });
    } catch (err: any) {
      socket.emit("story:error", { success: false, msg: err.message });
    }
  });

  // ── GET ALL STORIES ───────────────────────────────────────────────────────
  socket.on("stories:get", async () => {
    try {
      const User = (await import('../modals/userModal.js')).default;
      const now = new Date();
      const usersWithStories = await User.find({
        "stories.0": { $exists: true },
        "stories.expiresAt": { $gt: now },
      }).select('name avatar stories').lean();

      const storiesData = usersWithStories.map((user: any) => {
        const activeStories = user.stories.filter((s: any) => new Date(s.expiresAt) > now);
        if (!activeStories.length) return null;

        return {
          userId: user._id,
          userName: user.name,
          userAvatar: user.avatar,
          stories: activeStories.map((s: any) => ({
            id: s._id,
            mediaUrl: s.mediaUrl,
            mediaType: s.mediaType,
            caption: s.caption,
            expiresAt: s.expiresAt,
            createdAt: s.createdAt,
            viewCount: s.viewers?.length || 0,
            isViewedByMe: s.viewers?.map((v: any) => v.toString()).includes(userId),
          })),
        };
      }).filter(Boolean);

      socket.emit("stories:data", { success: true, data: storiesData });
    } catch (err: any) {
      socket.emit("stories:error", { success: false, msg: err.message });
    }
  });

  // ── UPDATE STATUS TEXT ────────────────────────────────────────────────────
  socket.on("status:update", async (data: { text: string; emoji: string }) => {
    try {
      const User = (await import('../modals/userModal.js')).default;
      const user = await User.findByIdAndUpdate(userId,
        {
          "status.text": data.text,
          "status.emoji": data.emoji,
          "status.updatedAt": new Date(),
        },
        { new: true }
      ).select('name status');

      socket.emit("status:updated", { success: true, status: (user as any)?.status });

      socket.broadcast.emit("status:changed", {
        userId,
        status: (user as any)?.status,
      });
    } catch (err: any) {
      socket.emit("status:error", { success: false, msg: err.message });
    }
  });
}


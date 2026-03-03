import { Server as SocketIOServer, Socket } from "socket.io";
import Conversation from "../modals/Conversation";
import Message from "../modals/Message";

// Debug logging helper
const logDebug = (message: string, ...args: any[]) => {
  console.log(`[ChatEvents:${new Date().toISOString()}]`, message, ...args);
};

export function registerChatEvents(io: SocketIOServer, socket: Socket) {
  socket.on("getConversations", async () => {
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

      const conversations = await Conversation.find({
        participants: userId
      })
      .sort({ updatedAt: -1 })
      .populate({
        path: "lastMessage",
        select: "content senderId attachment createdAt"
      })
      .populate({
        path: "participants",
        select: "name avatar email",
      })
      .lean();

      logDebug(`Found ${conversations.length} conversations`);

      // Add unread count for each conversation
      const conversationsWithUnread = conversations.map((conv: any) => ({
        ...conv,
        unreadCount: conv.unreadCount?.get(userId.toString()) || 0,
      }));

      socket.emit("getConversations", {
        success: true,
        data: conversationsWithUnread,
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
      // Validate data - require either content OR attachment
      if (!data.conversationId || !data.sender?.id) {
        throw new Error('Missing conversation ID or sender');
      }
      
      if (!data.content && !data.attachment) {
        throw new Error('Message must have either content or attachment');
      }

      // Create message in database
      const message = await Message.create({
        conversationId: data.conversationId,
        senderId: data.sender.id,
        content: data.content || '',
        attachment: data.attachment || null,
        readBy: [data.sender.id], // Sender has read their own message
      });

      console.log('✓ Message saved:', message._id);

      const messageData = {
        success: true,
        data: {
          id: message._id.toString(),
          content: data.content || '',
          sender: {
            id: data.sender.id,
            name: data.sender.name,
            avatar: data.sender.avatar,
          },
          attachment: data.attachment || null,
          createdAt: message.createdAt.toISOString(),
          conversationId: data.conversationId,
        },
      };

      // EMIT IMMEDIATELY to conversation room (fastest delivery)
      io.to(data.conversationId).emit("newMessage", messageData);
      console.log('✓ Emitted to room:', data.conversationId);

      // Update conversation's lastMessage and increment unread counts in background
      Conversation.findById(data.conversationId).then(async (conversation) => {
        if (!conversation) return;

        // Increment unread count for all participants except sender
        const unreadCount = conversation.unreadCount || new Map();
        conversation.participants.forEach((participantId: any) => {
          const participantIdStr = participantId.toString();
          if (participantIdStr !== data.sender.id) {
            const currentCount = unreadCount.get(participantIdStr) || 0;
            unreadCount.set(participantIdStr, currentCount + 1);
          }
        });

        conversation.lastMessage = message._id as any;
        conversation.unreadCount = unreadCount;
        conversation.updatedAt = new Date();
        await conversation.save();

        console.log('✓ Updated conversation with unread counts');
      }).catch(err => console.error('Error updating conversation:', err));

      console.log('=== MESSAGE SENT ===');

    } catch (error: any) {
      console.log('=== ERROR ===');
      console.log(error.message);
      socket.emit("newMessage", {
        success: false,
        msg: "Failed to send message: " + error.message,
      });
    }
  });

  socket.on("getMessages", async (data: { conversationId: string }) => {
    console.log("=== GET MESSAGES EVENT ===");
    console.log("User:", (socket as any).userEmail);
    console.log("Socket ID:", socket.id);
    console.log("Conversation ID:", data.conversationId);
    
    try {
      const messages = await Message.find({
        conversationId: data.conversationId,
      })
        .sort({ createdAt: -1 }) // newest first
        .populate({
          path: "senderId",
          select: "name avatar",
        });

      console.log("Found", messages.length, "messages");

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
        sender: {
          id: message.senderId._id,
          name: message.senderId.name,
          avatar: message.senderId.avatar,
        },
      }));

      socket.emit("getMessages", {
        success: true,
        data: messagesWithSender,
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
      const userId = (socket as any).userId;
      if (!userId) {
        socket.emit("markAsRead", {
          success: false,
          msg: "Unauthorized",
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
      if (!data.conversationId || !data.senderId || !data.audioUrl) {
        throw new Error('Missing required voice message data');
      }

      // Create voice message in database
      const message = await Message.create({
        conversationId: data.conversationId,
        senderId: data.senderId,
        content: '', // Empty content for voice messages
        type: 'voice',
        audioUrl: data.audioUrl,
        audioDuration: data.duration,
        readBy: [data.senderId],
      });

      console.log('✓ Voice message saved:', message._id);

      // Get sender info
      const sender = await Message.findById(message._id).populate('senderId', 'name avatar');
      
      const messageData = {
        success: true,
        data: {
          id: message._id.toString(),
          content: '',
          type: 'voice',
          audioUrl: data.audioUrl,
          audioDuration: data.duration,
          sender: {
            id: data.senderId,
            name: (sender as any)?.senderId?.name || 'User',
            avatar: (sender as any)?.senderId?.avatar || '',
          },
          createdAt: message.createdAt.toISOString(),
          conversationId: data.conversationId,
        },
      };

      // Emit to conversation room
      io.to(data.conversationId).emit("voice:received", messageData);
      console.log('✓ Voice message emitted to room:', data.conversationId);

      // Update conversation
      Conversation.findById(data.conversationId).then(async (conversation) => {
        if (!conversation) return;

        const unreadCount = conversation.unreadCount || new Map();
        conversation.participants.forEach((participantId: any) => {
          const participantIdStr = participantId.toString();
          if (participantIdStr !== data.senderId) {
            const currentCount = unreadCount.get(participantIdStr) || 0;
            unreadCount.set(participantIdStr, currentCount + 1);
          }
        });

        conversation.lastMessage = message._id as any;
        conversation.unreadCount = unreadCount;
        conversation.updatedAt = new Date();
        await conversation.save();
      }).catch(err => console.error('Error updating conversation:', err));

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
      const message = await Message.findById(data.messageId);
      if (!message) throw new Error("Message not found");
      if (message.senderId.toString() !== userId) throw new Error("Not authorized");
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
      const message = await Message.findById(data.messageId);
      if (!message) throw new Error("Message not found");

      if (data.deleteFor === 'everyone') {
        if (message.senderId.toString() !== userId) throw new Error("Not authorized");

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
        // Delete for me only
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
  }) => {
    try {
      if (!data.conversationId || !data.senderId || !data.document?.url) {
        throw new Error('Missing required document data');
      }

      const message = await Message.create({
        conversationId: data.conversationId,
        senderId: data.senderId,
        content: data.document.name,
        type: 'document',
        document: data.document,
        readBy: [data.senderId],
      });

      const messageData = {
        success: true,
        data: {
          id: message._id.toString(),
          content: data.document.name,
          type: 'document',
          document: data.document,
          sender: {
            id: data.senderId,
            name: data.senderName,
            avatar: data.senderAvatar,
          },
          createdAt: (message as any).createdAt.toISOString(),
          conversationId: data.conversationId,
        },
      };

      io.to(data.conversationId).emit("newMessage", messageData);

      await Conversation.findByIdAndUpdate(data.conversationId, {
        lastMessage: message._id,
        updatedAt: new Date(),
      });
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


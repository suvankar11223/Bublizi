import { Server as SocketIOServer, Socket } from 'socket.io';
import Message from '../modals/Message.js';
import Conversation from '../modals/Conversation.js';
import Call from '../modals/Call.js';

// Track rooms and their ready state
const readyRooms = new Map<string, NodeJS.Timeout>();

export function registerWebRTCEvents(io: SocketIOServer, socket: Socket) {
  // Join a call room (both caller and receiver join same roomId)
  socket.on('joinCallRoom', async ({ roomId, userId }) => {
    // 🔒 SECURITY FIX: Verify user is authorized to join this call
    const socketUserId = (socket as any).userId;
    
    if (!socketUserId) {
      socket.emit('callFailed', { reason: 'Unauthorized: Not authenticated' });
      return;
    }
    
    // Verify the call exists and user is a participant
    const call = await Call.findOne({ agoraChannel: roomId });
    
    if (!call) {
      socket.emit('callFailed', { reason: 'Invalid room: Call not found' });
      console.log(`[WebRTC] ❌ Invalid room attempt: ${roomId} by user ${socketUserId}`);
      return;
    }
    
    // Check if user is either caller or receiver
    const isParticipant = 
      socketUserId === call.callerId.toString() || 
      socketUserId === call.receiverId.toString();
    
    if (!isParticipant) {
      socket.emit('callFailed', { reason: 'Unauthorized: Not a call participant' });
      console.log(`[WebRTC] ❌ Unauthorized join attempt: ${roomId} by user ${socketUserId}`);
      return;
    }
    
    socket.join(roomId);
    console.log(`[WebRTC] ✅ ${userId} joined room ${roomId} (authorized)`);

    // Cancel any existing timeout for this room
    if (readyRooms.has(roomId)) {
      clearTimeout(readyRooms.get(roomId)!);
    }

    // Count people in room
    const room = io.sockets.adapter.rooms.get(roomId);
    const count = room ? room.size : 0;
    console.log(`[WebRTC] Room ${roomId} now has ${count} people`);

    if (count >= 2) {
      // ✅ Fire immediately if both are here
      io.to(roomId).emit('callRoomReady');
      readyRooms.delete(roomId);
    } else {
      // ✅ Wait up to 15s for the second person
      const timeout = setTimeout(() => {
        const room = io.sockets.adapter.rooms.get(roomId);
        const currentCount = room ? room.size : 0;
        console.log(`[WebRTC] Timeout check - room ${roomId} has ${currentCount} people`);
        if (currentCount >= 2) {
          io.to(roomId).emit('callRoomReady');
        } else {
          // Notify the waiting person no one joined
          io.to(roomId).emit('callFailed', { reason: 'Other person did not join' });
        }
        readyRooms.delete(roomId);
      }, 15000);
      readyRooms.set(roomId, timeout);
    }
  });

  // Forward WebRTC offer to the other person in the room
  socket.on('webrtcOffer', ({ roomId, offer }) => {
    console.log(`[WebRTC] Forwarding offer in room ${roomId}`);
    socket.to(roomId).emit('webrtcOffer', { offer });
  });

  // Forward WebRTC answer to the other person in the room
  socket.on('webrtcAnswer', ({ roomId, answer }) => {
    console.log(`[WebRTC] Forwarding answer in room ${roomId}`);
    socket.to(roomId).emit('webrtcAnswer', { answer });
  });

  // Forward ICE candidates
  socket.on('webrtcIce', ({ roomId, candidate }) => {
    socket.to(roomId).emit('webrtcIce', { candidate });
  });

  // End call room
  socket.on('endCallRoom', async ({ roomId, callData }) => {
    console.log(`[WebRTC] ========== END CALL ROOM ==========`);
    console.log(`[WebRTC] Room ID: ${roomId}`);
    console.log(`[WebRTC] Call data received:`, JSON.stringify(callData, null, 2));
    console.log(`[WebRTC] Has conversationId:`, !!callData?.conversationId);
    console.log(`[WebRTC] Has callerId:`, !!callData?.callerId);
    
    // Create call message if call data provided
    if (callData && callData.conversationId && callData.callerId) {
      try {
        const { conversationId, callerId, duration, callType, status } = callData;
        
        console.log(`[WebRTC] ✅ All required fields present`);
        console.log(`[WebRTC] Creating call message for conversation ${conversationId}`);
        console.log(`[WebRTC] Caller ID: ${callerId}`);
        console.log(`[WebRTC] Duration: ${duration}s`);
        console.log(`[WebRTC] Call type: ${callType}`);
        console.log(`[WebRTC] Status: ${status}`);
        
        // Create call message
        const callMessage = await Message.create({
          conversationId,
          senderId: callerId,
          content: '', // Empty content for call messages
          isCallMessage: true,
          callData: {
            type: callType,
            duration: duration || 0,
            status: status || 'completed',
          },
        });

        console.log(`[WebRTC] ✅ Call message created in DB:`, callMessage._id);
        console.log(`[WebRTC] Message details:`, {
          id: callMessage._id,
          conversationId: callMessage.conversationId,
          senderId: callMessage.senderId,
          isCallMessage: callMessage.isCallMessage,
          callData: callMessage.callData,
        });

        // Populate sender info
        const populatedMessage = await Message.findById(callMessage._id)
          .populate('senderId', 'name avatar');

        console.log(`[WebRTC] ✅ Message populated with sender info`);
        console.log(`[WebRTC] Sender name:`, (populatedMessage.senderId as any)?.name);

        // Update conversation's last message
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: callMessage._id,
        });

        console.log(`[WebRTC] ✅ Conversation lastMessage updated`);

        // Emit to all users in conversation
        const messageData = {
          success: true,
          data: {
            id: populatedMessage._id,
            conversationId: populatedMessage.conversationId,
            sender: {
              id: (populatedMessage.senderId as any)._id,
              name: (populatedMessage.senderId as any).name,
              avatar: (populatedMessage.senderId as any).avatar,
            },
            content: populatedMessage.content,
            isCallMessage: populatedMessage.isCallMessage,
            callData: populatedMessage.callData,
            createdAt: populatedMessage.createdAt,
          },
        };

        console.log(`[WebRTC] Emitting newCallMessage to conversation room ${conversationId}`);
        io.to(conversationId).emit('newCallMessage', messageData);

        // Also emit directly to both caller and receiver by finding their sockets
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          const allSockets = Array.from(io.sockets.sockets.values());
          console.log(`[WebRTC] Total connected sockets: ${allSockets.length}`);
          
          conversation.participants.forEach((participantId: any) => {
            const participantIdStr = participantId.toString();
            const participantSockets = allSockets.filter(
              (s) => (s as any).userId === participantIdStr
            );
            
            console.log(`[WebRTC] Found ${participantSockets.length} sockets for user ${participantIdStr}`);
            
            participantSockets.forEach((s) => {
              console.log(`[WebRTC] Emitting newCallMessage directly to user ${participantIdStr}, socket: ${s.id}`);
              s.emit('newCallMessage', messageData);
            });
          });
        }

        console.log('[WebRTC] ✅ Call message sent successfully');
      } catch (err) {
        console.error('[WebRTC] ❌ Error creating call message:', err);
      }
    } else {
      console.log('[WebRTC] No call data provided, skipping message creation');
    }
    
    io.to(roomId).emit('callEnded');
    socket.leave(roomId);
  });

  // PHASE 1 FIX: Clean up timeouts on disconnect to prevent memory leaks
  socket.on('disconnect', () => {
    console.log(`[WebRTC] Socket disconnected: ${socket.id}`);
    
    // Clean up any pending call room timeouts
    for (const [roomId, timeout] of readyRooms.entries()) {
      const room = io.sockets.adapter.rooms.get(roomId);
      // If room is empty or doesn't exist, clear the timeout
      if (!room || room.size === 0) {
        console.log(`[WebRTC] Clearing timeout for empty room: ${roomId}`);
        clearTimeout(timeout);
        readyRooms.delete(roomId);
      }
    }
  });
}

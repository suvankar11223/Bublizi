import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: String,
    attachment: String,
    type: {
      type: String,
      enum: ['text', 'image', 'voice', 'document'],
      default: 'text',
    },
    // Voice message fields
    audioUrl: String,
    audioDuration: Number, // in seconds
    // Edit tracking
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: Date,
    originalContent: String, // Saved on first edit only
    // Delete tracking
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
    deletedFor: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    // Document metadata
    document: {
      url: String,
      name: String,
      size: Number, // bytes
      mimeType: String,
    },
    // Pinned message
    isPinned: {
      type: Boolean,
      default: false,
    },
    pinnedAt: Date,
    pinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // Reactions
    reactions: [{
      emoji: String,
      users: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }],
    }],
    readBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    // Call message fields
    isCallMessage: {
      type: Boolean,
      default: false,
    },
    callData: {
      type: {
        type: String, // 'voice' or 'video'
        enum: ['voice', 'video'],
      },
      duration: Number, // in seconds
      status: {
        type: String,
        enum: ['completed', 'missed', 'declined'],
      },
    },
    // AI message flag
    isAI: {
      type: Boolean,
      default: false,
    },
    // Message sequence number (for guaranteed ordering)
    seq: {
      type: Number,
      required: true, // 🔥 ENFORCE sequence numbers
      index: true,
    },
    // Temporary ID for idempotency (client-generated)
    tempId: {
      type: String,
      unique: true,
      sparse: true, // Allow null for old messages without tempId
    },
  },
  {
    timestamps: true,
  }
);

// CRITICAL INDEXES - 10-50x faster queries
// Most critical: conversation message fetch (used on every chat open)
messageSchema.index({ conversationId: 1, createdAt: -1 });

// User message history
messageSchema.index({ senderId: 1, createdAt: -1 });

// Pinned message queries
messageSchema.index({ isPinned: 1, conversationId: 1 });

// Message search (enables $text search)
messageSchema.index({ content: 'text' });

// PHASE 3: Sequence-based ordering (guarantees correct order)
// Unique index ensures no duplicate sequences per conversation
messageSchema.index({ conversationId: 1, seq: 1 }, { unique: true, sparse: true });

// PRODUCTION FIX: Index for unread count queries
messageSchema.index({ readBy: 1 });

// ============================================================================
// INDEXES FOR PERFORMANCE (FIX #11)
// ============================================================================

// Primary query: Get messages for a conversation, sorted by time
messageSchema.index({ conversationId: 1, createdAt: -1 });

// Unique constraint: Prevent duplicate sequences in same conversation
messageSchema.index({ conversationId: 1, seq: 1 }, { unique: true });

// Query: Find messages by sender
messageSchema.index({ senderId: 1 });

// Idempotency: Check if tempId already processed
messageSchema.index({ tempId: 1 }, { sparse: true });

// Query: Find pinned messages
messageSchema.index({ conversationId: 1, isPinned: 1 });

// Query: Find unread messages
messageSchema.index({ conversationId: 1, readBy: 1 });

// Query: Find deleted messages (for cleanup)
messageSchema.index({ isDeleted: 1, deletedAt: 1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;

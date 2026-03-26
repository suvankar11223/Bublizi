import mongoose, { Schema } from "mongoose";
import { ConversationProps } from "../types";

const ConversationSchema = new Schema<ConversationProps>(
  {
    type: {
      type: String,
      enum: ['direct', 'group'],
      required: true,
    },
    name: String,
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
      }
    ],
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    avatar: {
      type: String,
      default: "",
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
    // User-specific settings (Map with userId as key)
    pinnedBy: {
      type: Map,
      of: Date,
      default: {},
    },
    mutedBy: {
      type: Map,
      of: Date,
      default: {},
    },
    archivedBy: {
      type: Map,
      of: Date,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// CRITICAL INDEX - Conversation list query (used on home screen)
// Compound index: participants (equality) + updatedAt (sort)
ConversationSchema.index({ participants: 1, updatedAt: -1 });

// Index for lastMessage lookup (prevents N+1)
ConversationSchema.index({ lastMessage: 1 });

// ============================================================================
// INDEXES FOR PERFORMANCE (FIX #11)
// ============================================================================

// Primary query: Get conversations for a user
ConversationSchema.index({ participants: 1 });

// Query: Get recent conversations sorted by update time
ConversationSchema.index({ updatedAt: -1 });

// Query: Find direct conversations between two users
ConversationSchema.index({ type: 1, participants: 1 });

// Query: Find conversations with unread messages
ConversationSchema.index({ 'unreadCount': 1 });

const Conversation = mongoose.model<ConversationProps>("Conversation", ConversationSchema);

export default Conversation;

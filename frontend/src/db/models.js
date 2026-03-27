import { Model, Q } from '@nozbe/watermelondb';
import { field, date, readonly, lazy } from '@nozbe/watermelondb/decorators';

// Conversation Model
export class Conversation extends Model {
  static table = 'conversations';
  static associations = {
    messages: { type: 'has_many', foreignKey: 'conversation_id' },
  };

  @field('server_id') serverId;
  @field('type') type;
  @field('name') name;
  @field('avatar_url') avatarUrl;
  @field('last_message') lastMessage;
  @field('last_message_at') lastMessageAt;
  @field('unread_count') unreadCount;
  @field('is_pinned') isPinned;
  @field('is_archived') isArchived;
  @field('is_muted') isMuted;
  @readonly @date('created_at') createdAt;
  @date('updated_at') updatedAt;

  get members() {
    try {
      return JSON.parse(this._getRaw('members_json') || '[]');
    } catch {
      return [];
    }
  }

  get metadata() {
    try {
      return JSON.parse(this._getRaw('metadata_json') || '{}');
    } catch {
      return {};
    }
  }

  @lazy messages = this.collections
    .get('messages')
    .query(
      Q.where('conversation_id', this.id),
      Q.where('is_deleted', false),
      Q.sortBy('sent_at', Q.desc)
    );

  @lazy pendingMessages = this.collections
    .get('messages')
    .query(
      Q.where('conversation_id', this.id),
      Q.where('status', 'pending')
    );
}

// Message Model
export class Message extends Model {
  static table = 'messages';
  static associations = {
    conversations: { type: 'belongs_to', key: 'conversation_id' },
  };

  @field('server_id') serverId;
  @field('conversation_id') conversationId;
  @field('sender_id') senderId;
  @field('sender_name') senderName;
  @field('sender_avatar') senderAvatar;
  @field('content') content;
  @field('type') type;
  @field('status') status;
  @field('is_outgoing') isOutgoing;
  @field('reply_to_id') replyToId;
  @field('is_deleted') isDeleted;
  @field('is_edited') isEdited;
  @field('local_uri') localUri;
  @field('retry_count') retryCount;
  @date('sent_at') sentAt;
  @date('delivered_at') deliveredAt;
  @date('read_at') readAt;
  @readonly @date('created_at') createdAt;
  @date('updated_at') updatedAt;

  get reactions() {
    try {
      return JSON.parse(this._getRaw('reactions_json') || '{}');
    } catch {
      return {};
    }
  }

  get attachments() {
    try {
      return JSON.parse(this._getRaw('attachments_json') || '[]');
    } catch {
      return [];
    }
  }

  get isPending() {
    return this.status === 'pending';
  }
  get isSent() {
    return this.status === 'sent';
  }
  get isDelivered() {
    return this.status === 'delivered';
  }
  get isRead() {
    return this.status === 'read';
  }
  get isFailed() {
    return this.status === 'failed';
  }
}

// SyncQueueItem Model
export class SyncQueueItem extends Model {
  static table = 'sync_queue';

  @field('operation') operation;
  @field('priority') priority;
  @field('status') status;
  @field('retry_count') retryCount;
  @field('max_retries') maxRetries;
  @field('error') error;
  @readonly @date('created_at') createdAt;
  @date('updated_at') updatedAt;

  get payload() {
    try {
      return JSON.parse(this._getRaw('payload_json') || '{}');
    } catch {
      return {};
    }
  }
}

// User Model
export class User extends Model {
  static table = 'users';

  @field('server_id') serverId;
  @field('name') name;
  @field('phone') phone;
  @field('avatar_url') avatarUrl;
  @field('status') status;
  @field('is_online') isOnline;
  @date('last_seen_at') lastSeenAt;
  @readonly @date('created_at') createdAt;
  @date('updated_at') updatedAt;
}

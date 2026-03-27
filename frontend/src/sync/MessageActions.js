import { messages, conversations } from '../db';
import SyncQueue, { SYNC_OPERATIONS, SYNC_PRIORITY } from './SyncQueue';

class MessageActions {
  async sendMessage(conversationId, content, type = 'text', currentUserId) {
    try {
      const msg = messages();
      const db = msg.database;
      let localMessage = null;
      await db.write(async () => {
        localMessage = await msg.create((record) => {
          const now = Date.now();
          record._setRaw('conversation_id', conversationId);
          record._setRaw('sender_id', currentUserId);
          record._setRaw('content', content);
          record._setRaw('type', type);
          record._setRaw('status', 'pending');
          record._setRaw('is_outgoing', true);
          record._setRaw('is_deleted', false);
          record._setRaw('is_edited', false);
          record._setRaw('retry_count', 0);
          record._setRaw('sent_at', now);
          record._setRaw('created_at', now);
          record._setRaw('updated_at', now);
        });
      });
      await this.updateConversationLastMessage(conversationId, content);
      await SyncQueue.enqueue(SYNC_OPERATIONS.CREATE_MESSAGE, { localId: localMessage.id, conversationId, content, type }, SYNC_PRIORITY.HIGH);
      console.log(`[MessageActions] Message created: ${localMessage.id}`);
      return localMessage;
    } catch (error) {
      console.error('[MessageActions] Send message error:', error);
      throw error;
    }
  }

  async deleteMessage(messageId) {
    try {
      const msg = await messages().find(messageId);
      const db = msg.database;
      await db.write(async () => {
        await msg.update((record) => {
          record._setRaw('is_deleted', true);
          record._setRaw('updated_at', Date.now());
        });
      });
      await SyncQueue.enqueue(SYNC_OPERATIONS.DELETE_MESSAGE, { messageId: msg.serverId || messageId }, SYNC_PRIORITY.NORMAL);
      console.log(`[MessageActions] Message deleted: ${messageId}`);
    } catch (error) {
      console.error('[MessageActions] Delete message error:', error);
      throw error;
    }
  }

  async reactToMessage(messageId, emoji, currentUserId) {
    try {
      const msg = await messages().find(messageId);
      const db = msg.database;
      await db.write(async () => {
        await msg.update((record) => {
          const reactions = msg.reactions || {};
          if (reactions[emoji]) {
            if (reactions[emoji].includes(currentUserId)) {
              reactions[emoji] = reactions[emoji].filter(id => id !== currentUserId);
              if (reactions[emoji].length === 0) delete reactions[emoji];
            } else {
              reactions[emoji].push(currentUserId);
            }
          } else {
            reactions[emoji] = [currentUserId];
          }
          record._setRaw('reactions_json', JSON.stringify(reactions));
          record._setRaw('updated_at', Date.now());
        });
      });
      await SyncQueue.enqueue(SYNC_OPERATIONS.REACT_MESSAGE, { messageId: msg.serverId || messageId, emoji }, SYNC_PRIORITY.NORMAL);
      console.log(`[MessageActions] Reaction added: ${messageId} ${emoji}`);
    } catch (error) {
      console.error('[MessageActions] React to message error:', error);
      throw error;
    }
  }

  async markConversationRead(conversationId) {
    try {
      const conv = await conversations().find(conversationId);
      const db = conv.database;
      await db.write(async () => {
        await conv.update((record) => {
          record._setRaw('unread_count', 0);
          record._setRaw('updated_at', Date.now());
        });
      });
      await SyncQueue.enqueue(SYNC_OPERATIONS.MARK_READ, { conversationId: conv.serverId || conversationId }, SYNC_PRIORITY.LOW);
      console.log(`[MessageActions] Marked as read: ${conversationId}`);
    } catch (error) {
      console.error('[MessageActions] Mark read error:', error);
      throw error;
    }
  }

  async retryFailedMessage(messageId) {
    try {
      const msg = await messages().find(messageId);
      const db = msg.database;
      await db.write(async () => {
        await msg.update((record) => {
          record._setRaw('status', 'pending');
          record._setRaw('retry_count', 0);
          record._setRaw('updated_at', Date.now());
        });
      });
      await SyncQueue.enqueue(SYNC_OPERATIONS.CREATE_MESSAGE, { localId: msg.id, conversationId: msg.conversationId, content: msg.content, type: msg.type }, SYNC_PRIORITY.HIGH);
      console.log(`[MessageActions] Retrying message: ${messageId}`);
    } catch (error) {
      console.error('[MessageActions] Retry failed message error:', error);
      throw error;
    }
  }

  async updateConversationLastMessage(conversationId, content) {
    try {
      const conv = await conversations().find(conversationId);
      const db = conv.database;
      await db.write(async () => {
        await conv.update((record) => {
          record._setRaw('last_message', content.substring(0, 100));
          record._setRaw('last_message_at', Date.now());
          record._setRaw('updated_at', Date.now());
        });
      });
    } catch (error) {
      console.error('[MessageActions] Update last message error:', error);
    }
  }
}

export default new MessageActions();

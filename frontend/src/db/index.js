import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import schema from './schema';
import migrations from './migrations';
import { Conversation, Message, SyncQueueItem, User } from './models';

let _database = null;

export function getDatabase() {
  if (_database) return _database;

  const adapter = new SQLiteAdapter({
    schema,
    migrations,
    dbName: 'bublizi',
    jsi: true, // faster native bridge
    onSetUpError: (error) => {
      console.error('[DB] Setup error:', error);
    },
  });

  _database = new Database({
    adapter,
    modelClasses: [Conversation, Message, SyncQueueItem, User],
  });

  return _database;
}

// Shorthand helpers
export const db = () => getDatabase();
export const conversations = () => getDatabase().collections.get('conversations');
export const messages = () => getDatabase().collections.get('messages');
export const syncQueue = () => getDatabase().collections.get('sync_queue');
export const users = () => getDatabase().collections.get('users');

# 🚀 Offline-First Implementation - Step by Step

## Current Status: Ready to Begin

---

## PHASE 1: Foundation (Database Setup)

### Step 1.1: Install Dependencies

```bash
cd frontend

# Core WatermelonDB
npm install @nozbe/watermelondb

# Network detection
npm install @react-native-community/netinfo

# SQLite adapter (Expo)
npx expo install expo-sqlite

# Note: @react-native-async-storage/async-storage already installed ✅
```

### Step 1.2: Configure Babel

Update `frontend/babel.config.js`:

```javascript
module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Add these for WatermelonDB decorators
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      ['@babel/plugin-proposal-class-properties', { loose: true }],
      // Keep existing plugins
      'react-native-reanimated/plugin',
    ],
  };
};
```

### Step 1.3: Create Database Schema

Create `frontend/src/db/schema.js`:
- Define 4 tables: conversations, messages, sync_queue, users
- Add proper indexes for performance
- Version 1 schema

### Step 1.4: Create Models

Create `frontend/src/db/models.js`:
- Conversation model with @field decorators
- Message model with status tracking
- SyncQueueItem model for offline operations
- User model for caching

### Step 1.5: Create Migrations

Create `frontend/src/db/migrations.js`:
- Empty migrations array (v1 is initial)
- Structure for future schema changes

### Step 1.6: Create Database Singleton

Create `frontend/src/db/index.js`:
- Initialize SQLiteAdapter
- Create Database instance
- Export collection helpers

### Step 1.7: Test Database

Create `frontend/src/db/__tests__/db.test.js`:
- Test database initialization
- Test model creation
- Test queries

---

## PHASE 2: Sync Infrastructure

### Step 2.1: Create Utilities

**Create `frontend/src/utils/EventEmitter.js`:**
- Lightweight event emitter for React Native
- on(), off(), once(), emit() methods

**Create `frontend/src/utils/id.js`:**
- generateLocalId() - creates unique local IDs
- isLocalId() - checks if ID is local

### Step 2.2: Create SyncEngine

Create `frontend/src/sync/SyncEngine.js`:
- NetInfo integration for online/offline detection
- Queue draining with exponential backoff
- Delta sync (pull from server)
- Conflict resolution (server-wins)
- Event emission for UI updates

### Step 2.3: Create MessageActions

Create `frontend/src/sync/MessageActions.js`:
- sendMessage() - optimistic write + queue
- deleteMessage() - soft delete + queue
- reactToMessage() - toggle reaction + queue
- markConversationRead() - batch update + queue
- retryFailedMessage() - re-queue failed sends

### Step 2.4: Test Sync Engine

Create `frontend/src/sync/__tests__/SyncEngine.test.js`:
- Test queue enqueue/drain
- Test offline queueing
- Test online sync
- Test conflict resolution

---

## PHASE 3: React Integration

### Step 3.1: Create Offline-First Hooks

Create `frontend/src/hooks/useOfflineFirst.js`:
- useConversations() - reactive conversation list
- useMessages() - paginated message list
- useSyncStatus() - online/offline/syncing status
- useConversation() - single conversation
- useUnreadCount() - total unread badge
- usePendingMessages() - unsent message count

### Step 3.2: Create Provider

Create `frontend/src/OfflineFirstProvider.jsx`:
- Initialize database on mount
- Start SyncEngine
- Provide DatabaseProvider context
- Handle initialization errors

### Step 3.3: Create UI Components

Create `frontend/src/components/OfflineFirst.jsx`:
- SyncStatusBar - shows online/offline/syncing
- MessageList - reactive FlatList with pagination
- MessageComposer - input with instant send

### Step 3.4: Update Auth Service

Create `frontend/src/services/auth.js`:
- getCurrentUser() - wire to Firebase Auth
- setCurrentUser() - cache user data
- clearCurrentUser() - logout cleanup

### Step 3.5: Update API Service

Update `frontend/src/services/apiService.ts`:
- Add sendMessage() for sync
- Add deleteMessage() for sync
- Add reactToMessage() for sync
- Add markConversationRead() for sync
- Add getChangesSince() for delta sync

---

## PHASE 4: Backend Integration

### Step 4.1: Update Message Model

Update `backend/modals/Message.ts`:
```typescript
// Add to schema
localId: { 
  type: String, 
  index: true,
  sparse: true 
}
```

### Step 4.2: Create Sync Routes

Create `backend/routes/sync.routes.ts`:
- GET /sync/delta?since=<timestamp>
  - Returns conversations, messages, deletions since timestamp
  - Filters by user's conversations only
  - Caps at 7 days lookback for performance

### Step 4.3: Update Message Creation

Update `backend/routes/conversation.routes.ts`:
- Store localId when creating messages
- Echo localId in response for matching

### Step 4.4: Add Indexes

Run migration:
```javascript
// Add to Message collection
db.messages.createIndex({ localId: 1 }, { sparse: true });
db.messages.createIndex({ conversationId: 1, updatedAt: -1 });
```

### Step 4.5: Wire Up Routes

Update `backend/index.ts`:
```typescript
import syncRoutes from './routes/sync.routes';
app.use('/sync', syncRoutes);
```

---

## PHASE 5: Migration & Testing

### Step 5.1: Wrap App Root

Update `frontend/app/_layout.tsx`:
```typescript
import { OfflineFirstProvider } from '../src/OfflineFirstProvider';

export default function RootLayout() {
  return (
    <OfflineFirstProvider>
      {/* existing layout */}
    </OfflineFirstProvider>
  );
}
```

### Step 5.2: Migrate Conversation Screen

Update `frontend/app/(main)/Conversation.tsx`:
- Replace useState/useEffect with useMessages()
- Replace manual send with MessageActions.sendMessage()
- Add SyncStatusBar
- Use MessageList component
- Use MessageComposer component

### Step 5.3: Migrate Home Screen

Update `frontend/app/(main)/home.tsx`:
- Replace conversation fetch with useConversations()
- Add useUnreadCount() for badge
- Remove manual refresh logic (automatic now)

### Step 5.4: Test Scenarios

**Test Matrix:**
| Scenario | Expected Behavior | Status |
|----------|-------------------|--------|
| Send online | Instant UI update, syncs in <2s | ⏳ |
| Send offline | Instant UI update, queues | ⏳ |
| Receive online | Real-time via Socket.IO | ⏳ |
| Receive offline | Syncs on reconnect | ⏳ |
| App kill mid-send | Resumes on restart | ⏳ |
| Network toggle | Smooth transition | ⏳ |
| 1000 messages | Fast scroll, no lag | ⏳ |
| Conflict | Server wins, no data loss | ⏳ |

### Step 5.5: Performance Profiling

Use React DevTools Profiler:
- Measure render times
- Check for unnecessary re-renders
- Optimize if needed

### Step 5.6: Create Rollback Plan

```bash
# If issues arise:
git checkout main
npm run build
eas update --branch production
```

---

## Verification Checklist

### Phase 1 ✅
- [ ] Dependencies installed
- [ ] Babel configured
- [ ] Schema created
- [ ] Models created
- [ ] Migrations created
- [ ] Database singleton works
- [ ] Can create/query records

### Phase 2 ✅
- [ ] EventEmitter works
- [ ] ID generator works
- [ ] SyncEngine initializes
- [ ] Queue enqueues operations
- [ ] Drain loop processes queue
- [ ] NetInfo detects online/offline
- [ ] MessageActions write optimistically

### Phase 3 ✅
- [ ] Hooks return reactive data
- [ ] Provider initializes DB
- [ ] SyncEngine starts
- [ ] UI components render
- [ ] Auth service integrated
- [ ] API service updated

### Phase 4 ✅
- [ ] Message model has localId
- [ ] Sync routes created
- [ ] Delta sync returns data
- [ ] LocalId matching works
- [ ] Indexes added
- [ ] Routes wired up

### Phase 5 ✅
- [ ] App wrapped in Provider
- [ ] Conversation screen migrated
- [ ] Home screen migrated
- [ ] All test scenarios pass
- [ ] Performance acceptable
- [ ] No regressions
- [ ] Rollback plan ready

---

## Success Metrics

### Must Achieve
- ✅ Message send latency: <100ms (perceived)
- ✅ Offline queue: 100% reliable
- ✅ Sync success rate: >99%
- ✅ No data loss: 100%
- ✅ App startup: <2s

### Nice to Have
- ✅ Reduced server load: 30%+
- ✅ Better battery life: 10%+
- ✅ Faster perceived performance: 50%+

---

## Timeline

**Day 1:**
- Morning: Phase 1 (2-3h)
- Afternoon: Phase 2 (4-5h)

**Day 2:**
- Morning: Phase 3 (3-4h)
- Afternoon: Phase 4 (2-3h)

**Day 3:**
- Morning: Phase 5 (4-6h)
- Afternoon: Testing & deployment

**Total: 15-21 hours over 3 days**

---

## Next Action

Run these commands to start:

```bash
cd frontend
npm install @nozbe/watermelondb @react-native-community/netinfo
npx expo install expo-sqlite
```

Then proceed to create the files in order.


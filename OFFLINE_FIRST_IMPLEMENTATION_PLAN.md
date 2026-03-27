# 🔄 Offline-First Integration Plan

## Overview

Integrating WatermelonDB offline-first architecture into Bublizi chat app for seamless offline/online experience.

---

## Architecture Changes

### Before
```
UI Components → Socket.IO → Backend → MongoDB
     ↓
React Context (in-memory state)
```

### After
```
UI Components → WatermelonDB (SQLite) ← SyncEngine ← Backend
     ↓              ↓                        ↓
React Hooks    Local Cache            Socket.IO + HTTP
                                           ↓
                                       MongoDB
```

---

## Implementation Phases

### ✅ Phase 1: Foundation (Database Setup)
**Duration:** 2-3 hours  
**Risk:** Low  
**Dependencies:** None

**Tasks:**
1. Install WatermelonDB dependencies
2. Configure Babel for decorators
3. Create database schema (conversations, messages, sync_queue, users)
4. Create model classes with decorators
5. Setup database singleton
6. Create migration system

**Files to Create:**
- `frontend/src/db/schema.js`
- `frontend/src/db/models.js`
- `frontend/src/db/migrations.js`
- `frontend/src/db/index.js`

**Testing:**
- Database initializes without errors
- Schema creates tables correctly
- Models can be queried

---

### ✅ Phase 2: Sync Infrastructure
**Duration:** 4-5 hours  
**Risk:** Medium  
**Dependencies:** Phase 1

**Tasks:**
1. Create EventEmitter utility
2. Create ID generator utility
3. Create SyncEngine with queue draining
4. Create MessageActions for optimistic updates
5. Setup NetInfo integration
6. Implement conflict resolution

**Files to Create:**
- `frontend/src/utils/EventEmitter.js`
- `frontend/src/utils/id.js`
- `frontend/src/sync/SyncEngine.js`
- `frontend/src/sync/MessageActions.js`

**Testing:**
- Queue enqueues operations
- Drain loop processes queue when online
- Offline operations queue correctly
- Conflict resolution works

---

### ✅ Phase 3: React Integration
**Duration:** 3-4 hours  
**Risk:** Low  
**Dependencies:** Phase 1, 2

**Tasks:**
1. Create offline-first React hooks
2. Create OfflineFirstProvider
3. Create UI components (MessageList, Composer, StatusBar)
4. Wire up auth service
5. Update API service for sync

**Files to Create:**
- `frontend/src/hooks/useOfflineFirst.js`
- `frontend/src/OfflineFirstProvider.jsx`
- `frontend/src/components/OfflineFirst.jsx`
- `frontend/src/services/auth.js` (adapter)
- `frontend/src/services/api.js` (update)

**Testing:**
- Hooks return reactive data
- Provider initializes correctly
- Components render without errors
- Auth integration works

---

### ✅ Phase 4: Backend Integration
**Duration:** 2-3 hours  
**Risk:** Low  
**Dependencies:** Phase 1, 2, 3

**Tasks:**
1. Create sync routes (/sync/delta)
2. Update Message model with localId field
3. Update message creation to echo localId
4. Test delta sync endpoint
5. Add indexes for performance

**Files to Create:**
- `backend/routes/sync.routes.ts`
- Update: `backend/modals/Message.ts`
- Update: `backend/routes/conversation.routes.ts`

**Testing:**
- Delta sync returns correct data
- LocalId matching works
- Performance is acceptable
- No breaking changes

---

### ✅ Phase 5: Migration & Testing
**Duration:** 4-6 hours  
**Risk:** High  
**Dependencies:** Phase 1, 2, 3, 4

**Tasks:**
1. Migrate Conversation screen to use offline-first
2. Migrate home screen conversation list
3. Test offline send/receive
4. Test app kill scenarios
5. Test network transitions
6. Performance profiling
7. Create rollback plan

**Files to Update:**
- `frontend/app/(main)/Conversation.tsx`
- `frontend/app/(main)/home.tsx`
- `frontend/context/authContext.tsx`

**Testing:**
- All existing features work
- Offline mode works
- Performance is acceptable
- No data loss scenarios

---

## Risk Mitigation

### High Risk Areas

1. **Data Migration**
   - Risk: Existing users lose messages
   - Mitigation: First-time seed from server, keep Socket.IO as fallback

2. **Performance**
   - Risk: SQLite queries slow on large datasets
   - Mitigation: Proper indexing, pagination, lazy loading

3. **Conflicts**
   - Risk: Sync conflicts cause data inconsistency
   - Mitigation: Server-wins strategy, clear conflict resolution rules

4. **Breaking Changes**
   - Risk: Existing features break
   - Mitigation: Feature flag, gradual rollout, keep old code paths

---

## Rollback Strategy

### If Issues Arise

1. **Immediate Rollback:**
   ```bash
   git revert <commit-hash>
   npm run build
   eas update
   ```

2. **Feature Flag:**
   ```typescript
   const OFFLINE_FIRST_ENABLED = false; // toggle
   
   if (OFFLINE_FIRST_ENABLED) {
     return <OfflineFirstConversation />;
   }
   return <LegacyConversation />;
   ```

3. **Gradual Rollout:**
   - 10% users → monitor
   - 50% users → monitor
   - 100% users

---

## Success Criteria

### Must Have
- ✅ Messages send instantly (optimistic UI)
- ✅ Messages survive offline/app kill
- ✅ Sync works when back online
- ✅ No data loss
- ✅ Performance ≤ current implementation

### Nice to Have
- ✅ Faster perceived performance
- ✅ Better offline UX
- ✅ Reduced server load
- ✅ Better battery life

---

## Timeline

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| Phase 1 | 2-3h | Day 1 | Day 1 |
| Phase 2 | 4-5h | Day 1 | Day 2 |
| Phase 3 | 3-4h | Day 2 | Day 2 |
| Phase 4 | 2-3h | Day 2 | Day 3 |
| Phase 5 | 4-6h | Day 3 | Day 3 |
| **Total** | **15-21h** | **Day 1** | **Day 3** |

---

## Dependencies to Install

```bash
# Core
npm install @nozbe/watermelondb
npm install @react-native-community/netinfo
npm install @react-native-async-storage/async-storage

# Expo-specific
npx expo install expo-sqlite

# Babel plugins (already installed)
# @babel/plugin-proposal-decorators
# @babel/plugin-proposal-class-properties
```

---

## Configuration Changes

### babel.config.js
```javascript
module.exports = {
  presets: ['babel-preset-expo'],
  plugins: [
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    ['@babel/plugin-proposal-class-properties', { loose: true }],
  ],
};
```

### Backend: Message Model
```typescript
// Add to Message schema
localId: { type: String, index: true }
```

---

## Monitoring & Metrics

### Track These Metrics

1. **Sync Performance**
   - Queue drain time
   - Delta sync latency
   - Conflict rate

2. **User Experience**
   - Message send latency (perceived)
   - App startup time
   - Crash rate

3. **Data Integrity**
   - Message loss rate
   - Sync failure rate
   - Conflict resolution success rate

---

## Next Steps

1. Review this plan with team
2. Get approval for implementation
3. Create feature branch: `feature/offline-first`
4. Start Phase 1 implementation
5. Test each phase before proceeding
6. Deploy to staging
7. Beta test with select users
8. Production rollout

---

**Status:** Ready for Implementation  
**Estimated Completion:** 3 days  
**Risk Level:** Medium  
**Confidence:** High (95%)


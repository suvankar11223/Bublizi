# Advanced Chat Features - Implementation Tasks

## Task Breakdown

### Phase 1: Backend Foundation (2-3 hours)

#### Task 1.1: Update Message Schema
**File**: `backend/modals/Message.ts`
**Estimated Time**: 20 minutes

- [ ] Add `isEdited: Boolean` field
- [ ] Add `editedAt: Date` field
- [ ] Add `originalContent: String` field
- [ ] Add `isDeleted: Boolean` field
- [ ] Add `deletedAt: Date` field
- [ ] Add `deletedFor: [ObjectId]` array
- [ ] Add `document` object with url, name, size, mimeType
- [ ] Update `type` enum to include 'document'

**Acceptance Criteria**:
- Schema compiles without errors
- Existing messages still load correctly
- New fields are optional

---

#### Task 1.2: Update User Schema
**File**: `backend/modals/userModal.ts`
**Estimated Time**: 20 minutes

- [ ] Add `blockedUsers: [ObjectId]` array
- [ ] Add `stories` array with schema:
  - `mediaUrl: String`
  - `mediaType: String` (enum: 'image', 'video')
  - `caption: String`
  - `viewers: [ObjectId]`
  - `expiresAt: Date` (with TTL index)
  - `createdAt: Date`
- [ ] Add `status` object with:
  - `text: String`
  - `emoji: String`
  - `updatedAt: Date`

**Acceptance Criteria**:
- Schema compiles without errors
- TTL index created on stories.expiresAt
- Existing users still load correctly

---

#### Task 1.3: Implement Message Edit Handler
**File**: `backend/socket/chatEvents.ts`
**Estimated Time**: 30 minutes

- [ ] Create `registerMessageEditDeleteEvents` function
- [ ] Implement `message:edit` event handler:
  - Validate messageId exists
  - Verify user is sender
  - Check message is not deleted
  - Check message type is 'text'
  - Save original content on first edit
  - Update content, set isEdited=true, editedAt=now
  - Emit `message:edited` to conversation room
- [ ] Add error handling and emit `message:edit:error`

**Acceptance Criteria**:
- Only sender can edit their messages
- Original content preserved on first edit
- All participants receive update
- Non-text messages cannot be edited

---

#### Task 1.4: Implement Message Delete Handler
**File**: `backend/socket/chatEvents.ts`
**Estimated Time**: 30 minutes

- [ ] Implement `message:delete` event handler:
  - Validate messageId exists
  - Handle "delete for me":
    - Add userId to deletedFor array
    - Emit to sender only
  - Handle "delete for everyone":
    - Verify user is sender
    - Set isDeleted=true, deletedAt=now
    - Clear content, attachment, audioUrl
    - Emit to conversation room
- [ ] Add error handling and emit `message:delete:error`

**Acceptance Criteria**:
- Anyone can delete for themselves
- Only sender can delete for everyone
- Deleted messages show placeholder
- Message ID preserved for history

---

#### Task 1.5: Implement Document Send Handler
**File**: `backend/socket/chatEvents.ts`
**Estimated Time**: 20 minutes

- [ ] Implement `document:send` event handler:
  - Validate required fields (conversationId, senderId, document.url)
  - Create message with type='document'
  - Store document metadata
  - Emit `newMessage` to conversation room
  - Update conversation lastMessage
- [ ] Add error handling and emit `document:error`

**Acceptance Criteria**:
- Document messages created successfully
- Metadata stored correctly
- All participants receive document message

---

#### Task 1.6: Implement Story Handlers
**File**: `backend/socket/chatEvents.ts` (new function `registerStoryEvents`)
**Estimated Time**: 45 minutes

- [ ] Create `registerStoryEvents` function
- [ ] Implement `story:post` event handler:
  - Validate mediaUrl and mediaType
  - Create story entry in user's stories array
  - Set expiresAt to 24 hours from now
  - Broadcast `story:new` to all connected users
  - Emit `story:posted` confirmation to sender
- [ ] Implement `story:view` event handler:
  - Add viewerId to story's viewers array
  - Emit `story:viewed` to story owner
- [ ] Implement `story:delete` event handler:
  - Verify user owns story
  - Remove story from array
  - Emit `story:deleted` confirmation
- [ ] Implement `stories:get` event handler:
  - Find all users with active stories (expiresAt > now)
  - Filter expired stories
  - Return with view status for current user
  - Emit `stories:data`

**Acceptance Criteria**:
- Stories expire after 24 hours
- Only owner can delete stories
- View tracking works correctly
- Real-time updates for new stories

---

#### Task 1.7: Implement Status Handler
**File**: `backend/socket/chatEvents.ts`
**Estimated Time**: 15 minutes

- [ ] Implement `status:update` event handler:
  - Update user's status.text and status.emoji
  - Set status.updatedAt to now
  - Emit `status:updated` to sender
  - Broadcast `status:changed` to all users

**Acceptance Criteria**:
- Status updates saved correctly
- All users see updated status
- Timestamp updated on each change

---

#### Task 1.8: Implement Blocking Handlers
**File**: `backend/socket/chatEvents.ts`
**Estimated Time**: 20 minutes

- [ ] Implement `user:block` event handler:
  - Add targetUserId to user's blockedUsers array
  - Emit `user:blocked` confirmation
- [ ] Implement `user:unblock` event handler:
  - Remove targetUserId from blockedUsers array
  - Emit `user:unblocked` confirmation
- [ ] Add blocking check to message send handler:
  - Check if sender is blocked by recipient
  - Silently fail if blocked (no error to sender)

**Acceptance Criteria**:
- Blocked users cannot send messages
- Blocking is bidirectional if both block each other
- No error shown to blocked user

---

#### Task 1.9: Register New Event Handlers
**File**: `backend/socket/chatEvents.ts`
**Estimated Time**: 10 minutes

- [ ] Call `registerMessageEditDeleteEvents(io, socket)` in `registerChatEvents`
- [ ] Call `registerStoryEvents(io, socket)` in `registerChatEvents`
- [ ] Export new functions

**Acceptance Criteria**:
- All new events registered on socket connection
- No errors in server logs

---

### Phase 2: Frontend Components (3-4 hours)

#### Task 2.1: Create MessageBubble Component
**File**: `frontend/components/chat/MessageBubble.tsx`
**Estimated Time**: 90 minutes

- [ ] Create component with props: message, currentUserId, onEdit, onDelete, onReact
- [ ] Implement long-press gesture with Animated scale feedback
- [ ] Create context menu modal with:
  - Reaction emoji row (6 emojis)
  - Edit option (if own text message)
  - Delete option
  - Copy option (if text message)
- [ ] Implement edit mode:
  - Inline TextInput with current content
  - Save/Cancel buttons
  - Call onEdit callback
- [ ] Implement delete confirmation:
  - Alert with "Delete for me" / "Delete for everyone" options
  - Call onDelete callback
- [ ] Implement document display:
  - File icon based on mimeType
  - File name and size
  - Download/open button
  - Handle Linking.openURL
- [ ] Implement deleted message placeholder:
  - Show "You deleted this message" or "This message was deleted"
  - Gray out with ban icon
- [ ] Display reactions below message:
  - Emoji with count
  - Highlight if current user reacted
  - Tap to toggle reaction
- [ ] Display "edited" label if isEdited=true
- [ ] Style for isMe vs them (different colors)

**Acceptance Criteria**:
- Long-press shows menu with haptic feedback
- Edit mode works for text messages only
- Delete shows correct options based on sender
- Documents display with correct icons
- Reactions display and toggle correctly
- Deleted messages show placeholder

---

#### Task 2.2: Create useDocumentSend Hook
**File**: `frontend/hooks/useDocumentSend.ts`
**Estimated Time**: 30 minutes

- [ ] Install expo-document-picker: `npx expo install expo-document-picker`
- [ ] Create hook with params: conversationId, sender (id, name, avatar)
- [ ] Implement `pickAndSendDocument` function:
  - Call DocumentPicker.getDocumentAsync with type='*/*'
  - Validate file size ≤ 20MB
  - Show error if too large
  - Create FormData with file
  - Upload to Cloudinary (resource_type='raw')
  - Show upload progress
  - Emit `document:send` via socket
  - Handle errors with Alert
- [ ] Return: pickAndSendDocument, isUploading, uploadProgress

**Acceptance Criteria**:
- File picker opens correctly
- Files upload to Cloudinary
- Progress indicator shows during upload
- Socket emits document message
- Errors handled gracefully

---

#### Task 2.3: Create StoriesScreen Component
**File**: `frontend/app/(main)/stories.tsx`
**Estimated Time**: 120 minutes

- [ ] Install expo-image-picker: `npx expo install expo-image-picker`
- [ ] Create screen with sections:
  - Header with "Stories" title and "Status" button
  - "Your Story" circle with + icon
  - Horizontal FlatList of friend story circles
  - Empty state if no stories
- [ ] Implement story circles:
  - Avatar with blue ring (unviewed) or gray ring (viewed)
  - User name below
  - Tap to open story viewer
- [ ] Implement story viewer modal:
  - Full-screen with story image/video
  - Progress bars at top (one per story)
  - Auto-advance every 5 seconds with Animated.timing
  - Story header with avatar, name, time, close button
  - Caption at bottom if present
  - Tap zones: left 1/3 = previous, right 2/3 = next
  - Swipe down to close
  - Mark story as viewed on open
- [ ] Implement post story flow:
  - Request media library permissions
  - Open ImagePicker with 9:16 aspect ratio
  - Upload to Cloudinary
  - Emit `story:post` via socket
  - Show loading indicator
- [ ] Implement status editor modal:
  - Text input (max 100 chars)
  - Emoji picker row (8 preset emojis)
  - Save/Cancel buttons
  - Emit `status:update` via socket
- [ ] Wire socket handlers:
  - `stories:get` on mount
  - `stories:data` to update state
  - `story:new` for real-time updates
  - `story:posted` confirmation
  - `status:updated` confirmation

**Acceptance Criteria**:
- Story circles display with correct ring colors
- Story viewer shows stories with auto-advance
- Tap navigation works (left/right)
- Post story uploads and broadcasts
- Status editor saves and broadcasts
- Real-time updates work

---

#### Task 2.4: Update Conversation Screen
**File**: `frontend/app/(main)/Conversation.tsx`
**Estimated Time**: 45 minutes

- [ ] Replace MessageItem with MessageBubble
- [ ] Add document picker button (📎 icon) next to send button
- [ ] Import useDocumentSend hook
- [ ] Call pickAndSendDocument on button press
- [ ] Implement socket handlers:
  - `message:edited` - update message in state
  - `message:deleted` - update message in state or remove
  - `message:edit:error` - show error Alert
  - `message:delete:error` - show error Alert
- [ ] Implement callback functions:
  - `onEdit(messageId, newContent)` - emit `message:edit`
  - `onDelete(messageId, deleteFor)` - emit `message:delete`
  - `onReact(messageId, emoji)` - emit existing reaction event
- [ ] Handle deletedFor array:
  - Filter out messages where currentUserId in deletedFor
- [ ] Show upload progress indicator when uploading document

**Acceptance Criteria**:
- MessageBubble displays all message types correctly
- Document picker button works
- Edit/delete callbacks emit socket events
- Socket handlers update UI in real-time
- Deleted messages filtered correctly

---

#### Task 2.5: Add Stories Tab to Home
**File**: `frontend/app/(main)/_layout.tsx` or home navigation
**Estimated Time**: 20 minutes

- [ ] Add "Stories" tab to bottom navigation or top tabs
- [ ] Add icon (📸 or similar)
- [ ] Route to StoriesScreen
- [ ] Show badge if unviewed stories exist

**Acceptance Criteria**:
- Stories tab accessible from home
- Navigation works correctly
- Badge shows for unviewed stories

---

### Phase 3: Integration & Testing (1-2 hours)

#### Task 3.1: Cloudinary Setup
**Estimated Time**: 15 minutes

- [ ] Log into Cloudinary dashboard (dx6n5pj46)
- [ ] Create unsigned upload preset "documents_preset":
  - Resource type: raw
  - Folder: documents
  - Max file size: 20MB
- [ ] Create unsigned upload preset "stories_preset":
  - Resource type: image
  - Folder: stories
  - Transformation: optimize quality
- [ ] Update constants in code:
  - `useDocumentSend.ts`: CLOUDINARY_UPLOAD_PRESET
  - `StoriesScreen.tsx`: CLOUDINARY_UPLOAD_PRESET

**Acceptance Criteria**:
- Upload presets created and working
- Documents upload to /documents folder
- Stories upload to /stories folder

---

#### Task 3.2: Install Dependencies
**Estimated Time**: 10 minutes

- [ ] Frontend: `npx expo install expo-document-picker`
- [ ] Frontend: `npx expo install @react-native-clipboard/clipboard`
- [ ] Frontend: Verify expo-image-picker installed
- [ ] Backend: No new dependencies needed

**Acceptance Criteria**:
- All dependencies installed
- No version conflicts
- App builds successfully

---

#### Task 3.3: End-to-End Testing
**Estimated Time**: 60 minutes

Test scenarios:
- [ ] Edit message: Edit text message, verify "edited" label shows
- [ ] Delete for me: Delete message, verify only hidden for you
- [ ] Delete for everyone: Delete message, verify placeholder shows for all
- [ ] Send document: Pick PDF, upload, verify displays correctly
- [ ] Open document: Tap document, verify opens in external app
- [ ] Post story: Upload image, verify appears in story circles
- [ ] View story: Tap story circle, verify viewer opens and auto-advances
- [ ] Story expiry: Wait 24 hours (or manually set expiresAt), verify story disappears
- [ ] Update status: Set status with emoji, verify shows in profile
- [ ] Block user: Block contact, verify cannot receive messages
- [ ] Unblock user: Unblock contact, verify messages work again
- [ ] Reactions: Add reaction to message, verify displays correctly
- [ ] Real-time updates: Test with two devices, verify all updates propagate

**Acceptance Criteria**:
- All test scenarios pass
- No crashes or errors
- UI updates in real-time
- Performance is acceptable

---

#### Task 3.4: Bug Fixes & Polish
**Estimated Time**: 30 minutes

- [ ] Fix any bugs found in testing
- [ ] Add loading states for all async operations
- [ ] Add error handling for network failures
- [ ] Optimize performance (lazy loading, memoization)
- [ ] Add haptic feedback where appropriate
- [ ] Polish animations and transitions
- [ ] Test on both iOS and Android
- [ ] Test with slow network conditions

**Acceptance Criteria**:
- No known bugs
- All loading states implemented
- Error handling comprehensive
- Performance smooth on both platforms

---

## Deployment Checklist

### Backend Deployment
- [ ] Commit all backend changes
- [ ] Push to GitHub main branch
- [ ] Verify Render auto-deploys
- [ ] Check Render logs for errors
- [ ] Test backend endpoints manually

### Frontend Deployment
- [ ] Test on development build
- [ ] Create new production build
- [ ] Test on physical devices (iOS + Android)
- [ ] Submit to app stores (if applicable)

### Post-Deployment
- [ ] Monitor error logs
- [ ] Check user feedback
- [ ] Track feature adoption metrics
- [ ] Plan follow-up improvements

---

## Estimated Timeline

- **Phase 1 (Backend)**: 2-3 hours
- **Phase 2 (Frontend)**: 3-4 hours
- **Phase 3 (Integration)**: 1-2 hours
- **Total**: 6-9 hours

## Dependencies

- Cloudinary account with upload presets configured
- expo-document-picker installed
- expo-image-picker installed
- @react-native-clipboard/clipboard installed

## Risks & Mitigation

1. **Risk**: Cloudinary upload failures
   - **Mitigation**: Add retry logic, show clear error messages

2. **Risk**: Story expiry not working
   - **Mitigation**: Test TTL index, add manual cleanup cron job

3. **Risk**: Performance degradation with many stories
   - **Mitigation**: Lazy load stories, limit to recent 50 users

4. **Risk**: Document size too large for mobile
   - **Mitigation**: Enforce 20MB limit, show size before upload

5. **Risk**: Real-time updates not propagating
   - **Mitigation**: Test socket rooms, add reconnection logic

## Success Criteria

- [ ] All features implemented and working
- [ ] No critical bugs
- [ ] Performance acceptable (<2s load times)
- [ ] Error rate <1%
- [ ] User feedback positive
- [ ] Code reviewed and approved
- [ ] Documentation updated

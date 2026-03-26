# Advanced Chat Features - Design Document

## Architecture Overview

This feature set adds new capabilities to the existing chat system through:
1. Database schema extensions (Message, User models)
2. New socket event handlers (edit, delete, document, story, block)
3. Enhanced UI components (MessageBubble, StoriesScreen)
4. Cloudinary integration for document/story uploads

## System Design

### High-Level Flow

```
User Action → Frontend Component → Socket Emit → Backend Handler → Database Update → Socket Broadcast → All Clients Update
```

### Component Architecture

```
Frontend:
├── Components
│   ├── MessageBubble (replaces MessageItem)
│   ├── StoriesScreen (new tab/modal)
│   └── DocumentPicker (new utility)
├── Hooks
│   ├── useDocumentSend
│   └── useStoryViewer
└── Socket Handlers
    ├── message:edited
    ├── message:deleted
    ├── document:sent
    ├── story:new
    └── user:blocked

Backend:
├── Models
│   ├── Message (extended)
│   └── User (extended)
├── Socket Events
│   ├── chatEvents (extended)
│   └── storyEvents (new)
└── Services
    └── Cloudinary upload
```

## Database Schema Design

### Message Model Extensions

```typescript
interface Message {
  // Existing fields
  _id: ObjectId;
  conversationId: ObjectId;
  senderId: ObjectId;
  content: string;
  type: 'text' | 'image' | 'voice' | 'document' | 'call';
  attachment?: string;
  audioUrl?: string;
  
  // NEW: Edit tracking
  isEdited?: boolean;
  editedAt?: Date;
  originalContent?: string;  // Saved on first edit only
  
  // NEW: Delete tracking
  isDeleted?: boolean;
  deletedAt?: Date;
  deletedFor?: ObjectId[];  // Users who deleted for themselves
  
  // NEW: Document metadata
  document?: {
    url: string;
    name: string;
    size: number;  // bytes
    mimeType: string;
  };
  
  // Existing
  reactions?: Array<{
    emoji: string;
    users: ObjectId[];
  }>;
  createdAt: Date;
  updatedAt: Date;
}
```

### User Model Extensions

```typescript
interface User {
  // Existing fields
  _id: ObjectId;
  clerkId: string;
  email: string;
  name: string;
  avatar?: string;
  
  // NEW: Blocking
  blockedUsers?: ObjectId[];
  
  // NEW: Stories
  stories?: Array<{
    _id: ObjectId;
    mediaUrl: string;
    mediaType: 'image' | 'video';
    caption?: string;
    viewers: ObjectId[];
    expiresAt: Date;
    createdAt: Date;
  }>;
  
  // NEW: Status
  status?: {
    text: string;
    emoji: string;
    updatedAt: Date;
  };
  
  createdAt: Date;
  updatedAt: Date;
}
```

## API Design

### Socket Events

#### Message Edit/Delete

```typescript
// Client → Server
socket.emit('message:edit', {
  messageId: string,
  newContent: string,
  conversationId: string
});

socket.emit('message:delete', {
  messageId: string,
  conversationId: string,
  deleteFor: 'me' | 'everyone'
});

// Server → Client
socket.on('message:edited', {
  success: boolean,
  messageId: string,
  newContent: string,
  editedAt: Date
});

socket.on('message:deleted', {
  success: boolean,
  messageId: string,
  deleteFor: 'me' | 'everyone'
});
```

#### Document Sharing

```typescript
// Client → Server (after Cloudinary upload)
socket.emit('document:send', {
  conversationId: string,
  senderId: string,
  senderName: string,
  senderAvatar: string,
  document: {
    url: string,
    name: string,
    size: number,
    mimeType: string
  }
});

// Server → Client
socket.on('newMessage', {
  success: boolean,
  data: {
    id: string,
    type: 'document',
    document: { ... },
    sender: { ... },
    createdAt: string
  }
});
```

#### Stories

```typescript
// Client → Server
socket.emit('story:post', {
  mediaUrl: string,
  mediaType: 'image' | 'video',
  caption?: string
});

socket.emit('story:view', {
  storyOwnerId: string,
  storyId: string
});

socket.emit('story:delete', {
  storyId: string
});

socket.emit('stories:get');

// Server → Client
socket.on('story:new', {
  userId: string,
  userName: string,
  userAvatar: string,
  story: { ... }
});

socket.on('stories:data', {
  success: boolean,
  data: Array<UserStories>
});
```

#### Status

```typescript
// Client → Server
socket.emit('status:update', {
  text: string,
  emoji: string
});

// Server → Client
socket.on('status:updated', {
  success: boolean,
  status: { text, emoji, updatedAt }
});

socket.on('status:changed', {
  userId: string,
  status: { ... }
});
```

#### Blocking

```typescript
// Client → Server
socket.emit('user:block', {
  targetUserId: string
});

socket.emit('user:unblock', {
  targetUserId: string
});

// Server → Client
socket.on('user:blocked', {
  success: boolean,
  blockedUserId: string
});

socket.on('user:unblocked', {
  success: boolean,
  unblockedUserId: string
});
```

## UI/UX Design

### MessageBubble Component

**States:**
- Normal display
- Long-press menu open
- Edit mode (inline input)
- Deleted placeholder
- Document display

**Interactions:**
- Long-press → Show context menu
- Tap emoji → Add/remove reaction
- Tap "Edit" → Enter edit mode
- Tap "Delete" → Show confirmation dialog
- Tap document → Open file

**Visual Design:**
```
┌─────────────────────────────┐
│ Message content             │
│ [📎 document.pdf - 2.5 MB]  │
│                             │
│ ❤️ 3  😂 1                  │
│ edited • 10:30 AM          │
└─────────────────────────────┘
```

### Context Menu

```
┌─────────────────────────────┐
│  ❤️  😂  😮  😢  👍  👎     │
├─────────────────────────────┤
│  ✏️  Edit                   │
│  🗑️  Delete                 │
│  📋  Copy                   │
└─────────────────────────────┘
```

### StoriesScreen Layout

```
┌─────────────────────────────┐
│ Stories            [Status] │
├─────────────────────────────┤
│ ┌───┐                       │
│ │ + │ Your Story            │
│ └───┘                       │
├─────────────────────────────┤
│ ┌───┐  ┌───┐  ┌───┐        │
│ │ 👤│  │ 👤│  │ 👤│        │
│ └───┘  └───┘  └───┘        │
│ Alice  Bob    Carol         │
└─────────────────────────────┘
```

### Story Viewer

```
┌─────────────────────────────┐
│ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ │ ← Progress bars
│                             │
│ 👤 Alice • 2h ago      [×] │
│                             │
│                             │
│      [Story Image]          │
│                             │
│                             │
│ "Having a great day! 🌞"   │
│                             │
│ [Tap left/right to navigate]│
└─────────────────────────────┘
```

## Implementation Strategy

### Phase 1: Database & Backend (2-3 hours)

**Task 1.1**: Update Message schema
- Add isEdited, editedAt, originalContent fields
- Add isDeleted, deletedAt, deletedFor fields
- Add document object field
- Migration: No migration needed (new fields are optional)

**Task 1.2**: Update User schema
- Add blockedUsers array
- Add stories array with TTL index on expiresAt
- Add status object

**Task 1.3**: Implement message edit/delete handlers
- `message:edit` event handler
- `message:delete` event handler
- Validation and authorization checks

**Task 1.4**: Implement document handler
- `document:send` event handler
- Create message with type 'document'

**Task 1.5**: Implement story handlers
- `story:post`, `story:view`, `story:delete`
- `stories:get` with expiry filtering
- Auto-cleanup cron job for expired stories

**Task 1.6**: Implement blocking handlers
- `user:block`, `user:unblock`
- Message send validation

### Phase 2: Frontend Components (3-4 hours)

**Task 2.1**: Create MessageBubble component
- Long-press gesture handler
- Context menu modal
- Edit mode with inline input
- Delete confirmation dialog
- Document display with file icons
- Reaction display and picker

**Task 2.2**: Create useDocumentSend hook
- expo-document-picker integration
- File validation (size, type)
- Cloudinary upload with progress
- Socket emit

**Task 2.3**: Create StoriesScreen
- Story circles with rings
- Full-screen story viewer
- Progress bars and auto-advance
- Tap navigation (left/right)
- Post story flow
- Status editor modal

**Task 2.4**: Update Conversation screen
- Replace MessageItem with MessageBubble
- Add document picker button
- Wire socket handlers for edit/delete
- Handle message:edited, message:deleted events

**Task 2.5**: Add Stories tab
- Add to home screen navigation
- Wire socket handlers
- Handle real-time story updates

### Phase 3: Integration & Testing (1-2 hours)

**Task 3.1**: Cloudinary setup
- Create unsigned upload preset for documents
- Create unsigned upload preset for stories
- Configure folder structure

**Task 3.2**: Socket event wiring
- Register all new events in chatEvents.ts
- Test event flow end-to-end

**Task 3.3**: Testing
- Test message edit/delete flows
- Test document upload/download
- Test story post/view/delete
- Test blocking functionality
- Test edge cases (network errors, large files, etc.)

**Task 3.4**: Bug fixes and polish
- Fix any issues found in testing
- Optimize performance
- Add loading states and error handling

## Technical Considerations

### Cloudinary Configuration

**Document Upload:**
```javascript
const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/dx6n5pj46/raw/upload';
const UPLOAD_PRESET = 'documents_preset'; // Create this
```

**Story Upload:**
```javascript
const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/dx6n5pj46/image/upload';
const UPLOAD_PRESET = 'stories_preset'; // Create this
```

### Performance Optimizations

1. **Story Expiry**: Use MongoDB TTL index on `stories.expiresAt`
2. **Document Caching**: Cache Cloudinary URLs in message objects
3. **Story Loading**: Lazy load stories on tab open
4. **Message Updates**: Use socket rooms for efficient broadcasting

### Error Handling

1. **Upload Failures**: Show retry button, don't lose user's selection
2. **Network Errors**: Queue operations, retry when online
3. **Permission Denials**: Show clear error messages with instructions
4. **File Size Limits**: Validate before upload, show size in picker

### Security Considerations

1. **Authorization**: Verify user owns message before allowing edit/delete
2. **Blocking**: Server-side validation, don't trust client
3. **File Validation**: Check file size and type on server
4. **URL Security**: Use HTTPS only, validate Cloudinary URLs

## Migration Plan

### Database Migration

**No migration required** - all new fields are optional and will be added as documents are updated.

### Backward Compatibility

- Existing messages without new fields will display normally
- Old clients will ignore new message types
- Graceful degradation for unsupported features

## Rollout Strategy

### Phase 1: Beta Testing (Internal)
- Deploy to staging environment
- Test with small group of users
- Gather feedback and fix bugs

### Phase 2: Gradual Rollout
- Enable for 10% of users
- Monitor error rates and performance
- Increase to 50%, then 100%

### Phase 3: Full Release
- Announce new features
- Provide user documentation
- Monitor support requests

## Success Metrics

1. **Adoption Rate**: % of users who use each feature within 7 days
2. **Error Rate**: < 1% of operations fail
3. **Performance**: No degradation in message send/receive times
4. **User Satisfaction**: Positive feedback on new features

## Future Enhancements

1. Story replies and reactions
2. Story privacy settings (close friends, custom lists)
3. Document preview/thumbnail generation
4. Message forwarding
5. Disappearing messages
6. Message search within documents
7. Story highlights (permanent stories)
8. Status reactions

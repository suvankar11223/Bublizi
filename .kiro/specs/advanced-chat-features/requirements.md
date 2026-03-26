# Advanced Chat Features - Requirements Document

## Introduction

This spec defines a comprehensive set of advanced messaging features including message editing/deletion, document sharing, stories/status updates, and user blocking. These features will transform the basic chat app into a full-featured messaging platform comparable to WhatsApp or Telegram.

## Feature Set Overview

1. **Message Edit & Delete**: Edit sent messages, delete for self or everyone
2. **Document Sharing**: Send any file type (PDF, DOC, ZIP, etc.)
3. **Stories & Status**: 24-hour ephemeral media stories with text status
4. **User Blocking**: Block/unblock users to prevent unwanted messages

## Detailed Requirements

### 1. Message Edit & Delete

#### 1.1 Edit Message

**REQ-EDIT-001**: WHEN a user long-presses their own text message THEN the system SHALL display a context menu with an "Edit" option

**REQ-EDIT-002**: WHEN a user selects "Edit" THEN the system SHALL display an inline text input with the current message content

**REQ-EDIT-003**: WHEN a user edits and saves a message THEN the system SHALL:
- Update the message content in the database
- Preserve the original content in `originalContent` field (first edit only)
- Set `isEdited` flag to true
- Set `editedAt` timestamp
- Broadcast the update to all conversation participants

**REQ-EDIT-004**: WHEN a message is edited THEN the system SHALL display an "edited" label next to the timestamp

**REQ-EDIT-005**: WHEN a user tries to edit a non-text message (image, voice, document) THEN the system SHALL NOT show the edit option

**REQ-EDIT-006**: WHEN a user tries to edit a deleted message THEN the system SHALL prevent the edit and show an error

#### 1.2 Delete Message

**REQ-DEL-001**: WHEN a user long-presses any message THEN the system SHALL display a "Delete" option in the context menu

**REQ-DEL-002**: WHEN the message sender selects "Delete" THEN the system SHALL show two options:
- "Delete for me" - removes from sender's view only
- "Delete for everyone" - removes for all participants

**REQ-DEL-003**: WHEN a non-sender selects "Delete" THEN the system SHALL only show "Delete for me" option

**REQ-DEL-004**: WHEN "Delete for me" is selected THEN the system SHALL:
- Add the user's ID to the message's `deletedFor` array
- Hide the message from that user's view only
- NOT notify other participants

**REQ-DEL-005**: WHEN "Delete for everyone" is selected THEN the system SHALL:
- Set `isDeleted` flag to true
- Set `deletedAt` timestamp
- Clear message content, attachment, and audioUrl
- Broadcast deletion to all participants
- Display "You deleted this message" / "This message was deleted" placeholder

**REQ-DEL-006**: WHEN a message is deleted for everyone THEN the system SHALL preserve the message ID and metadata for conversation history

### 2. Document Sharing

#### 2.1 Document Upload

**REQ-DOC-001**: WHEN a user taps the document attachment button THEN the system SHALL open the device's file picker

**REQ-DOC-002**: WHEN a user selects a file THEN the system SHALL validate:
- File size is ≤ 20MB
- File type is supported (all types allowed)

**REQ-DOC-003**: WHEN validation passes THEN the system SHALL:
- Show upload progress indicator
- Upload file to Cloudinary as 'raw' resource type
- Create message with type 'document'
- Store document metadata (url, name, size, mimeType)

**REQ-DOC-004**: WHEN upload fails THEN the system SHALL display an error message and allow retry

#### 2.2 Document Display

**REQ-DOC-005**: WHEN a document message is displayed THEN the system SHALL show:
- File type icon (📄 PDF, 📝 DOC, 📊 XLS, 🗜️ ZIP, 📎 generic)
- File name (truncated if too long)
- File size in KB/MB
- Download/open icon

**REQ-DOC-006**: WHEN a user taps a document message THEN the system SHALL attempt to open the file with the device's default app

**REQ-DOC-007**: WHEN the file cannot be opened THEN the system SHALL display an error message

### 3. Stories & Status

#### 3.1 Post Story

**REQ-STORY-001**: WHEN a user taps "Your Story" THEN the system SHALL request media library permissions

**REQ-STORY-002**: WHEN permissions are granted THEN the system SHALL open the image picker with:
- Image/video selection
- 9:16 aspect ratio (story format)
- Quality: 0.8 compression

**REQ-STORY-003**: WHEN a user selects media THEN the system SHALL:
- Upload to Cloudinary
- Create story entry in user's stories array
- Set expiry to 24 hours from now
- Broadcast to all contacts

**REQ-STORY-004**: WHEN a story is posted THEN the system SHALL display it in the user's story circle with a blue ring

#### 3.2 View Stories

**REQ-STORY-005**: WHEN stories exist THEN the system SHALL display story circles showing:
- User avatar
- Blue ring for unviewed stories
- Gray ring for viewed stories
- User name below avatar

**REQ-STORY-006**: WHEN a user taps a story circle THEN the system SHALL:
- Open full-screen story viewer
- Display progress bars for multiple stories
- Auto-advance every 5 seconds
- Mark story as viewed

**REQ-STORY-007**: WHEN viewing a story THEN the system SHALL support:
- Tap left side to go to previous story
- Tap right side to go to next story
- Swipe down to close viewer
- Display story caption if present

**REQ-STORY-008**: WHEN all stories for a user are viewed THEN the system SHALL automatically advance to the next user's stories

#### 3.3 Story Management

**REQ-STORY-009**: WHEN viewing own story THEN the system SHALL show:
- View count
- List of viewers
- Delete option

**REQ-STORY-010**: WHEN a story expires (24 hours) THEN the system SHALL automatically remove it from the database

#### 3.4 Text Status

**REQ-STATUS-001**: WHEN a user taps "Status" button THEN the system SHALL open status editor modal

**REQ-STATUS-002**: WHEN editing status THEN the system SHALL allow:
- Text input (max 100 characters)
- Emoji selection from preset list
- Save/Cancel actions

**REQ-STATUS-003**: WHEN status is saved THEN the system SHALL:
- Update user's status object
- Set updatedAt timestamp
- Broadcast to all contacts
- Display in user's profile

### 4. User Blocking

#### 4.1 Block User

**REQ-BLOCK-001**: WHEN a user selects "Block" from a contact's profile THEN the system SHALL:
- Add contact's ID to user's `blockedUsers` array
- Prevent blocked user from sending messages
- Hide blocked user's messages from view

**REQ-BLOCK-002**: WHEN a blocked user tries to send a message THEN the system SHALL silently fail (no error shown to blocked user)

#### 4.2 Unblock User

**REQ-BLOCK-003**: WHEN a user selects "Unblock" THEN the system SHALL:
- Remove contact's ID from `blockedUsers` array
- Restore normal messaging functionality
- Show previously hidden messages

### 5. Context Menu & Reactions

#### 5.1 Long-Press Menu

**REQ-MENU-001**: WHEN a user long-presses a message THEN the system SHALL:
- Show haptic feedback
- Display context menu with options:
  - Reaction emoji row (❤️ 😂 😮 😢 👍 👎)
  - Edit (if own text message)
  - Delete
  - Copy (if text message)

**REQ-MENU-002**: WHEN a user taps outside the menu THEN the system SHALL close the menu

#### 5.2 Message Reactions

**REQ-REACT-001**: WHEN a user selects a reaction emoji THEN the system SHALL:
- Add/remove user from that emoji's users array
- Update reaction count
- Broadcast to all participants
- Display reactions below message

**REQ-REACT-002**: WHEN displaying reactions THEN the system SHALL:
- Show emoji with count
- Highlight reactions from current user
- Allow tapping to toggle reaction

## Non-Functional Requirements

### Performance

**NFR-PERF-001**: Document uploads SHALL complete within 10 seconds for files up to 20MB on average network

**NFR-PERF-002**: Story viewer SHALL load and display within 2 seconds

**NFR-PERF-003**: Message edits SHALL propagate to all participants within 1 second

### Security

**NFR-SEC-001**: Document URLs SHALL use HTTPS only

**NFR-SEC-002**: Blocked users SHALL NOT be able to bypass blocking through any means

**NFR-SEC-003**: Only message senders SHALL be able to delete messages for everyone

### Usability

**NFR-USE-001**: All context menus SHALL be accessible via long-press gesture

**NFR-USE-002**: File type icons SHALL be visually distinct and recognizable

**NFR-USE-003**: Story viewer SHALL support intuitive tap navigation (left/right)

### Compatibility

**NFR-COMPAT-001**: Document sharing SHALL work on both iOS and Android

**NFR-COMPAT-002**: Stories SHALL support both images and videos

**NFR-COMPAT-003**: All features SHALL work with existing message types (text, image, voice, call)

## Success Criteria

1. Users can edit their text messages with "edited" label displayed
2. Users can delete messages for themselves or everyone
3. Users can send and receive documents up to 20MB
4. Users can post and view 24-hour stories
5. Users can set text status with emoji
6. Users can block/unblock contacts
7. All features work reliably with <1% error rate
8. No performance degradation in existing chat functionality

## Out of Scope

- Story replies/reactions (future enhancement)
- Story privacy settings (all contacts can view)
- Document preview/thumbnail generation
- Message forwarding
- Broadcast lists
- Disappearing messages
- Message search within documents

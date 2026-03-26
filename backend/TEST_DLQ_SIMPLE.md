# Simple DLQ Test Guide

Since we're having TypeScript compilation issues, let's test the DLQ manually using the running server.

## Step 1: Start the Server

```bash
cd backend
npm run dev
```

Wait for:
```
✅ Server listening on 0.0.0.0:3000
✅ MongoDB connected
✅ BullMQ queues initialized
✅ Message worker initialized
```

## Step 2: Check DLQ is Initialized

Look for this in the server logs:
```
BullMQ queues initialized successfully { queues: ['messages', 'ai-responses', 'file-uploads', 'messages-dlq'] }
```

If you see `'messages-dlq'` in the list, the DLQ is ready!

## Step 3: Test DLQ Stats Endpoint

Open a new terminal and run:

```bash
# Get your auth token first (login to get a token)
# Then test the DLQ stats endpoint

curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:3000/api/monitoring/dlq/stats
```

Expected response:
```json
{
  "success": true,
  "data": {
    "waiting": 0,
    "failed": 0,
    "completed": 0,
    "total": 0,
    "timestamp": "2026-03-26T..."
  }
}
```

## Step 4: Trigger a Failing Message (Manual)

We need to create a message that will fail. The easiest way is to:

1. Send a message with an invalid conversation ID
2. Watch the server logs for retry attempts
3. After 3 retries, check if it appears in the DLQ

### Using Browser Console:

1. Open your app in browser
2. Open DevTools Console (F12)
3. Paste this code:

```javascript
// This will fail because the conversation ID doesn't exist
socket.emit('newMessage', {
  conversationId: 'INVALID_CONV_ID_12345',
  sender: { 
    id: 'your-user-id-here',
    name: 'Test User',
    avatar: null
  },
  content: 'This message will fail',
  tempId: `test-dlq-${Date.now()}`
});
```

## Step 5: Watch Server Logs

You should see in the server logs:

```
Message worker failed job { jobId: '...', error: 'Conversation INVALID_CONV_ID_12345 not found', attempts: 1 }
... wait 1 second ...
Message worker failed job { jobId: '...', error: 'Conversation INVALID_CONV_ID_12345 not found', attempts: 2 }
... wait 2 seconds ...
Message worker failed job { jobId: '...', error: 'Conversation INVALID_CONV_ID_12345 not found', attempts: 3 }
Message moved to DLQ { jobId: '...', conversationId: 'INVALID_CONV_ID_12345', error: '...' }
```

## Step 6: Check DLQ Stats Again

```bash
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:3000/api/monitoring/dlq/stats
```

Expected response:
```json
{
  "success": true,
  "data": {
    "waiting": 1,  ← Should be 1 now!
    "failed": 0,
    "completed": 0,
    "total": 1,
    "timestamp": "2026-03-26T..."
  }
}
```

## Step 7: View DLQ Jobs

```bash
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:3000/api/monitoring/dlq/jobs
```

Expected response:
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "id": "...",
        "data": {
          "originalJob": {
            "conversationId": "INVALID_CONV_ID_12345",
            "content": "This message will fail",
            ...
          },
          "error": "Conversation INVALID_CONV_ID_12345 not found",
          "failedAt": "2026-03-26T...",
          "attempts": 3,
          "stack": "Error: Conversation..."
        },
        "timestamp": 1234567890
      }
    ],
    "count": 1
  }
}
```

## ✅ Success Criteria

- [x] Server starts without errors
- [x] DLQ appears in initialized queues list
- [x] DLQ stats endpoint returns data
- [x] Failed message appears in DLQ after 3 retries
- [x] DLQ jobs endpoint shows the failed job
- [x] Error details are captured (error message, stack trace, attempts)

## 🎉 If All Steps Pass

The Dead Letter Queue is working correctly! You can now:

1. Monitor failed messages in production
2. Investigate why messages fail
3. Retry messages after fixing issues
4. Prevent data loss

## Next Steps

Once DLQ is verified working, proceed to FIX #5: Circuit Breakers!

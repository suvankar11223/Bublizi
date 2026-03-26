# Manual Testing Guide for Critical Fixes

## Prerequisites
- Backend server running on `http://localhost:3000`
- Redis running
- Valid authentication token
- Socket.IO client (browser console or Postman)

---

## TEST 1: Rate Limiting ⏱️

### Objective
Verify that rate limiting blocks excessive requests

### Steps

1. **Open Browser Console** (F12)

2. **Connect to Socket.IO**
```javascript
const socket = io('http://localhost:3000', {
  auth: { token: 'YOUR_TOKEN_HERE' }
});

socket.on('connect', () => console.log('Connected'));
```

3. **Send 15 Messages Rapidly**
```javascript
let blocked = 0;
let sent = 0;

socket.on('messageQueued', (data) => {
  sent++;
  console.log(`✅ Message ${sent} queued:`, data.seq);
});

socket.on('newMessage', (data) => {
  if (!data.success && data.msg?.includes('Rate limit')) {
    blocked++;
    console.log(`❌ Message ${blocked} blocked:`, data.msg);
  }
});

// Send 15 messages (limit is 10 per 10 seconds)
for (let i = 1; i <= 15; i++) {
  socket.emit('newMessage', {
    conversationId: 'test-conv-123',
    sender: {
      id: 'your-user-id',
      name: 'Test User',
      avatar: null
    },
    content: `Test message ${i}`,
    tempId: `test-${i}-${Date.now()}`
  });
}
```

4. **Check Results**
```javascript
setTimeout(() => {
  console.log(`Sent: ${sent}, Blocked: ${blocked}`);
  if (blocked >= 5) {
    console.log('✅ TEST PASSED: Rate limiting working!');
  } else {
    console.log('❌ TEST FAILED: Rate limiting not working');
  }
}, 3000);
```

### Expected Result
- First 10 messages: ✅ Queued successfully
- Messages 11-15: ❌ Blocked with "Rate limit exceeded"
- `blocked >= 5`

---

## TEST 2: Socket Idempotency 🔄

### Objective
Verify that duplicate messages are blocked at socket level

### Steps

1. **Send Same Message 10 Times**
```javascript
const tempId = `test-idempotency-${Date.now()}`;
let acks = 0;
let duplicates = 0;

socket.on('messageQueued', (data) => {
  acks++;
  if (data.duplicate) {
    duplicates++;
    console.log(`🔄 Duplicate ${duplicates} blocked`);
  } else {
    console.log(`✅ Unique message queued`);
  }
});

// Send same tempId 10 times
for (let i = 0; i < 10; i++) {
  socket.emit('newMessage', {
    conversationId: 'test-conv-123',
    sender: {
      id: 'your-user-id',
      name: 'Test User',
      avatar: null
    },
    content: 'Test idempotency',
    tempId: tempId  // SAME tempId for all
  });
}
```

2. **Check Results**
```javascript
setTimeout(() => {
  console.log(`Total ACKs: ${acks}, Duplicates: ${duplicates}`);
  if (duplicates === 9 && acks === 10) {
    console.log('✅ TEST PASSED: Idempotency working perfectly!');
  } else {
    console.log(`⚠️ TEST RESULT: ${duplicates}/9 duplicates blocked`);
  }
}, 2000);
```

### Expected Result
- 1 message processed (unique)
- 9 messages blocked (duplicates)
- Total ACKs: 10 (1 unique + 9 duplicate ACKs)

---

## TEST 3: Sequence Generation - Fail Fast 🚫

### Objective
Verify that system fails gracefully when Redis is unavailable

### Steps

#### Part A: Normal Operation

1. **Ensure Redis is Running**
```bash
redis-cli ping
# Should return: PONG
```

2. **Send Message**
```javascript
socket.emit('newMessage', {
  conversationId: 'test-conv-123',
  sender: {
    id: 'your-user-id',
    name: 'Test User',
    avatar: null
  },
  content: 'Test with Redis running',
  tempId: `test-seq-1-${Date.now()}`
});

socket.on('messageQueued', (data) => {
  console.log('✅ Message queued with seq:', data.seq);
});
```

**Expected:** Message queued successfully with sequence number

#### Part B: Redis Failure

1. **Stop Redis**
```bash
# Windows
net stop Redis

# Linux/Mac
redis-cli shutdown
```

2. **Send Message**
```javascript
socket.emit('newMessage', {
  conversationId: 'test-conv-123',
  sender: {
    id: 'your-user-id',
    name: 'Test User',
    avatar: null
  },
  content: 'Test with Redis down',
  tempId: `test-seq-2-${Date.now()}`
});

socket.on('newMessage', (data) => {
  if (!data.success) {
    console.log('✅ Failed gracefully:', data.msg);
    console.log('   Code:', data.code);
    console.log('   Retryable:', data.retryable);
  }
});
```

**Expected:**
- Error message: "Service temporarily unavailable. Please try again."
- Code: "SEQUENCE_UNAVAILABLE"
- Retryable: true
- NO timestamp fallback (no seq number generated)

#### Part C: Recovery

1. **Start Redis**
```bash
# Windows
net start Redis

# Linux/Mac
redis-server
```

2. **Retry Message**
```javascript
socket.emit('newMessage', {
  conversationId: 'test-conv-123',
  sender: {
    id: 'your-user-id',
    name: 'Test User',
    avatar: null
  },
  content: 'Test after Redis recovery',
  tempId: `test-seq-3-${Date.now()}`
});
```

**Expected:** Message queued successfully again

---

## TEST 4: Redis Connection 🔌

### Objective
Verify Redis is working correctly

### Steps

1. **Test Redis CLI**
```bash
redis-cli ping
# Expected: PONG

redis-cli set test-key "test-value"
# Expected: OK

redis-cli get test-key
# Expected: "test-value"

redis-cli incr test-counter
# Expected: (integer) 1

redis-cli ttl test-key
# Expected: (integer) -1 (no expiry)

redis-cli del test-key test-counter
# Expected: (integer) 2
```

2. **Check Redis Keys**
```bash
# Check rate limit keys
redis-cli keys "ratelimit:*"

# Check idempotency keys
redis-cli keys "idempotency:*"

# Check sequence keys
redis-cli keys "seq:*"
```

---

## TEST 5: End-to-End Message Flow 📨

### Objective
Verify complete message flow works correctly

### Steps

1. **Send Normal Message**
```javascript
socket.emit('newMessage', {
  conversationId: 'real-conversation-id',
  sender: {
    id: 'your-user-id',
    name: 'Your Name',
    avatar: 'your-avatar-url'
  },
  content: 'Hello, testing critical fixes!',
  tempId: `msg-${Date.now()}`
});
```

2. **Verify in UI**
- Message appears immediately (optimistic UI)
- Message confirmed after ~100ms
- No duplicates
- Correct ordering

3. **Check Database**
```javascript
// In MongoDB
db.messages.find({ tempId: 'your-temp-id' }).count()
// Expected: 1 (no duplicates)

db.messages.find({ conversationId: 'your-conv-id' }).sort({ seq: 1 })
// Expected: Messages in correct sequence order
```

---

## Troubleshooting 🔧

### Rate Limiting Not Working
```bash
# Check Redis connection
redis-cli ping

# Check rate limit keys
redis-cli keys "ratelimit:*"

# Check logs
tail -f backend/logs/app.log | grep "Rate limit"
```

### Idempotency Not Working
```bash
# Check idempotency keys
redis-cli keys "idempotency:*"

# Check TTL
redis-cli ttl "idempotency:your-temp-id"

# Should be ~300 seconds (5 minutes)
```

### Sequence Generation Issues
```bash
# Check sequence counters
redis-cli keys "seq:*"

# Check specific conversation
redis-cli get "seq:your-conversation-id"

# Should be incrementing integer
```

---

## Success Criteria ✅

### All Tests Pass If:
- ✅ Rate limiting blocks 5+ messages out of 15
- ✅ Idempotency blocks 9 duplicates out of 10
- ✅ Sequence generation fails gracefully when Redis down
- ✅ Sequence generation recovers when Redis up
- ✅ No timestamp fallback used
- ✅ No duplicate messages in database
- ✅ Messages in correct order

### System is Production-Ready If:
- ✅ All tests pass
- ✅ No TypeScript errors
- ✅ No console errors
- ✅ Redis connection stable
- ✅ Message delivery < 100ms
- ✅ No memory leaks

---

## Quick Test Commands

```bash
# Start backend
cd backend
npm run dev

# In another terminal - test Redis
redis-cli ping

# In another terminal - run automated tests
cd backend
npx ts-node tests/test-critical-fixes.ts

# Or use the test script
npm run test:fixes
```

---

## Next Steps After Testing

1. ✅ All tests pass → Proceed to FIX #4 (Dead Letter Queue)
2. ⚠️ Some tests fail → Review logs and fix issues
3. ❌ Tests fail → Rollback and investigate

**Good luck with testing! 🚀**

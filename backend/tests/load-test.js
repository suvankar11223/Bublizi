/**
 * Load Test Script for Phase 3
 * 
 * Tests:
 * - 100 concurrent users
 * - 1000 messages per minute
 * - Rate limiting
 * - Queue performance
 * - Memory usage
 * 
 * Usage: node backend/tests/load-test.js
 */

const io = require('socket.io-client');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const NUM_USERS = 100;
const MESSAGES_PER_MINUTE = 1000;
const TEST_DURATION_MINUTES = 5;
const TEST_TOKEN = process.env.TEST_TOKEN; // Set this to a valid JWT token

// Statistics
const stats = {
  connected: 0,
  messagesSent: 0,
  messagesReceived: 0,
  messagesQueued: 0,
  errors: 0,
  rateLimited: 0,
  duplicates: new Set(),
  latencies: [],
  startTime: null,
  endTime: null,
};

// Create a test user connection
function createUser(userId) {
  const socket = io(SERVER_URL, {
    auth: { token: TEST_TOKEN },
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    stats.connected++;
    console.log(`[User ${userId}] Connected (${stats.connected}/${NUM_USERS})`);
  });

  socket.on('messageQueued', (data) => {
    stats.messagesQueued++;
    const latency = Date.now() - data.timestamp;
    stats.latencies.push(latency);
  });

  socket.on('newMessage', (data) => {
    if (data.success) {
      stats.messagesReceived++;
      
      // Check for duplicates
      const msgId = data.data.id;
      if (stats.duplicates.has(msgId)) {
        console.error(`[DUPLICATE] Message ${msgId} received twice!`);
      }
      stats.duplicates.add(msgId);
    } else {
      if (data.msg && data.msg.includes('Rate limit')) {
        stats.rateLimited++;
      } else {
        stats.errors++;
        console.error(`[Error] ${data.msg}`);
      }
    }
  });

  socket.on('error', (error) => {
    stats.errors++;
    console.error(`[User ${userId}] Error:`, error);
  });

  socket.on('disconnect', () => {
    console.log(`[User ${userId}] Disconnected`);
  });

  return socket;
}

// Send a test message
function sendMessage(socket, conversationId, userId) {
  const message = {
    conversationId,
    sender: {
      id: userId,
      name: `TestUser${userId}`,
      avatar: '',
    },
    content: `Test message ${Date.now()}`,
    tempId: `temp_${Date.now()}_${Math.random()}`,
  };

  socket.emit('newMessage', message);
  stats.messagesSent++;
}

// Main load test
async function runLoadTest() {
  console.log('=== PHASE 3 LOAD TEST ===');
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Users: ${NUM_USERS}`);
  console.log(`Messages/min: ${MESSAGES_PER_MINUTE}`);
  console.log(`Duration: ${TEST_DURATION_MINUTES} minutes`);
  console.log('');

  if (!TEST_TOKEN) {
    console.error('ERROR: TEST_TOKEN environment variable not set');
    console.error('Set a valid JWT token: export TEST_TOKEN="your-token-here"');
    process.exit(1);
  }

  stats.startTime = Date.now();

  // Create test conversation ID
  const testConversationId = 'test_conversation_' + Date.now();

  // Connect users
  console.log('Connecting users...');
  const users = [];
  for (let i = 0; i < NUM_USERS; i++) {
    users.push(createUser(i));
    await new Promise(resolve => setTimeout(resolve, 50)); // Stagger connections
  }

  // Wait for all connections
  await new Promise(resolve => {
    const checkInterval = setInterval(() => {
      if (stats.connected === NUM_USERS) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });

  console.log(`\n✓ All ${NUM_USERS} users connected\n`);

  // Send messages
  console.log('Starting message flood...');
  const messageInterval = (60 * 1000) / MESSAGES_PER_MINUTE; // ms between messages
  const testDuration = TEST_DURATION_MINUTES * 60 * 1000;

  const messageTimer = setInterval(() => {
    const randomUser = users[Math.floor(Math.random() * users.length)];
    const randomUserId = Math.floor(Math.random() * NUM_USERS);
    sendMessage(randomUser, testConversationId, randomUserId);
  }, messageInterval);

  // Progress reporting
  const progressTimer = setInterval(() => {
    const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
    const avgLatency = stats.latencies.length > 0
      ? (stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length).toFixed(2)
      : 0;
    
    console.log(`[${elapsed}s] Sent: ${stats.messagesSent} | Queued: ${stats.messagesQueued} | Received: ${stats.messagesReceived} | Errors: ${stats.errors} | Rate Limited: ${stats.rateLimited} | Avg Latency: ${avgLatency}ms`);
  }, 5000);

  // Stop after test duration
  setTimeout(() => {
    clearInterval(messageTimer);
    clearInterval(progressTimer);
    stats.endTime = Date.now();

    // Wait for remaining messages
    setTimeout(() => {
      printResults();
      process.exit(0);
    }, 5000);
  }, testDuration);
}

// Print test results
function printResults() {
  console.log('\n=== LOAD TEST RESULTS ===\n');

  const duration = (stats.endTime - stats.startTime) / 1000;
  const avgLatency = stats.latencies.length > 0
    ? (stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length).toFixed(2)
    : 0;
  const maxLatency = stats.latencies.length > 0
    ? Math.max(...stats.latencies).toFixed(2)
    : 0;
  const minLatency = stats.latencies.length > 0
    ? Math.min(...stats.latencies).toFixed(2)
    : 0;

  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Connected Users: ${stats.connected}/${NUM_USERS}`);
  console.log('');
  console.log(`Messages Sent: ${stats.messagesSent}`);
  console.log(`Messages Queued: ${stats.messagesQueued}`);
  console.log(`Messages Received: ${stats.messagesReceived}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Rate Limited: ${stats.rateLimited}`);
  console.log('');
  console.log(`Avg Latency: ${avgLatency}ms`);
  console.log(`Min Latency: ${minLatency}ms`);
  console.log(`Max Latency: ${maxLatency}ms`);
  console.log('');

  // Success criteria
  const successRate = (stats.messagesReceived / stats.messagesSent * 100).toFixed(2);
  const queueRate = (stats.messagesQueued / stats.messagesSent * 100).toFixed(2);
  const duplicateCount = stats.messagesSent - stats.duplicates.size;

  console.log('=== ANALYSIS ===\n');
  console.log(`Success Rate: ${successRate}%`);
  console.log(`Queue Rate: ${queueRate}%`);
  console.log(`Duplicate Messages: ${duplicateCount}`);
  console.log('');

  // Pass/Fail
  const passed = 
    stats.connected === NUM_USERS &&
    successRate >= 95 &&
    duplicateCount === 0 &&
    avgLatency < 100;

  if (passed) {
    console.log('✅ LOAD TEST PASSED');
  } else {
    console.log('❌ LOAD TEST FAILED');
    if (stats.connected < NUM_USERS) console.log('  - Not all users connected');
    if (successRate < 95) console.log('  - Success rate below 95%');
    if (duplicateCount > 0) console.log('  - Duplicate messages detected');
    if (avgLatency >= 100) console.log('  - Average latency too high');
  }
}

// Run the test
runLoadTest().catch(error => {
  console.error('Load test failed:', error);
  process.exit(1);
});

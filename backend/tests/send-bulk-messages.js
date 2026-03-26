/**
 * Bulk Message Sender
 * 
 * Sends multiple messages for testing worker resilience
 * Usage: node backend/tests/send-bulk-messages.js
 */

import { io } from 'socket.io-client';
import dotenv from 'dotenv';

dotenv.config();

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const TEST_USER_TOKEN = process.env.TEST_USER_TOKEN || '';
const TEST_CONVERSATION_ID = process.env.TEST_CONVERSATION_ID || '';
const MESSAGE_COUNT = parseInt(process.env.MESSAGE_COUNT || '20');

if (!TEST_USER_TOKEN || !TEST_CONVERSATION_ID) {
  console.error('❌ Missing environment variables:');
  console.error('   TEST_USER_TOKEN - JWT token for test user');
  console.error('   TEST_CONVERSATION_ID - MongoDB conversation ID');
  console.error('');
  console.error('Usage:');
  console.error('TEST_USER_TOKEN=xxx TEST_CONVERSATION_ID=yyy node backend/tests/send-bulk-messages.js');
  process.exit(1);
}

console.log('🚀 Bulk Message Sender');
console.log('─'.repeat(60));
console.log(`Server: ${SERVER_URL}`);
console.log(`Messages to send: ${MESSAGE_COUNT}`);
console.log('');

const socket = io(SERVER_URL, {
  auth: { token: TEST_USER_TOKEN },
  transports: ['websocket'],
});

socket.on('connect', async () => {
  console.log('✓ Connected to server');
  console.log('');
  console.log('Sending messages...');

  const tempIds = [];
  const startTime = Date.now();

  for (let i = 0; i < MESSAGE_COUNT; i++) {
    const tempId = `bulk_test_${Date.now()}_${i}`;
    tempIds.push(tempId);

    socket.emit('newMessage', {
      conversationId: TEST_CONVERSATION_ID,
      sender: {
        id: 'test-user-id',
        name: 'Bulk Test User',
        avatar: '',
      },
      content: `Bulk test message ${i + 1}/${MESSAGE_COUNT}`,
      tempId,
    });

    process.stdout.write(`\r  Sent: ${i + 1}/${MESSAGE_COUNT}`);

    // Small delay to avoid overwhelming the server
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const duration = Date.now() - startTime;

  console.log('\n');
  console.log('✓ All messages sent');
  console.log(`  Duration: ${duration}ms`);
  console.log(`  Rate: ${(MESSAGE_COUNT / (duration / 1000)).toFixed(2)} msg/s`);
  console.log('');
  console.log('TempIds:', tempIds);
  console.log('');
  console.log('💡 Now check:');
  console.log('   1. Redis queue: redis-cli LLEN bull:messages:wait');
  console.log('   2. MongoDB: db.messages.find({ tempId: /bulk_test/ }).count()');
  console.log('   3. Logs: tail -f backend/logs/app.log');

  socket.disconnect();
  process.exit(0);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  process.exit(1);
});

socket.on('messageQueued', (data) => {
  // Silently acknowledge
});

// Timeout after 30 seconds
setTimeout(() => {
  console.error('\n❌ Timeout: Could not complete in 30 seconds');
  socket.disconnect();
  process.exit(1);
}, 30000);

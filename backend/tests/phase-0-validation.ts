/**
 * PHASE 0 SECURITY FOUNDATION - COMPREHENSIVE VALIDATION
 * 
 * Tests all 6 security fixes to ensure they work correctly
 */

import { io as ioClient, Socket } from 'socket.io-client';
import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, error?: string, details?: any) {
  results.push({ name, passed, error, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}`);
  if (error) console.log(`   Error: ${error}`);
  if (details) console.log(`   Details:`, details);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: INPUT VALIDATION - SOCKET EVENTS
// ═══════════════════════════════════════════════════════════════════════════

async function testSocketValidation(token: string, userId: string): Promise<void> {
  console.log('\n🔍 TEST 1: Socket Event Input Validation\n');

  return new Promise((resolve) => {
    const socket: Socket = ioClient(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', async () => {
      console.log('Socket connected');

      // Test 1.1: Invalid conversationId (not ObjectId)
      socket.emit('joinConversation', 'invalid-id-123');
      
      socket.once('conversationJoined', (data: any) => {
        if (data.success === false && data.msg?.includes('Invalid')) {
          logTest('1.1: Reject invalid ObjectId in joinConversation', true);
        } else {
          logTest('1.1: Reject invalid ObjectId in joinConversation', false, 'Should reject invalid ObjectId');
        }
      });

      // Wait a bit for response
      await new Promise(r => setTimeout(r, 500));

      // Test 1.2: Oversized message content
      const hugeContent = 'x'.repeat(10001);
      socket.emit('newMessage', {
        conversationId: '507f1f77bcf86cd799439011',
        content: hugeContent,
        sender: { id: userId, name: 'Test', avatar: '' },
      });

      socket.once('newMessage', (data: any) => {
        if (data.success === false && data.msg?.includes('too long')) {
          logTest('1.2: Reject oversized message (>10KB)', true);
        } else {
          logTest('1.2: Reject oversized message (>10KB)', false, 'Should reject oversized content');
        }
      });

      await new Promise(r => setTimeout(r, 500));

      // Test 1.3: Missing required fields
      socket.emit('newMessage', {
        conversationId: '507f1f77bcf86cd799439011',
        // Missing content and attachment
        sender: { id: userId, name: 'Test', avatar: '' },
      });

      socket.once('newMessage', (data: any) => {
        if (data.success === false) {
          logTest('1.3: Reject message without content or attachment', true);
        } else {
          logTest('1.3: Reject message without content or attachment', false, 'Should require content or attachment');
        }
      });

      await new Promise(r => setTimeout(r, 500));

      // Test 1.4: Invalid conversationId in getMessages
      socket.emit('getMessages', { conversationId: 'not-an-objectid' });

      socket.once('getMessages', (data: any) => {
        if (data.success === false && data.msg?.includes('Invalid')) {
          logTest('1.4: Reject invalid ObjectId in getMessages', true);
        } else {
          logTest('1.4: Reject invalid ObjectId in getMessages', false, 'Should reject invalid ObjectId');
        }
      });

      await new Promise(r => setTimeout(r, 500));

      // Test 1.5: Invalid conversationId in markAsRead
      socket.emit('markAsRead', { conversationId: 'bad-id' });

      socket.once('markAsRead', (data: any) => {
        if (data.success === false && data.msg?.includes('Invalid')) {
          logTest('1.5: Reject invalid ObjectId in markAsRead', true);
        } else {
          logTest('1.5: Reject invalid ObjectId in markAsRead', false, 'Should reject invalid ObjectId');
        }
      });

      await new Promise(r => setTimeout(r, 1000));

      socket.disconnect();
      resolve();
    });

    socket.on('connect_error', (err) => {
      logTest('Socket connection', false, err.message);
      resolve();
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: INPUT VALIDATION - HTTP ROUTES
// ═══════════════════════════════════════════════════════════════════════════

async function testHttpValidation(token: string): Promise<void> {
  console.log('\n🔍 TEST 2: HTTP Route Input Validation\n');

  // Test 2.1: Invalid ObjectId in call route
  try {
    const res = await fetch(`${API_URL}/api/call/invalid-id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    
    if (res.status === 400 && data.msg?.includes('Invalid')) {
      logTest('2.1: Reject invalid ObjectId in GET /api/call/:callId', true);
    } else {
      logTest('2.1: Reject invalid ObjectId in GET /api/call/:callId', false, 'Should return 400');
    }
  } catch (err: any) {
    logTest('2.1: Reject invalid ObjectId in GET /api/call/:callId', false, err.message);
  }

  // Test 2.2: Invalid ObjectId in user messages route
  try {
    const res = await fetch(`${API_URL}/api/user/messages/bad-id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    
    if (res.status === 400 && data.msg?.includes('Invalid')) {
      logTest('2.2: Reject invalid ObjectId in GET /api/user/messages/:conversationId', true);
    } else {
      logTest('2.2: Reject invalid ObjectId in GET /api/user/messages/:conversationId', false, 'Should return 400');
    }
  } catch (err: any) {
    logTest('2.2: Reject invalid ObjectId in GET /api/user/messages/:conversationId', false, err.message);
  }

  // Test 2.3: Oversized phone array in contact sync
  try {
    const hugePhoneArray = Array(10001).fill('+1234567890');
    const res = await fetch(`${API_URL}/api/contacts/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ phones: hugePhoneArray }),
    });
    const data = await res.json();
    
    if (res.status === 400 && data.msg?.includes('Too many')) {
      logTest('2.3: Reject >10K phones in contact sync', true);
    } else {
      logTest('2.3: Reject >10K phones in contact sync', false, 'Should return 400', data);
    }
  } catch (err: any) {
    logTest('2.3: Reject >10K phones in contact sync', false, err.message);
  }

  // Test 2.4: Invalid phone numbers in contact sync
  try {
    const invalidPhones = ['abc', '123', 'not-a-phone'];
    const res = await fetch(`${API_URL}/api/contacts/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ phones: invalidPhones }),
    });
    const data = await res.json();
    
    if (res.status === 400 && data.msg?.includes('No valid')) {
      logTest('2.4: Reject invalid phone numbers in contact sync', true);
    } else {
      logTest('2.4: Reject invalid phone numbers in contact sync', false, 'Should return 400', data);
    }
  } catch (err: any) {
    logTest('2.4: Reject invalid phone numbers in contact sync', false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: TOKEN REFRESH MECHANISM
// ═══════════════════════════════════════════════════════════════════════════

async function testTokenRefresh(): Promise<void> {
  console.log('\n🔍 TEST 3: Token Refresh Mechanism\n');

  // Test 3.1: Refresh endpoint exists
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'invalid-token' }),
    });
    
    // Should return 401 or 400, not 404
    if (res.status !== 404) {
      logTest('3.1: Refresh endpoint exists', true);
    } else {
      logTest('3.1: Refresh endpoint exists', false, 'Endpoint returns 404');
    }
  } catch (err: any) {
    logTest('3.1: Refresh endpoint exists', false, err.message);
  }

  // Test 3.2: Refresh rejects invalid token
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'definitely-not-valid' }),
    });
    const data = await res.json();
    
    if (res.status === 401 || (data.success === false && data.msg?.includes('Invalid'))) {
      logTest('3.2: Refresh rejects invalid token', true);
    } else {
      logTest('3.2: Refresh rejects invalid token', false, 'Should reject invalid token', data);
    }
  } catch (err: any) {
    logTest('3.2: Refresh rejects invalid token', false, err.message);
  }

  // Test 3.3: Check JWT_REFRESH_SECRET is set
  try {
    const hasSecret = !!process.env.JWT_REFRESH_SECRET;
    if (hasSecret) {
      logTest('3.3: JWT_REFRESH_SECRET environment variable set', true);
    } else {
      logTest('3.3: JWT_REFRESH_SECRET environment variable set', false, 'JWT_REFRESH_SECRET not found in env');
    }
  } catch (err: any) {
    logTest('3.3: JWT_REFRESH_SECRET environment variable set', false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4: CORS CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

async function testCORS(): Promise<void> {
  console.log('\n🔍 TEST 4: CORS Configuration\n');

  // Test 4.1: Check CORS headers on API endpoint
  try {
    const res = await fetch(`${API_URL}/api/user/profile`, {
      method: 'OPTIONS',
    });
    
    const corsHeader = res.headers.get('access-control-allow-origin');
    
    if (corsHeader) {
      if (corsHeader === '*') {
        logTest('4.1: CORS not using wildcard (*)', false, 'CORS is set to wildcard - security risk!');
      } else {
        logTest('4.1: CORS not using wildcard (*)', true, undefined, { origin: corsHeader });
      }
    } else {
      logTest('4.1: CORS headers present', false, 'No CORS headers found');
    }
  } catch (err: any) {
    logTest('4.1: CORS configuration', false, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5: FILE UPLOAD VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

async function testFileUpload(token: string): Promise<void> {
  console.log('\n🔍 TEST 5: File Upload Validation\n');

  // Test 5.1: Reject upload without file
  try {
    const formData = new FormData();
    // No file attached
    
    const res = await fetch(`${API_URL}/api/upload/voice`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    
    if (res.status === 400 && data.msg?.includes('No file')) {
      logTest('5.1: Reject upload without file', true);
    } else {
      logTest('5.1: Reject upload without file', false, 'Should return 400', data);
    }
  } catch (err: any) {
    logTest('5.1: Reject upload without file', false, err.message);
  }

  // Test 5.2: Check validation middleware is imported
  console.log('   ℹ️  5.2: File size/type validation requires actual file upload (manual test)');
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 6: CODE STRUCTURE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

async function testCodeStructure(): Promise<void> {
  console.log('\n🔍 TEST 6: Code Structure Validation\n');

  const fs = await import('fs');
  const path = await import('path');

  // Test 6.1: Validation middleware exists
  const validationPath = path.join(process.cwd(), 'middleware', 'validation.ts');
  if (fs.existsSync(validationPath)) {
    logTest('6.1: Validation middleware file exists', true);
    
    // Check if it exports required functions
    const content = fs.readFileSync(validationPath, 'utf-8');
    const hasValidateMessage = content.includes('export function validateMessage');
    const hasValidateObjectId = content.includes('export function validateObjectId');
    const hasValidateFileUpload = content.includes('export function validateFileUpload');
    const hasSocketSchemas = content.includes('export const socketSchemas');
    
    if (hasValidateMessage && hasValidateObjectId && hasValidateFileUpload && hasSocketSchemas) {
      logTest('6.2: Validation middleware exports all required functions', true);
    } else {
      logTest('6.2: Validation middleware exports all required functions', false, 'Missing exports', {
        validateMessage: hasValidateMessage,
        validateObjectId: hasValidateObjectId,
        validateFileUpload: hasValidateFileUpload,
        socketSchemas: hasSocketSchemas,
      });
    }
  } else {
    logTest('6.1: Validation middleware file exists', false, 'File not found');
  }

  // Test 6.3: Socket events import validation
  const chatEventsPath = path.join(process.cwd(), 'socket', 'chatEvents.ts');
  if (fs.existsSync(chatEventsPath)) {
    const content = fs.readFileSync(chatEventsPath, 'utf-8');
    const importsValidation = content.includes("from '../middleware/validation.js'");
    const usesValidation = content.includes('validateSocketData');
    
    if (importsValidation && usesValidation) {
      logTest('6.3: chatEvents.ts imports and uses validation', true);
    } else {
      logTest('6.3: chatEvents.ts imports and uses validation', false, 'Missing import or usage', {
        imports: importsValidation,
        uses: usesValidation,
      });
    }
  } else {
    logTest('6.3: chatEvents.ts file exists', false, 'File not found');
  }

  // Test 6.4: Routes import validation
  const routesToCheck = [
    'routes/upload.routes.ts',
    'routes/user.routes.ts',
    'routes/call.routes.ts',
  ];

  for (const route of routesToCheck) {
    const routePath = path.join(process.cwd(), route);
    if (fs.existsSync(routePath)) {
      const content = fs.readFileSync(routePath, 'utf-8');
      const importsValidation = content.includes("from '../middleware/validation.js'");
      
      if (importsValidation) {
        logTest(`6.4: ${route} imports validation`, true);
      } else {
        logTest(`6.4: ${route} imports validation`, false, 'Missing import');
      }
    }
  }

  // Test 6.5: Frontend API service has token refresh
  const apiServicePath = path.join(process.cwd(), '..', 'frontend', 'services', 'apiService.ts');
  if (fs.existsSync(apiServicePath)) {
    const content = fs.readFileSync(apiServicePath, 'utf-8');
    const hasRefreshFunction = content.includes('refreshAuthToken');
    const handles401 = content.includes('res.status === 401');
    const retriesRequest = content.includes('retryCount');
    
    if (hasRefreshFunction && handles401 && retriesRequest) {
      logTest('6.5: Frontend API service has automatic token refresh', true);
    } else {
      logTest('6.5: Frontend API service has automatic token refresh', false, 'Missing refresh logic', {
        hasRefreshFunction,
        handles401,
        retriesRequest,
      });
    }
  } else {
    logTest('6.5: Frontend API service file exists', false, 'File not found');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  PHASE 0 SECURITY VALIDATION SUITE                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  // Get test credentials
  const testEmail = process.env.TEST_EMAIL || 'test@example.com';
  const testPassword = process.env.TEST_PASSWORD || 'testpassword123';

  let token = '';
  let userId = '';

  // Login to get token
  console.log('🔐 Authenticating test user...\n');
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const data = await res.json();
    
    if (data.success && data.data?.accessToken) {
      token = data.data.accessToken;
      userId = data.data.user?.id || '';
      console.log('✅ Authentication successful\n');
    } else {
      console.log('⚠️  Could not authenticate - some tests will be skipped');
      console.log('   Set TEST_EMAIL and TEST_PASSWORD env vars for full testing\n');
    }
  } catch (err: any) {
    console.log('⚠️  Authentication failed:', err.message);
    console.log('   Some tests will be skipped\n');
  }

  // Run all test suites
  await testCodeStructure();
  await testCORS();
  await testTokenRefresh();
  
  if (token) {
    await testHttpValidation(token);
    await testSocketValidation(token, userId);
    await testFileUpload(token);
  } else {
    console.log('\n⚠️  Skipping tests that require authentication\n');
  }

  // Print summary
  console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           TEST SUMMARY                                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.log('Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.name}`);
      if (r.error) console.log(`     ${r.error}`);
    });
    console.log('');
  }

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

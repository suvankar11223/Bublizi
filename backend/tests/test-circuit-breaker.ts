/**
 * Circuit Breaker Test Script
 * 
 * Tests that circuit breakers open after threshold failures
 * and close after successful recovery
 */

import { CircuitBreaker } from '../utils/circuitBreaker.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testCircuitBreaker() {
  log('\n' + '='.repeat(60), colors.blue);
  log('CIRCUIT BREAKER TEST', colors.blue);
  log('='.repeat(60) + '\n', colors.blue);

  // Create a test circuit breaker
  const cb = new CircuitBreaker('test-service', 3, 5000, 2);
  
  log('✅ Circuit breaker created', colors.green);
  log(`   Threshold: 3 failures`, colors.reset);
  log(`   Timeout: 5 seconds`, colors.reset);
  log(`   Half-open attempts: 2`, colors.reset);

  // Test 1: Normal operation (CLOSED state)
  log('\n📊 TEST 1: Normal Operation', colors.blue);
  try {
    await cb.execute(() => Promise.resolve('success'));
    log('✅ Request succeeded in CLOSED state', colors.green);
  } catch (error: any) {
    log('❌ Request failed unexpectedly', colors.red);
  }

  // Test 2: Trigger failures to open circuit
  log('\n📊 TEST 2: Triggering Failures', colors.blue);
  for (let i = 1; i <= 3; i++) {
    try {
      await cb.execute(() => Promise.reject(new Error('Test failure')));
    } catch (error) {
      log(`   Failure ${i}/3`, colors.yellow);
    }
  }

  const state = cb.getState();
  if (state.state === 'OPEN') {
    log('✅ Circuit breaker opened after 3 failures', colors.green);
  } else {
    log('❌ Circuit breaker should be OPEN', colors.red);
  }

  // Test 3: Requests fail immediately when circuit is open
  log('\n📊 TEST 3: Fail Fast When Open', colors.blue);
  try {
    await cb.execute(() => Promise.resolve('success'));
    log('❌ Request should have failed immediately', colors.red);
  } catch (error: any) {
    if (error.message.includes('Circuit breaker')) {
      log('✅ Request failed immediately (circuit is OPEN)', colors.green);
      log(`   Retry after: ${cb.getRetryAfter()}s`, colors.reset);
    } else {
      log('❌ Wrong error message', colors.red);
    }
  }

  // Test 4: Wait for timeout and transition to HALF_OPEN
  log('\n📊 TEST 4: Transition to HALF_OPEN', colors.blue);
  log('   Waiting 5 seconds for timeout...', colors.yellow);
  await new Promise(resolve => setTimeout(resolve, 5100));

  try {
    await cb.execute(() => Promise.resolve('success'));
    log('✅ First request succeeded in HALF_OPEN', colors.green);
  } catch (error: any) {
    log('❌ Request failed in HALF_OPEN', colors.red);
  }

  // Test 5: Second success should close the circuit
  log('\n📊 TEST 5: Close Circuit After Successes', colors.blue);
  try {
    await cb.execute(() => Promise.resolve('success'));
    log('✅ Second request succeeded', colors.green);
    
    const finalState = cb.getState();
    if (finalState.state === 'CLOSED') {
      log('✅ Circuit breaker closed after 2 successes', colors.green);
    } else {
      log(`⚠️  Circuit breaker in ${finalState.state} state`, colors.yellow);
    }
  } catch (error: any) {
    log('❌ Request failed unexpectedly', colors.red);
  }

  // Summary
  log('\n' + '='.repeat(60), colors.blue);
  log('TEST SUMMARY', colors.blue);
  log('='.repeat(60) + '\n', colors.blue);

  const finalState = cb.getState();
  log(`Final State: ${finalState.state}`, colors.reset);
  log(`Total Failures: ${finalState.failures}`, colors.reset);
  log(`Success Count: ${finalState.successCount}`, colors.reset);

  if (finalState.state === 'CLOSED' && finalState.failures === 0) {
    log('\n🎉 ALL TESTS PASSED!', colors.green);
    log('Circuit breaker is working correctly', colors.green);
    process.exit(0);
  } else {
    log('\n⚠️  SOME TESTS FAILED', colors.yellow);
    log('Review the test output above', colors.yellow);
    process.exit(1);
  }
}

// Run test
testCircuitBreaker().catch(error => {
  console.error('\n❌ TEST ERROR:', error.message);
  console.error('   Stack:', error.stack);
  process.exit(1);
});

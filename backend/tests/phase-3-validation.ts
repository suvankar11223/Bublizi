/**
 * PHASE 3 VALIDATION - SECURITY HARDENING
 * 
 * Tests:
 * 1. Security Monitor (IP blocking, failed attempts)
 * 2. Password Policy (strength, history, reuse)
 * 3. Audit Logging (events, critical events)
 */

import { securityMonitor } from '../services/securityMonitor.js';
import { validatePassword, checkPasswordHistory, addToPasswordHistory, validatePasswordChange } from '../utils/passwordPolicy.js';
import { auditLogger } from '../services/auditLog.js';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  critical: boolean;
}

const results: TestResult[] = [];

function addResult(name: string, passed: boolean, details: string, critical = false) {
  results.push({ name, passed, details, critical });
  const icon = passed ? '✅' : '❌';
  const severity = critical ? '[CRITICAL]' : '';
  console.log(`${icon} ${severity} ${name}: ${details}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSecurityMonitor() {
  console.log('\n📋 TEST 1: Security Monitor - Failed Login Tracking');
  console.log('='.repeat(60));

  try {
    const testIP = '192.168.1.100';
    const testEmail = 'test@example.com';

    // Test 1.1: Track failed login
    await securityMonitor.trackFailedLogin(testIP, testEmail);
    const attempts = await securityMonitor.getFailedAttempts(testIP, testEmail);
    
    addResult(
      'Track failed login attempt',
      attempts === 1,
      attempts === 1 ? 'Failed attempt tracked' : `Expected 1, got ${attempts}`,
      true
    );

    // Test 1.2: Multiple failed attempts
    for (let i = 0; i < 4; i++) {
      await securityMonitor.trackFailedLogin(testIP, testEmail);
    }
    
    const attemptsAfter = await securityMonitor.getFailedAttempts(testIP, testEmail);
    addResult(
      'Multiple failed attempts tracked',
      attemptsAfter === 5,
      `Tracked ${attemptsAfter} attempts`,
      true
    );

    // Test 1.3: IP should be blocked after 5 attempts
    const isBlocked = await securityMonitor.isBlocked(testIP);
    addResult(
      'IP blocked after 5 failed attempts',
      isBlocked === true,
      isBlocked ? 'IP blocked correctly' : 'IP not blocked (BAD)',
      true
    );

    // Test 1.4: Get block info
    const blockInfo = await securityMonitor.getBlockInfo(testIP);
    addResult(
      'Block info retrieved',
      blockInfo.blocked === true && blockInfo.email === testEmail,
      blockInfo.blocked ? `Blocked for ${blockInfo.expiresIn}s` : 'Not blocked',
      true
    );

    // Test 1.5: Successful login clears attempts
    const testIP2 = '192.168.1.101';
    const testEmail2 = 'test2@example.com';
    
    await securityMonitor.trackFailedLogin(testIP2, testEmail2);
    await securityMonitor.trackSuccessfulLogin(testIP2, testEmail2);
    const clearedAttempts = await securityMonitor.getFailedAttempts(testIP2, testEmail2);
    
    addResult(
      'Successful login clears failed attempts',
      clearedAttempts === 0,
      clearedAttempts === 0 ? 'Attempts cleared' : `Still has ${clearedAttempts} attempts`,
      true
    );

    // Cleanup
    await securityMonitor.unblockIP(testIP);
  } catch (error: any) {
    addResult('Security monitor tests', false, `Error: ${error.message}`, true);
  }
}

async function testPasswordPolicy() {
  console.log('\n📋 TEST 2: Password Policy Enforcement');
  console.log('='.repeat(60));

  try {
    // Test 2.1: Weak password rejected
    const weakPassword = 'abc123';
    const weakValidation = validatePassword(weakPassword);
    
    addResult(
      'Weak password rejected',
      !weakValidation.valid,
      weakValidation.valid ? 'Weak password accepted (BAD)' : `Rejected: ${weakValidation.errors.length} errors`,
      true
    );

    // Test 2.2: Strong password accepted
    const strongPassword = 'MyP@ssw0rd123!';
    const strongValidation = validatePassword(strongPassword);
    
    addResult(
      'Strong password accepted',
      strongValidation.valid,
      strongValidation.valid ? `Strength: ${strongValidation.strength} (${strongValidation.score}/100)` : `Rejected: ${strongValidation.errors.join(', ')}`,
      true
    );

    // Test 2.3: Common password rejected
    const commonPassword = 'password123';
    const commonValidation = validatePassword(commonPassword);
    
    addResult(
      'Common password rejected',
      !commonValidation.valid,
      !commonValidation.valid ? 'Common password rejected' : 'Common password accepted (BAD)',
      true
    );

    // Test 2.4: Sequential pattern rejected
    const sequentialPassword = 'Abc123456!';
    const sequentialValidation = validatePassword(sequentialPassword);
    
    addResult(
      'Sequential pattern detected',
      !sequentialValidation.valid || sequentialValidation.score < 80,
      `Score: ${sequentialValidation.score}/100`,
      false
    );

    // Test 2.5: Password history
    const userId = 'test-user-password';
    const password1 = 'MyP@ssw0rd123!';
    
    await addToPasswordHistory(userId, password1);
    const isReused = await checkPasswordHistory(userId, password1);
    
    addResult(
      'Password history tracking',
      isReused === true,
      isReused ? 'Password found in history' : 'Password not in history (BAD)',
      true
    );

    // Test 2.6: Password reuse prevention
    const password2 = 'NewP@ssw0rd456!';
    const changeValidation = await validatePasswordChange(userId, password1);
    
    addResult(
      'Password reuse prevented',
      changeValidation.reused === true && !changeValidation.valid,
      changeValidation.reused ? 'Reused password rejected' : 'Reused password allowed (BAD)',
      true
    );

    // Test 2.7: New password allowed
    const newPasswordValidation = await validatePasswordChange(userId, password2);
    
    addResult(
      'New password allowed',
      !newPasswordValidation.reused && newPasswordValidation.valid,
      newPasswordValidation.valid ? 'New password accepted' : `Rejected: ${newPasswordValidation.errors.join(', ')}`,
      true
    );
  } catch (error: any) {
    addResult('Password policy tests', false, `Error: ${error.message}`, true);
  }
}

async function testAuditLogging() {
  console.log('\n📋 TEST 3: Security Audit Logging');
  console.log('='.repeat(60));

  try {
    // Test 3.1: Log authentication event
    await auditLogger.logAuth(
      'auth.login.success',
      'test-user-123',
      'test@example.com',
      '192.168.1.1',
      true,
      { browser: 'Chrome' }
    );
    
    addResult(
      'Authentication event logged',
      true,
      'Auth event logged successfully',
      false
    );

    // Test 3.2: Log access control event
    await auditLogger.logAccess(
      'test-user-123',
      'test@example.com',
      '192.168.1.1',
      'conversation',
      'conv-123',
      'read',
      true
    );
    
    addResult(
      'Access control event logged',
      true,
      'Access event logged successfully',
      false
    );

    // Test 3.3: Log security event
    await auditLogger.logSecurity(
      'security.ip.blocked',
      '192.168.1.100',
      'too_many_failed_attempts',
      { attempts: 5 }
    );
    
    addResult(
      'Security event logged',
      true,
      'Security event logged successfully',
      false
    );

    // Test 3.4: Log data operation
    await auditLogger.logDataOperation(
      'test-user-123',
      'test@example.com',
      '192.168.1.1',
      'create',
      'message',
      'msg-123',
      { content: 'Test message' }
    );
    
    addResult(
      'Data operation logged',
      true,
      'Data operation logged successfully',
      false
    );

    // Test 3.5: Get audit statistics
    const stats = await auditLogger.getStats(24 * 60 * 60 * 1000);
    
    addResult(
      'Audit statistics retrieved',
      typeof stats.totalEvents === 'number',
      `Total events: ${stats.totalEvents}`,
      false
    );
  } catch (error: any) {
    addResult('Audit logging tests', false, `Error: ${error.message}`, true);
  }
}

async function testPasswordStrength() {
  console.log('\n📋 TEST 4: Password Strength Scoring');
  console.log('='.repeat(60));

  const testCases = [
    { password: 'abc', expectedStrength: 'weak', shouldPass: false },
    { password: 'password', expectedStrength: 'weak', shouldPass: false },
    { password: 'Password1', expectedStrength: 'medium', shouldPass: false },
    { password: 'P@ssw0rd', expectedStrength: 'medium', shouldPass: true },
    { password: 'MyP@ssw0rd123', expectedStrength: 'strong', shouldPass: true },
    { password: 'C0mpl3x!P@ssw0rd#2024', expectedStrength: 'very-strong', shouldPass: true },
  ];

  for (const testCase of testCases) {
    const validation = validatePassword(testCase.password);
    const passed = validation.valid === testCase.shouldPass;
    
    addResult(
      `Password "${testCase.password.substring(0, 10)}..." strength`,
      passed,
      `Strength: ${validation.strength}, Score: ${validation.score}/100, Valid: ${validation.valid}`,
      false
    );
  }
}

async function testRedisIntegration() {
  console.log('\n📋 TEST 5: Redis Integration');
  console.log('='.repeat(60));

  try {
    // Test 5.1: Redis connection
    const testKey = 'test:phase3:connection';
    await redis.set(testKey, 'connected', { ex: 10 });
    const value = await redis.get(testKey);
    
    addResult(
      'Redis connection',
      value === 'connected',
      value === 'connected' ? 'Redis connected' : 'Redis connection failed',
      true
    );

    // Test 5.2: Redis TTL
    const ttl = await redis.ttl(testKey);
    addResult(
      'Redis TTL set correctly',
      ttl > 0 && ttl <= 10,
      `TTL: ${ttl} seconds`,
      false
    );

    // Cleanup
    await redis.del(testKey);
  } catch (error: any) {
    addResult('Redis integration', false, `Error: ${error.message}`, true);
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 PHASE 3 VALIDATION - SECURITY HARDENING');
  console.log('='.repeat(60));

  try {
    await testRedisIntegration();
    await testSecurityMonitor();
    await testPasswordPolicy();
    await testPasswordStrength();
    await testAuditLogging();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));

    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const criticalFailed = results.filter(r => !r.passed && r.critical).length;

    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`🔥 Critical Failed: ${criticalFailed}`);
    console.log('');

    if (criticalFailed > 0) {
      console.log('❌ PHASE 3 VALIDATION: FAILED');
      console.log('Critical issues found. DO NOT PROCEED to Phase 4.');
      console.log('');
      console.log('Failed Tests:');
      results
        .filter(r => !r.passed && r.critical)
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.details}`);
        });
    } else if (failed > 0) {
      console.log('⚠️  PHASE 3 VALIDATION: PASSED WITH WARNINGS');
      console.log('Non-critical issues found. Review before proceeding.');
      console.log('');
      console.log('Failed Tests:');
      results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.details}`);
        });
    } else {
      console.log('✅ PHASE 3 VALIDATION: PASSED');
      console.log('All tests passed. Ready to proceed to Phase 4.');
    }

    console.log('='.repeat(60));

    // Exit with appropriate code
    process.exit(criticalFailed > 0 ? 1 : 0);
  } catch (error: any) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runAllTests();

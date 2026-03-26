/**
 * Quick Verification Script
 * Checks if all critical fixes are in place
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function checkFile(filePath: string, searchStrings: string[]): boolean {
  try {
    const fullPath = path.join(__dirname, '..', filePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    const allFound = searchStrings.every(str => content.includes(str));
    
    if (allFound) {
      log(`✅ ${filePath}`, colors.green);
      return true;
    } else {
      log(`❌ ${filePath} - Missing expected code`, colors.red);
      searchStrings.forEach(str => {
        if (!content.includes(str)) {
          log(`   Missing: ${str.substring(0, 50)}...`, colors.yellow);
        }
      });
      return false;
    }
  } catch (error: any) {
    log(`❌ ${filePath} - File not found or error: ${error.message}`, colors.red);
    return false;
  }
}

async function verify() {
  log('\n' + '='.repeat(60), colors.blue);
  log('QUICK VERIFICATION - CRITICAL FIXES', colors.blue);
  log('='.repeat(60) + '\n', colors.blue);

  const checks = {
    rateLimiting: false,
    idempotency: false,
    sequenceGeneration: false,
    redisttl: false,
  };

  // Check 1: Rate Limiting
  log('Checking FIX #1: Rate Limiting...', colors.blue);
  checks.rateLimiting = checkFile('middleware/socketRateLimit.ts', [
    'const RATE_LIMITS',
    'await redis.incr(key)',
    'await redis.ttl(key)',
    'if (count > limit.max)',
  ]);

  // Check 2: Idempotency
  log('\nChecking FIX #2: Idempotency...', colors.blue);
  checks.idempotency = checkFile('utils/idempotency.ts', [
    'export async function checkIdempotency',
    'export async function clearIdempotency',
    'redis.set(key, \'1\', { ex: ttl, nx: true })',
  ]) && checkFile('socket/chatEvents.ts', [
    'checkIdempotency',
    'clearIdempotency',
    'if (!isUnique)',
    'duplicate: true',
  ]);

  // Check 3: Sequence Generation
  log('\nChecking FIX #3: Sequence Generation...', colors.blue);
  checks.sequenceGeneration = checkFile('socket/chatEvents.ts', [
    'seq = await redis.incr(seqKey)',
    'if (!seq || seq < 1)',
    'SEQUENCE_UNAVAILABLE',
    'retryable: true',
  ]);

  // Check 4: Redis TTL method
  log('\nChecking Redis TTL method...', colors.blue);
  checks.redisttl = checkFile('config/redis.ts', [
    'async ttl(key: string)',
    'await this.client.ttl(key)',
  ]);

  // Summary
  log('\n' + '='.repeat(60), colors.blue);
  log('VERIFICATION SUMMARY', colors.blue);
  log('='.repeat(60) + '\n', colors.blue);

  const passed = Object.values(checks).filter(c => c).length;
  const total = Object.keys(checks).length;

  Object.entries(checks).forEach(([check, result]) => {
    const icon = result ? '✅' : '❌';
    const color = result ? colors.green : colors.red;
    log(`${icon} ${check}`, color);
  });

  log(`\nResult: ${passed}/${total} checks passed`, passed === total ? colors.green : colors.red);

  if (passed === total) {
    log('\n🎉 All critical fixes are in place!', colors.green);
    log('You can now run the test suite:', colors.green);
    log('  npm run test:fixes', colors.blue);
    process.exit(0);
  } else {
    log('\n⚠️  Some fixes are missing or incomplete', colors.red);
    log('Please review the failed checks above', colors.yellow);
    process.exit(1);
  }
}

verify().catch(error => {
  console.error('Verification error:', error);
  process.exit(1);
});

/**
 * Quick DLQ Code Verification
 * Checks if DLQ code is properly implemented without running the server
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
          log(`   Missing: ${str.substring(0, 60)}...`, colors.yellow);
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
  log('DLQ CODE VERIFICATION', colors.blue);
  log('='.repeat(60) + '\n', colors.blue);

  const checks = {
    bullmqConfig: false,
    messageWorker: false,
    monitoringRoutes: false,
  };

  // Check 1: BullMQ Config has DLQ
  log('Checking BullMQ Configuration...', colors.blue);
  checks.bullmqConfig = checkFile('config/bullmq.ts', [
    'deadLetterQueue',
    'messages-dlq',
    'getDeadLetterQueue',
    'attempts: 1',
    'age: 7 * 24 * 3600',
  ]);

  // Check 2: Message Worker sends to DLQ
  log('\nChecking Message Worker...', colors.blue);
  checks.messageWorker = checkFile('queues/messageWorker.ts', [
    'job.attemptsMade >= 3',
    'getDeadLetterQueue',
    'failed-message',
    'Message moved to DLQ',
  ]);

  // Check 3: Monitoring Routes have DLQ endpoints
  log('\nChecking Monitoring Routes...', colors.blue);
  checks.monitoringRoutes = checkFile('routes/monitoring.routes.ts', [
    '/dlq/stats',
    '/dlq/jobs',
    '/dlq/retry',
    '/dlq/clear-completed',
    'getDeadLetterQueue',
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
    log('\n🎉 All DLQ code is in place!', colors.green);
    log('\nNext steps:', colors.blue);
    log('1. Start the server: npm run dev', colors.reset);
    log('2. Check server logs for "messages-dlq" in initialized queues', colors.reset);
    log('3. Follow TEST_DLQ_SIMPLE.md for manual testing', colors.reset);
    process.exit(0);
  } else {
    log('\n⚠️  Some DLQ code is missing', colors.red);
    log('Please review the failed checks above', colors.yellow);
    process.exit(1);
  }
}

verify().catch(error => {
  console.error('Verification error:', error);
  process.exit(1);
});

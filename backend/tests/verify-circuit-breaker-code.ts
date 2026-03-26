/**
 * Circuit Breaker Code Verification
 * Checks if circuit breaker code is properly implemented
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
  log('CIRCUIT BREAKER CODE VERIFICATION', colors.blue);
  log('='.repeat(60) + '\n', colors.blue);

  const checks = {
    circuitBreakerUtil: false,
    clerkIntegration: false,
    firebaseIntegration: false,
    geminiIntegration: false,
    monitoringEndpoints: false,
  };

  // Check 1: Circuit Breaker Utility
  log('Checking Circuit Breaker Utility...', colors.blue);
  checks.circuitBreakerUtil = checkFile('utils/circuitBreaker.ts', [
    'export class CircuitBreaker',
    'CLOSED',
    'OPEN',
    'HALF_OPEN',
    'clerkCircuitBreaker',
    'firebaseCircuitBreaker',
    'geminiCircuitBreaker',
  ]);

  // Check 2: Clerk Integration
  log('\nChecking Clerk Integration...', colors.blue);
  checks.clerkIntegration = checkFile('socket/socket.ts', [
    'clerkCircuitBreaker',
    'clerkCircuitBreaker.execute',
    'Circuit breaker',
    'Authentication service temporarily unavailable',
  ]);

  // Check 3: Firebase Integration
  log('\nChecking Firebase Integration...', colors.blue);
  checks.firebaseIntegration = checkFile('controller/phone.controller.ts', [
    'firebaseCircuitBreaker',
    'firebaseCircuitBreaker.execute',
    'Circuit breaker',
    'Phone verification service temporarily unavailable',
  ]);

  // Check 4: Gemini Integration
  log('\nChecking Gemini Integration...', colors.blue);
  checks.geminiIntegration = checkFile('socket/aiService.ts', [
    'geminiCircuitBreaker',
    'geminiCircuitBreaker.execute',
    'Circuit breaker',
    "I'm temporarily unavailable",
  ]);

  // Check 5: Monitoring Endpoints
  log('\nChecking Monitoring Endpoints...', colors.blue);
  checks.monitoringEndpoints = checkFile('routes/monitoring.routes.ts', [
    '/circuit-breakers',
    '/circuit-breakers/:name/reset',
    '/circuit-breakers/reset-all',
    'clerkCircuitBreaker',
    'firebaseCircuitBreaker',
    'geminiCircuitBreaker',
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
    log('\n🎉 All circuit breaker code is in place!', colors.green);
    log('\nNext steps:', colors.blue);
    log('1. Start the server: npm run dev', colors.reset);
    log('2. Check server logs for circuit breaker initialization', colors.reset);
    log('3. Test circuit breakers with monitoring endpoints', colors.reset);
    process.exit(0);
  } else {
    log('\n⚠️  Some circuit breaker code is missing', colors.red);
    log('Please review the failed checks above', colors.yellow);
    process.exit(1);
  }
}

verify().catch(error => {
  console.error('Verification error:', error);
  process.exit(1);
});

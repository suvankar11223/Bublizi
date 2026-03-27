/**
 * Phase 3 Test Runner
 * Run with: node test-phase3.js
 */

console.log('🧪 Phase 3 React Integration Test Runner');
console.log('='.repeat(50));

const fs = require('fs');
const path = require('path');

const files = [
  'src/hooks/useOfflineFirst.js',
  'src/OfflineFirstProvider.jsx',
  'src/components/SyncStatusBar.jsx',
];

console.log('\n📁 Checking file structure...');
let allFilesExist = true;

files.forEach((file) => {
  const filePath = path.join(__dirname, file);
  const exists = fs.existsSync(filePath);
  const size = exists ? fs.statSync(filePath).size : 0;
  
  if (exists && size > 0) {
    console.log(`   ✅ ${file} (${size} bytes)`);
  } else if (exists && size === 0) {
    console.log(`   ⚠️  ${file} (EMPTY FILE)`);
    allFilesExist = false;
  } else {
    console.log(`   ❌ ${file} (NOT FOUND)`);
    allFilesExist = false;
  }
});

console.log('\n📦 Checking Phase 2 dependencies...');
const phase2Files = [
  'src/sync/NetworkMonitor.js',
  'src/sync/SyncQueue.js',
  'src/sync/SyncEngine.js',
  'src/sync/MessageActions.js',
];

phase2Files.forEach((file) => {
  const filePath = path.join(__dirname, file);
  const exists = fs.existsSync(filePath);
  const size = exists ? fs.statSync(filePath).size : 0;
  
  if (exists && size > 0) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} (MISSING - Phase 2 incomplete)`);
    allFilesExist = false;
  }
});

console.log('\n📦 Checking Phase 1 dependencies...');
const phase1Files = [
  'src/db/schema.js',
  'src/db/models.js',
  'src/db/index.js',
];

phase1Files.forEach((file) => {
  const filePath = path.join(__dirname, file);
  const exists = fs.existsSync(filePath);
  const size = exists ? fs.statSync(filePath).size : 0;
  
  if (exists && size > 0) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} (MISSING - Phase 1 incomplete)`);
    allFilesExist = false;
  }
});

console.log('\n' + '='.repeat(50));
if (allFilesExist) {
  console.log('✅ PHASE 3 STRUCTURE: VALID');
  console.log('\n📱 Next step: Integrate into your React Native app');
  console.log('\n1. Wrap your app with OfflineFirstProvider:');
  console.log('   import { OfflineFirstProvider } from "./src/OfflineFirstProvider";');
  console.log('   <OfflineFirstProvider><App /></OfflineFirstProvider>');
  console.log('\n2. Use hooks in your components:');
  console.log('   import { useConversations, useMessages } from "./src/hooks/useOfflineFirst";');
  console.log('\n3. Add SyncStatusBar to your UI:');
  console.log('   import SyncStatusBar from "./src/components/SyncStatusBar";');
} else {
  console.log('❌ PHASE 3 STRUCTURE: INVALID');
  console.log('   Fix the issues above before proceeding');
}

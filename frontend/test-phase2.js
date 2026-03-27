/**
 * Phase 2 Test Runner
 * Run with: node test-phase2.js
 */

console.log('🧪 Phase 2 Sync Infrastructure Test Runner');
console.log('='.repeat(50));

const fs = require('fs');
const path = require('path');

const files = [
  'src/sync/NetworkMonitor.js',
  'src/sync/SyncQueue.js',
  'src/sync/SyncEngine.js',
  'src/sync/MessageActions.js',
  'src/sync/index.js',
  'src/sync/__tests__/SyncEngine.test.js',
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
  console.log('✅ PHASE 2 STRUCTURE: VALID');
  console.log('\n📱 Next step: Run the app and test sync infrastructure');
  console.log('   Command: npm start');
  console.log('\n   Then in your app, import and run:');
  console.log('   import testSyncInfrastructure from "./src/sync/__tests__/SyncEngine.test";');
  console.log('   testSyncInfrastructure();');
} else {
  console.log('❌ PHASE 2 STRUCTURE: INVALID');
  console.log('   Fix the issues above before proceeding');
}

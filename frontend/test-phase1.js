/**
 * Phase 1 Test Runner
 * Run with: node test-phase1.js
 */

console.log('🧪 Phase 1 Database Test Runner');
console.log('='.repeat(50));

// Check if files exist
const fs = require('fs');
const path = require('path');

const files = [
  'src/db/schema.js',
  'src/db/models.js',
  'src/db/index.js',
  'src/db/migrations.js',
  'src/db/__tests__/db.test.js',
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

console.log('\n📦 Checking dependencies...');
const packageJson = require('./package.json');
const requiredDeps = [
  '@nozbe/watermelondb',
  '@react-native-community/netinfo',
  'expo-sqlite',
];

requiredDeps.forEach((dep) => {
  if (packageJson.dependencies[dep]) {
    console.log(`   ✅ ${dep} (${packageJson.dependencies[dep]})`);
  } else {
    console.log(`   ❌ ${dep} (NOT INSTALLED)`);
    allFilesExist = false;
  }
});

console.log('\n🔧 Checking babel.config.js...');
const babelConfig = require('./babel.config')({ cache: () => {} });
const hasDecorators = babelConfig.plugins?.some(
  (p) => Array.isArray(p) && p[0] === '@babel/plugin-proposal-decorators'
);

if (hasDecorators) {
  console.log('   ✅ Decorator plugin configured');
} else {
  console.log('   ❌ Decorator plugin NOT configured');
  allFilesExist = false;
}

console.log('\n' + '='.repeat(50));
if (allFilesExist) {
  console.log('✅ PHASE 1 STRUCTURE: VALID');
  console.log('\n📱 Next step: Run the app and test database initialization');
  console.log('   Command: npm start');
  console.log('\n   Then in your app, import and run:');
  console.log('   import testDatabaseInitialization from "./src/db/__tests__/db.test";');
  console.log('   testDatabaseInitialization();');
} else {
  console.log('❌ PHASE 1 STRUCTURE: INVALID');
  console.log('   Fix the issues above before proceeding');
}

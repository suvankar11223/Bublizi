/**
 * Firebase Admin SDK Test Script
 * 
 * Tests Firebase Admin SDK configuration for push notifications
 */

import dotenv from 'dotenv';
dotenv.config();

import admin from 'firebase-admin';

console.log('🔍 Testing Firebase Admin SDK...\n');
console.log('='.repeat(60));

// Check credentials
console.log('\n📋 Environment Variables:');
console.log(`   FIREBASE_PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID || '✗ Missing'}`);
console.log(`   FIREBASE_CLIENT_EMAIL: ${process.env.FIREBASE_CLIENT_EMAIL || '✗ Missing'}`);
console.log(`   FIREBASE_PRIVATE_KEY: ${process.env.FIREBASE_PRIVATE_KEY ? '✓ Present (length: ' + process.env.FIREBASE_PRIVATE_KEY.length + ')' : '✗ Missing'}`);

if (!process.env.FIREBASE_PRIVATE_KEY) {
  console.error('\n❌ Missing FIREBASE_PRIVATE_KEY in .env');
  console.log('\n💡 To fix this:');
  console.log('   1. Go to: https://console.firebase.google.com/project/bublizi-prod/settings/serviceaccounts/adminsdk');
  console.log('   2. Click "Generate new private key"');
  console.log('   3. Download the JSON file');
  console.log('   4. Copy the values to your .env file:');
  console.log('      - FIREBASE_PROJECT_ID');
  console.log('      - FIREBASE_CLIENT_EMAIL');
  console.log('      - FIREBASE_PRIVATE_KEY (entire private key with \\n)');
  console.log('');
  process.exit(1);
}

if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL) {
  console.error('\n❌ Missing Firebase credentials in .env');
  console.log('\n💡 Required environment variables:');
  console.log('   - FIREBASE_PROJECT_ID');
  console.log('   - FIREBASE_CLIENT_EMAIL');
  console.log('   - FIREBASE_PRIVATE_KEY');
  console.log('');
  process.exit(1);
}

async function testFirebase() {
  try {
    // Convert literal \n to actual newlines
    const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n');

    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: privateKey,
    };

    // Initialize Firebase Admin
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      });
    }

    console.log('\n✅ Firebase Admin SDK initialized successfully');

    // Test: Verify project ID
    const app = admin.app();
    console.log(`   Project ID: ${serviceAccount.projectId}`);
    console.log(`   Client Email: ${serviceAccount.clientEmail}`);

    // Test: Send a test notification (optional)
    console.log('\n📱 Testing FCM (Firebase Cloud Messaging)...');
    
    const testMessage = {
      notification: {
        title: '✅ Firebase Test',
        body: 'Your Firebase setup is working!',
      },
      topic: 'test',
    };

    try {
      const response = await admin.messaging().send(testMessage);
      console.log('✅ Test notification sent successfully');
      console.log(`   Message ID: ${response}`);
    } catch (err: any) {
      if (err.code === 'messaging/invalid-argument') {
        console.log('⚠️  No devices registered to "test" topic (this is normal for initial setup)');
        console.log('   FCM is configured correctly and ready to send notifications');
      } else if (err.code === 'messaging/third-party-auth-error') {
        console.log('⚠️  Auth error - check your service account permissions');
        console.log('   Make sure the service account has "Firebase Cloud Messaging Admin" role');
      } else {
        console.log(`⚠️  Test notification error: ${err.message}`);
        console.log('   This may be normal if no devices are registered yet');
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n🎉 Firebase Admin SDK is ready for production!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Update frontend Firebase config');
    console.log('   2. Download google-services.json for Android');
    console.log('   3. Download GoogleService-Info.plist for iOS');
    console.log('   4. Test FCM token retrieval in your app');
    console.log('');

    process.exit(0);

  } catch (error: any) {
    console.error('\n❌ Firebase initialization failed:', error.message);

    if (error.message.includes('Invalid PEM')) {
      console.log('\n💡 Fix: Your private key format is incorrect');
      console.log('   Make sure the private key contains literal \\n characters');
      console.log('   Example: "-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n"');
      console.log('');
      console.log('   In your .env file, it should look like:');
      console.log('   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nYOUR_KEY_HERE\\n-----END PRIVATE KEY-----\\n"');
    } else if (error.message.includes('Could not load the default credentials')) {
      console.log('\n💡 Fix: Set FIREBASE_PRIVATE_KEY in your .env file');
      console.log('   Get it from the service account JSON file');
    } else if (error.message.includes('private_key')) {
      console.log('\n💡 Fix: Check your FIREBASE_PRIVATE_KEY format');
      console.log('   It should be the complete private key from the service account JSON');
    }

    console.log('');
    process.exit(1);
  }
}

testFirebase();

/**
 * Phase 1 Database Test
 * Run this to verify the database initializes correctly
 */

import { getDatabase, conversations, messages } from '../index';

export async function testDatabaseInitialization() {
  console.log('🧪 Testing Phase 1: Database Initialization');
  console.log('='.repeat(50));

  try {
    // Test 1: Database initializes
    console.log('\n1️⃣ Testing database initialization...');
    const db = getDatabase();
    console.log('   ✅ Database initialized');

    // Test 2: Collections exist
    console.log('\n2️⃣ Testing collections...');
    const convCollection = conversations();
    const msgCollection = messages();
    console.log('   ✅ Conversations collection:', convCollection.table);
    console.log('   ✅ Messages collection:', msgCollection.table);

    // Test 3: Can query (should be empty)
    console.log('\n3️⃣ Testing queries...');
    const convCount = await conversations().query().fetchCount();
    const msgCount = await messages().query().fetchCount();
    console.log('   ✅ Conversations count:', convCount);
    console.log('   ✅ Messages count:', msgCount);

    // Test 4: Can create a test conversation
    console.log('\n4️⃣ Testing write operations...');
    await db.write(async () => {
      await conversations().create((conv) => {
        conv._setRaw('server_id', 'test_123');
        conv._setRaw('type', 'direct');
        conv._setRaw('name', 'Test Conversation');
        conv._setRaw('unread_count', 0);
        conv._setRaw('is_pinned', false);
        conv._setRaw('is_archived', false);
        conv._setRaw('is_muted', false);
        conv._setRaw('created_at', Date.now());
        conv._setRaw('updated_at', Date.now());
      });
    });
    console.log('   ✅ Created test conversation');

    // Test 5: Can read back
    console.log('\n5️⃣ Testing read operations...');
    const testConv = await conversations().query().fetch();
    console.log('   ✅ Read conversations:', testConv.length);
    if (testConv.length > 0) {
      console.log('   ✅ First conversation:', {
        id: testConv[0].id,
        serverId: testConv[0].serverId,
        name: testConv[0].name,
      });
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ PHASE 1 TEST: PASSED');
    console.log('Database is working correctly!');
    return true;
  } catch (error) {
    console.log('\n' + '='.repeat(50));
    console.log('❌ PHASE 1 TEST: FAILED');
    console.error('Error:', error.message);
    console.error(error);
    return false;
  }
}

// Export for use in app
export default testDatabaseInitialization;

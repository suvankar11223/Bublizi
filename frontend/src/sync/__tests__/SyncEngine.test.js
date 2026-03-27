/**
 * Phase 2 Sync Engine Test
 */

import SyncEngine from '../SyncEngine';
import SyncQueue, { SYNC_OPERATIONS, SYNC_PRIORITY } from '../SyncQueue';
import NetworkMonitor from '../NetworkMonitor';

export async function testSyncInfrastructure() {
  console.log('🧪 Testing Phase 2: Sync Infrastructure');
  console.log('='.repeat(50));

  try {
    // Test 1: Network Monitor
    console.log('\n1️⃣ Testing NetworkMonitor...');
    NetworkMonitor.start();
    const isOnline = NetworkMonitor.getStatus();
    console.log(`   ✅ Network status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    NetworkMonitor.stop();

    // Test 2: Sync Queue - Enqueue
    console.log('\n2️⃣ Testing SyncQueue enqueue...');
    await SyncQueue.enqueue(
      SYNC_OPERATIONS.CREATE_MESSAGE,
      { content: 'Test message', conversationId: 'test_123' },
      SYNC_PRIORITY.HIGH
    );
    console.log('   ✅ Item enqueued');

    // Test 3: Sync Queue - Get Pending
    console.log('\n3️⃣ Testing SyncQueue getPending...');
    const pending = await SyncQueue.getPending();
    console.log(`   ✅ Pending items: ${pending.length}`);

    // Test 4: Sync Queue - Stats
    console.log('\n4️⃣ Testing SyncQueue stats...');
    const stats = await SyncQueue.getStats();
    console.log(`   ✅ Stats:`, stats);

    // Test 5: Sync Engine Status
    console.log('\n5️⃣ Testing SyncEngine status...');
    const status = SyncEngine.getStatus();
    console.log(`   ✅ Engine status:`, status);

    console.log('\n' + '='.repeat(50));
    console.log('✅ PHASE 2 TEST: PASSED');
    console.log('Sync infrastructure is working!');
    return true;
  } catch (error) {
    console.log('\n' + '='.repeat(50));
    console.log('❌ PHASE 2 TEST: FAILED');
    console.error('Error:', error.message);
    console.error(error);
    return false;
  }
}

export default testSyncInfrastructure;

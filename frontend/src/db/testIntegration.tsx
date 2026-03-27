/**
 * Database Integration Test Component
 * Add this to your app to test Phase 1 database functionality
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { getDatabase, conversations, messages } from './index';

export default function DatabaseTestScreen() {
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addLog = (message: string) => {
    setTestResults((prev) => [...prev, message]);
    console.log(message);
  };

  const runTests = async () => {
    setIsRunning(true);
    setTestResults([]);
    addLog('🧪 Starting Phase 1 Database Tests...');
    addLog('='.repeat(40));

    try {
      // Test 1: Database initialization
      addLog('\n1️⃣ Testing database initialization...');
      const db = getDatabase();
      addLog('   ✅ Database initialized');

      // Test 2: Collections exist
      addLog('\n2️⃣ Testing collections...');
      const convCollection = conversations();
      const msgCollection = messages();
      addLog(`   ✅ Conversations: ${convCollection.table}`);
      addLog(`   ✅ Messages: ${msgCollection.table}`);

      // Test 3: Query empty database
      addLog('\n3️⃣ Testing queries...');
      const convCount = await conversations().query().fetchCount();
      const msgCount = await messages().query().fetchCount();
      addLog(`   ✅ Conversations count: ${convCount}`);
      addLog(`   ✅ Messages count: ${msgCount}`);

      // Test 4: Create test conversation
      addLog('\n4️⃣ Testing write operations...');
      await db.write(async () => {
        await conversations().create((conv) => {
          conv._setRaw('server_id', `test_${Date.now()}`);
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
      addLog('   ✅ Created test conversation');

      // Test 5: Read back
      addLog('\n5️⃣ Testing read operations...');
      const allConvs = await conversations().query().fetch();
      addLog(`   ✅ Total conversations: ${allConvs.length}`);
      if (allConvs.length > 0) {
        const latest = allConvs[allConvs.length - 1];
        addLog(`   ✅ Latest: ${latest.name} (${latest.serverId})`);
      }

      // Test 6: Create test message
      addLog('\n6️⃣ Testing message creation...');
      if (allConvs.length > 0) {
        await db.write(async () => {
          await messages().create((msg) => {
            msg._setRaw('conversation_id', allConvs[0].id);
            msg._setRaw('sender_id', 'test_user');
            msg._setRaw('sender_name', 'Test User');
            msg._setRaw('content', 'Hello from Phase 1 test!');
            msg._setRaw('type', 'text');
            msg._setRaw('status', 'sent');
            msg._setRaw('is_outgoing', true);
            msg._setRaw('is_deleted', false);
            msg._setRaw('is_edited', false);
            msg._setRaw('retry_count', 0);
            msg._setRaw('sent_at', Date.now());
            msg._setRaw('created_at', Date.now());
            msg._setRaw('updated_at', Date.now());
          });
        });
        addLog('   ✅ Created test message');
      }

      // Test 7: Query messages
      addLog('\n7️⃣ Testing message queries...');
      const allMsgs = await messages().query().fetch();
      addLog(`   ✅ Total messages: ${allMsgs.length}`);

      addLog('\n' + '='.repeat(40));
      addLog('✅ ALL TESTS PASSED!');
      addLog('Phase 1 database is working correctly.');
    } catch (error: any) {
      addLog('\n' + '='.repeat(40));
      addLog('❌ TEST FAILED!');
      addLog(`Error: ${error.message}`);
      console.error(error);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Phase 1 Database Test</Text>
      
      <TouchableOpacity
        style={[styles.button, isRunning && styles.buttonDisabled]}
        onPress={runTests}
        disabled={isRunning}
      >
        <Text style={styles.buttonText}>
          {isRunning ? 'Running Tests...' : 'Run Tests'}
        </Text>
      </TouchableOpacity>

      <ScrollView style={styles.logContainer}>
        {testResults.map((log, index) => (
          <Text key={index} style={styles.logText}>
            {log}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 8,
  },
  logText: {
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 2,
  },
});

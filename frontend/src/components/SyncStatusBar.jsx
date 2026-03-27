/**
 * Sync Status Bar Component
 * Phase 3: React Integration
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSyncStatus, usePendingMessages } from '../hooks/useOfflineFirst';

export default function SyncStatusBar() {
  const { isOnline, isSyncing } = useSyncStatus();
  const pendingCount = usePendingMessages();

  if (isOnline && !isSyncing && pendingCount === 0) {
    return null; // Hide when everything is good
  }

  let message = '';
  let backgroundColor = '#4CAF50';

  if (!isOnline) {
    message = 'Offline';
    backgroundColor = '#FF9800';
  } else if (isSyncing) {
    message = 'Syncing...';
    backgroundColor = '#2196F3';
  } else if (pendingCount > 0) {
    message = `${pendingCount} message${pendingCount > 1 ? 's' : ''} pending`;
    backgroundColor = '#FF9800';
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});

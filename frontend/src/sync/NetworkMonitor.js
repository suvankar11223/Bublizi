/**
 * NetworkMonitor - Tracks online/offline status
 * Phase 2: Sync Infrastructure
 */

import NetInfo from '@react-native-community/netinfo';
import { EventEmitter } from 'events';

class NetworkMonitor extends EventEmitter {
  constructor() {
    super();
    this.isOnline = true;
    this.unsubscribe = null;
  }

  start() {
    // Subscribe to network state changes
    this.unsubscribe = NetInfo.addEventListener((state) => {
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected && state.isInternetReachable !== false;

      if (wasOnline !== this.isOnline) {
        console.log(`[NetworkMonitor] Status changed: ${this.isOnline ? 'ONLINE' : 'OFFLINE'}`);
        this.emit('change', this.isOnline);

        if (this.isOnline) {
          this.emit('online');
        } else {
          this.emit('offline');
        }
      }
    });

    // Get initial state
    NetInfo.fetch().then((state) => {
      this.isOnline = state.isConnected && state.isInternetReachable !== false;
      console.log(`[NetworkMonitor] Initial status: ${this.isOnline ? 'ONLINE' : 'OFFLINE'}`);
    });
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  getStatus() {
    return this.isOnline;
  }
}

// Singleton instance
export default new NetworkMonitor();

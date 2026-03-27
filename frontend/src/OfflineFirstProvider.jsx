/**
 * Offline-First Provider
 * Phase 3: React Integration
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { getDatabase } from './db';
import SyncEngine from './sync/SyncEngine';

const OfflineFirstContext = createContext({
  isReady: false,
  error: null,
});

export function useOfflineFirst() {
  return useContext(OfflineFirstContext);
}

export function OfflineFirstProvider({ children }) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const [database, setDatabase] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        console.log('[OfflineFirst] Initializing...');

        // Initialize database
        const db = getDatabase();
        if (mounted) {
          setDatabase(db);
        }

        // Start sync engine
        SyncEngine.start();

        if (mounted) {
          setIsReady(true);
          console.log('[OfflineFirst] Ready!');
        }
      } catch (err) {
        console.error('[OfflineFirst] Initialization error:', err);
        if (mounted) {
          setError(err);
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
      SyncEngine.stop();
    };
  }, []);

  if (error) {
    return (
      <OfflineFirstContext.Provider value={{ isReady: false, error }}>
        {children}
      </OfflineFirstContext.Provider>
    );
  }

  if (!isReady || !database) {
    return null; // Or a loading screen
  }

  return (
    <DatabaseProvider database={database}>
      <OfflineFirstContext.Provider value={{ isReady: true, error: null }}>
        {children}
      </OfflineFirstContext.Provider>
    </DatabaseProvider>
  );
}

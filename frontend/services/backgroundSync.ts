/**
 * Background Sync Engine - WhatsApp-Level Intelligence
 * Handles continuous contact intelligence with differential sync
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiUrl } from '@/utils/network';
import { getSocket } from '@/socket/socket';
import { AppState, AppStateStatus } from 'react-native';

const CACHE_KEYS = {
  CONTACTS: 'contacts_cache_v4',
  CONTACTS_HASH: 'contacts_hash_v2',
  LAST_SYNC: 'last_sync_timestamp',
  PRIORITY_CONTACTS: 'priority_contacts',
};

const SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Normalize phone number (WhatsApp-style)
 * Handles: +91 98765 43210, 09876543210, 9876543210
 */
export function normalizePhone(phone: string): string {
  return phone
    .replace(/\D/g, '')        // Remove all non-digits
    .replace(/^0+/, '')        // Remove leading zeros
    .slice(-10);               // Last 10 digits (India)
}

/**
 * Generate hash of contact list (for differential sync)
 */
function generateContactsHash(contacts: any[]): string {
  const phoneNumbers = contacts
    .flatMap(c => c.phoneNumbers || [])
    .map(normalizePhone)
    .filter(p => p.length === 10)
    .sort()
    .join(',');
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < phoneNumbers.length; i++) {
    const char = phoneNumbers.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

/**
 * Load contacts from cache instantly (WhatsApp-style)
 */
export async function loadCachedContacts(): Promise<any[]> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEYS.CONTACTS);
    if (cached) {
      const data = JSON.parse(cached);
      console.log('[WhatsAppSync] Loaded', data.length, 'contacts from cache (<50ms)');
      return data;
    }
  } catch (error) {
    console.error('[WhatsAppSync] Cache load error:', error);
  }
  return [];
}

/**
 * Load priority contacts first (recent chats, frequent contacts)
 */
export async function loadPriorityContacts(): Promise<any[]> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEYS.PRIORITY_CONTACTS);
    if (cached) {
      const data = JSON.parse(cached);
      console.log('[WhatsAppSync] Loaded', data.length, 'priority contacts');
      return data;
    }
  } catch (error) {
    console.error('[WhatsAppSync] Priority load error:', error);
  }
  return [];
}

/**
 * Save contacts to cache
 */
async function saveCachedContacts(contacts: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.CONTACTS, JSON.stringify(contacts));
    await AsyncStorage.setItem(CACHE_KEYS.LAST_SYNC, Date.now().toString());
    console.log('[WhatsAppSync] Cached', contacts.length, 'contacts');
  } catch (error) {
    console.error('[WhatsAppSync] Cache save error:', error);
  }
}

/**
 * Check if sync is needed (differential sync)
 */
async function shouldSync(currentHash: string): Promise<boolean> {
  try {
    // Check hash first (most important)
    const storedHash = await AsyncStorage.getItem(CACHE_KEYS.CONTACTS_HASH);
    if (storedHash === currentHash) {
      console.log('[WhatsAppSync] Hash unchanged, skipping sync (90% case)');
      return false;
    }

    console.log('[WhatsAppSync] Hash changed, sync needed');
    return true;
  } catch (error) {
    console.error('[WhatsAppSync] shouldSync error:', error);
    return true; // Sync on error
  }
}

/**
 * Merge and deduplicate contacts
 */
function mergeContacts(existing: any[], newContacts: any[]): any[] {
  const merged = [...existing, ...newContacts];
  const deduped = Array.from(
    new Map(merged.map(item => [item._id, item])).values()
  );
  return deduped;
}

/**
 * Sync contacts in background (WhatsApp-style)
 * - Differential sync (hash-based)
 * - Batch processing
 * - Stream results
 * - Never blocks UI
 */
export async function syncContactsInBackground(
  deviceContacts: any[],
  token: string,
  onProgress?: (chunk: any[]) => void
): Promise<void> {
  try {
    // Generate hash
    const currentHash = generateContactsHash(deviceContacts);

    // Differential sync check
    if (!(await shouldSync(currentHash))) {
      console.log('[WhatsAppSync] Skipping sync (no changes detected)');
      return;
    }

    // Save new hash immediately
    await AsyncStorage.setItem(CACHE_KEYS.CONTACTS_HASH, currentHash);

    // Extract and normalize unique phone numbers
    const phoneSet = new Set<string>();
    deviceContacts.forEach((contact) => {
      contact.phoneNumbers?.forEach((p: string) => {
        const normalized = normalizePhone(p);
        if (normalized.length === 10) {
          phoneSet.add(normalized);
        }
      });
    });

    const phones = Array.from(phoneSet);
    console.log('[WhatsAppSync] Syncing', phones.length, 'normalized phone numbers');

    // Batch processing (100 phones per request)
    const BATCH_SIZE = 100;

    for (let i = 0; i < phones.length; i += BATCH_SIZE) {
      const batch = phones.slice(i, i + BATCH_SIZE);

      try {
        const apiUrl = await getApiUrl();
        const response = await fetch(`${apiUrl}/api/contacts/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ phones: batch }),
        });

        const result = await response.json();

        if (result.success) {
          console.log('[WhatsAppSync] Batch', i / BATCH_SIZE + 1, 'queued');
          
          // Note: Results will come via socket, not HTTP response
          // This is the WhatsApp way - queue and stream
        }
      } catch (error) {
        console.error('[WhatsAppSync] Batch error:', error);
        // Continue with next batch (failure-tolerant)
      }

      // Small delay to avoid overwhelming server
      if (i + BATCH_SIZE < phones.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('[WhatsAppSync] All batches queued, waiting for socket updates');
  } catch (error) {
    console.error('[WhatsAppSync] Sync error:', error);
    // Don't throw - UI still works from cache (failure-tolerant)
  }
}

/**
 * Setup socket listeners for real-time contact updates
 */
export function setupContactSocketListeners(onUpdate: (contacts: any[]) => void): void {
  const socket = getSocket();
  if (!socket) return;

  // Listen for contact chunks (streaming results)
  socket.on('contacts:chunk', async (chunk: any[]) => {
    console.log('[WhatsAppSync] Received contact chunk:', chunk.length);
    
    // Update UI immediately
    onUpdate(chunk);
    
    // Update cache in background
    const cached = await loadCachedContacts();
    const merged = mergeContacts(cached, chunk);
    await saveCachedContacts(merged);
  });

  // Listen for contact updates (real-time)
  socket.on('contacts:updated', async () => {
    console.log('[WhatsAppSync] Contacts updated, triggering refresh');
    // Clear hash to force sync
    await AsyncStorage.removeItem(CACHE_KEYS.CONTACTS_HASH);
  });

  console.log('[WhatsAppSync] Socket listeners active');
}

/**
 * Cleanup socket listeners
 */
export function cleanupContactSocketListeners(): void {
  const socket = getSocket();
  if (!socket) return;

  socket.off('contacts:chunk');
  socket.off('contacts:updated');
  
  console.log('[WhatsAppSync] Socket listeners cleaned up');
}

/**
 * Setup automatic background sync (WhatsApp-style)
 * Triggers:
 * - App foreground
 * - Every 24 hours
 */
export function setupAutoSync(syncFunction: () => void): () => void {
  // Sync on app foreground
  const appStateListener = (state: AppStateStatus) => {
    if (state === 'active') {
      console.log('[WhatsAppSync] App foregrounded, triggering sync');
      syncFunction();
    }
  };
  
  const appStateSubscription = AppState.addEventListener('change', appStateListener);

  // Sync every 24 hours
  const intervalId = setInterval(() => {
    console.log('[WhatsAppSync] 24h interval, triggering sync');
    syncFunction();
  }, SYNC_INTERVAL);

  // Cleanup function
  return () => {
    appStateSubscription.remove();
    clearInterval(intervalId);
  };
}

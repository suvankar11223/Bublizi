/***
 * contactsService.ts
 * ─────────────────────────────────────────────────────────────────
 * Merges TWO contact sources into one unified list of MongoDB users:
 *   Source A: /api/user/contacts  ← existing app users (email/Google signups)
 *   Source B: Device phone book   ← matched via /api/user/find-by-phones
 *
 * The merged list uses MongoDB _id throughout so that:
 *   ✅ startConversationWithUser(contact) works
 *   ✅ socket.emit('initiateCall', { receiverId: contact._id }) works
 *   ✅ isOnline(contact._id) works
 *   ✅ All existing Home screen logic is untouched
 * ─────────────────────────────────────────────────────────────────
 */

import * as Contacts from 'expo-contacts'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApiUrl } from '@/utils/network'

// ─── Cache keys ───────────────────────────────────────────────────────
const CONTACTS_CACHE_KEY = 'cached_contacts_v2'

// ─── Phone normalizer (10-digit) ──────────────────────────────────────
const normalizePhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return digits
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits.slice(-10) // fallback: take last 10 digits
}

// ─── Phone contact interface ──────────────────────────────────────────
export interface PhoneContact {
  id: string
  name: string
  phoneNumbers: string[]
  emails: string[]
}

// ─── Get phone contacts from device ───────────────────────────────────
export const getPhoneContacts = async (): Promise<PhoneContact[]> => {
  try {
    const { status } = await Contacts.requestPermissionsAsync()
    if (status !== 'granted') {
      console.log('[contactsService] Contact permission denied - This helps you find friends who are already using the app')
      return []
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name, Contacts.Fields.Emails],
    })

    if (!data || data.length === 0) return []

    return data.map((contact) => ({
      id: contact.id || Math.random().toString(),
      name: contact.name || 'Unknown',
      phoneNumbers: contact.phoneNumbers?.map(p => p.number || '') || [],
      emails: contact.emails?.map(e => e.email || '') || [],
    }))
  } catch (error) {
    console.error('[contactsService] getPhoneContacts error:', error)
    return []
  }
}

// ─── Match phone contacts with app users ──────────────────────────────
export const matchContactsWithUsers = (phoneContacts: PhoneContact[], appUsers: any[]): any[] => {
  const matched: any[] = []
  
  phoneContacts.forEach((contact) => {
    contact.phoneNumbers.forEach((phoneNumber) => {
      const normalized = normalizePhone(phoneNumber)
      if (normalized.length >= 10) {
        const matchedUser = appUsers.find((user) => {
          if (!user.phoneNumber) return false
          const userPhone = normalizePhone(user.phoneNumber)
          return userPhone === normalized
        })
        
        if (matchedUser && !matched.find(m => m._id === matchedUser._id)) {
          matched.push({
            ...matchedUser,
            contactName: contact.name, // Keep original contact name
          })
        }
      }
    })
  })
  
  return matched
}

// ─────────────────────────────────────────────────────────────────────
// fetchContactsFromAPI
// Called by Home screen — returns merged list of MongoDB users
// ─────────────────────────────────────────────────────────────────────
export const fetchContactsFromAPI = async (token: string): Promise<any[]> => {
  try {
    // ── Step 1: Fetch existing app users (email/Google signups) ─────────
    const apiContactsPromise = fetch(`${await getApiUrl()}/api/user/contacts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => (data.success ? data.data || [] : []))
      .catch(() => [])

    // ── Step 2: Fetch device contacts and match against app ─────────────
    const phoneContactsPromise = fetchPhoneContactUsers(token)

    // Run both in parallel
    const [apiContacts, phoneContacts] = await Promise.all([
      apiContactsPromise,
      phoneContactsPromise,
    ])

    console.log('[contactsService] API contacts:', apiContacts.length)
    console.log('[contactsService] Phone-matched contacts:', phoneContacts.length)

    // ── Step 3: Merge, deduplicating by MongoDB _id ─────────────────────
    const merged = mergeContacts(apiContacts, phoneContacts)
    console.log('[contactsService] Merged total:', merged.length)

    // ── Step 4: Cache the merged result ────────────────────────────────
    await cacheContacts(merged)

    return merged
  } catch (error) {
    console.error('[contactsService] fetchContactsFromAPI error:', error)
    // Return cached data on error
    return getCachedContacts()
  }
}

// ─────────────────────────────────────────────────────────────────────
// fetchPhoneContactUsers
// Gets device contacts → extracts phones → hits backend to find app users
// Returns MongoDB users (with _id) — safe to use everywhere in the app
// ─────────────────────────────────────────────────────────────────────
const fetchPhoneContactUsers = async (token: string): Promise<any[]> => {
  try {
    // ── Request contact permission ───────────────────────────────────
    const { status } = await Contacts.requestPermissionsAsync()
    if (status !== 'granted') {
      console.log('[contactsService] Contact permission denied - We use this to help you find friends who are already using the app')
      return []
    }

    // ── Read device contacts ─────────────────────────────────────────
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
    })

    if (!data || data.length === 0) return []

    // ── Extract + normalize unique phone numbers ─────────────────────
    const phoneSet = new Set<string>()
    data.forEach((contact) => {
      contact.phoneNumbers?.forEach((p) => {
        if (p.number) {
          const normalized = normalizePhone(p.number)
          if (normalized.length >= 10) phoneSet.add(normalized)
        }
      })
    })

    const phones = Array.from(phoneSet)
    if (phones.length === 0) return []

    console.log('[contactsService] Device phone numbers found:', phones.length)

    // ── Hit backend in chunks of 100 ────────────────────────────────
    const CHUNK = 100
    const allMatched: any[] = []

    for (let i = 0; i < phones.length; i += CHUNK) {
      const chunk = phones.slice(i, i + CHUNK)
      try {
        const response = await fetch(`${await getApiUrl()}/api/user/find-by-phones`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ phones: chunk }),
        })

        const result = await response.json()
        if (result.success && Array.isArray(result.data)) {
          allMatched.push(...result.data)
        }
      } catch (err) {
        console.error('[contactsService] Chunk fetch error:', err)
      }
    }

    return allMatched
  } catch (error) {
    console.error('[contactsService] fetchPhoneContactUsers error:', error)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────
// mergeContacts
// Deduplicates by MongoDB _id, phone-contacts augment api-contacts
// ─────────────────────────────────────────────────────────────────────
const mergeContacts = (apiContacts: any[], phoneContacts: any[]): any[] => {
  const map = new Map<string, any>()

  // Add API contacts first (they have complete profiles)
  apiContacts.forEach((c) => {
    if (c._id) map.set(c._id.toString(), c)
  })

  // Add phone contacts — skip if already in map (avoid duplicates)
  phoneContacts.forEach((c) => {
    if (c._id && !map.has(c._id.toString())) {
      map.set(c._id.toString(), c)
    }
  })

  return Array.from(map.values())
}

// ─────────────────────────────────────────────────────────────────────
// fetchConversationsFromAPI — unchanged from your original
// ─────────────────────────────────────────────────────────────────────
export const fetchConversationsFromAPI = async (token: string): Promise<any[]> => {
  try {
    const response = await fetch(`${await getApiUrl()}/api/user/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await response.json()
    return data.success ? data.data || [] : []
  } catch (error) {
    console.error('[contactsService] fetchConversationsFromAPI error:', error)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────
// Cache helpers (used by Home screen's getCachedContacts)
// ─────────────────────────────────────────────────────────────────────
const cacheContacts = async (contacts: any[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      CONTACTS_CACHE_KEY,
      JSON.stringify({ data: contacts, timestamp: Date.now() })
    )
  } catch {}
}

export const getCachedContacts = async (): Promise<any[]> => {
  try {
    const raw = await AsyncStorage.getItem(CONTACTS_CACHE_KEY)
    if (!raw) return []
    const { data } = JSON.parse(raw)
    // Return stale cache even if expired (freshness handled by background fetch)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export const getCachedConversations = async (): Promise<any[]> => {
  // Conversations are already cached elsewhere in your app
  // This is a passthrough to maintain the existing API surface
  try {
    const raw = await AsyncStorage.getItem('cached_conversations')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
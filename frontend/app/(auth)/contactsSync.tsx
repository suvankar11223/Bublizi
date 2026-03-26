import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Contacts from 'expo-contacts';
import { useAuth } from '@/context/authContext';
import ScreenWrapper from '@/components/ScreenWrapper';
import Avatar from '@/components/Avatar';
import Button from '@/components/Button';
import { colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { 
  loadCachedContacts, 
  syncContactsInBackground,
  setupContactSocketListeners,
  cleanupContactSocketListeners 
} from '@/services/backgroundSync';

interface ContactMatch {
  _id: string;
  name: string;
  avatar?: string;
  phoneNumber: string;
  isPhoneVerified?: boolean;
  contactName?: string;
}

export default function ContactsSyncScreen() {
  const [contacts, setContacts] = useState<ContactMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  
  const router = useRouter();
  const { token } = useAuth();

  const loadCachedContactsFirst = useCallback(async () => {
    const cached = await loadCachedContacts();
    if (cached.length > 0) {
      setContacts(cached);
      setLoading(false);
      console.log('[ContactsSync] Loaded', cached.length, 'cached contacts');
    }
  }, []);

  const handleContactChunk = useCallback((chunk: ContactMatch[]) => {
    setContacts(prev => {
      // Merge and deduplicate
      const merged = [...prev, ...chunk];
      const deduped = Array.from(
        new Map(merged.map(item => [item._id, item])).values()
      );
      return deduped;
    });
  }, []);

  const syncContacts = useCallback(async () => {
    try {
      // Read device contacts
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      });

      if (!data || data.length === 0) {
        Alert.alert('No Contacts', 'No contacts found on your device');
        setLoading(false);
        return;
      }

      console.log('[ContactsSync] Found', data.length, 'device contacts');

      // Sync in background (non-blocking)
      await syncContactsInBackground(
        data,
        token!,
        handleContactChunk // Stream results to UI
      );
    } catch (error) {
      console.error('[ContactsSync] Sync error:', error);
      Alert.alert('Error', 'Failed to sync contacts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [token, handleContactChunk]);

  const requestPermissionsAndSync = useCallback(async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      
      if (status !== 'granted') {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }

      await syncContacts();
    } catch (error) {
      console.error('[ContactsSync] Permission error:', error);
      setPermissionDenied(true);
      setLoading(false);
    }
  }, [syncContacts]);

  useEffect(() => {
    // Load cached contacts first (instant)
    loadCachedContactsFirst();
    
    // Then request permissions and sync
    requestPermissionsAndSync();
    
    // Setup socket listeners for streaming updates
    setupContactSocketListeners(handleContactChunk);
    
    return () => {
      cleanupContactSocketListeners();
    };
  }, [loadCachedContactsFirst, requestPermissionsAndSync, handleContactChunk]);

  const handleStartChat = (contact: ContactMatch) => {
    // Navigate to main app and start conversation
    router.replace({
      pathname: '/(main)/home',
      params: { startChatWith: contact._id },
    });
  };

  const handleSkip = () => {
    router.replace('/(main)/home');
  };

  const renderContact = ({ item }: { item: ContactMatch }) => (
    <View style={styles.contactItem}>
      <Avatar uri={item.avatar} size={50} />
      
      <View style={styles.contactInfo}>
        <Text style={styles.contactName}>{item.name}</Text>
        <Text style={styles.contactPhone}>{item.phoneNumber}</Text>
      </View>

      <TouchableOpacity
        style={styles.chatButton}
        onPress={() => handleStartChat(item)}
      >
        <Ionicons name="chatbubble" size={20} color={colors.primary} />
        <Text style={styles.chatButtonText}>Chat</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Syncing contacts...</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (permissionDenied) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <Ionicons name="people-outline" size={80} color={colors.neutral600} />
          <Text style={styles.title}>Contact Permission Required</Text>
          <Text style={styles.subtitle}>
            We need access to your contacts to help you find friends who are already using Bublizi
          </Text>
          <Button onPress={requestPermissionsAndSync}>
            <Text style={{ color: colors.neutral900, fontWeight: '600' }}>Grant Permission</Text>
          </Button>
          <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Friends on Bublizi</Text>
          <Text style={styles.subtitle}>
            {contacts.length === 0
              ? 'No contacts found using Bublizi yet'
              : `${contacts.length} ${contacts.length === 1 ? 'friend' : 'friends'} found`}
          </Text>
        </View>

        {contacts.length > 0 ? (
          <FlatList
            data={contacts}
            keyExtractor={(item) => item._id}
            renderItem={renderContact}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={80} color={colors.neutral600} />
            <Text style={styles.emptyText}>No friends found yet</Text>
            <Text style={styles.emptySubtext}>
              Invite your friends to join Bublizi!
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <Button onPress={handleSkip}>
            <Text style={{ color: colors.neutral900, fontWeight: '600' }}>Continue to App</Text>
          </Button>
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 20,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral200,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.neutral900,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.neutral600,
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: colors.neutral600,
    marginTop: 10,
  },
  listContent: {
    padding: 20,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral200,
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.neutral900,
  },
  contactPhone: {
    fontSize: 14,
    color: colors.neutral600,
    marginTop: 2,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  chatButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.neutral900,
    marginTop: 20,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.neutral600,
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.neutral200,
  },
  skipButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  skipText: {
    color: colors.neutral600,
    fontSize: 16,
  },
});

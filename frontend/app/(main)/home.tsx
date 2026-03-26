import { StyleSheet, View, TouchableOpacity, FlatList, Alert, RefreshControl } from 'react-native';
import React, { useState, useEffect } from 'react';
import ScreenWrapper from '@/components/ScreenWrapper';
import { colors, spacingX, spacingY, radius } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/authContext';
import Typo from '@/components/Typo';
import ConversationItem from '@/components/ConversationItem';
import Avatar from '@/components/Avatar';
import { ConversationProps, ResponseProps } from '@/types';
import { useFocusEffect } from '@react-navigation/native';
import { getConversations, newConversation, newMessage, getContacts } from '@/socket/socketEvents';
import { getSocket } from '@/socket/socket';
import { fetchContactsFromAPI, fetchConversationsFromAPI } from '@/services/contactsService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { SuggestionCarousel } from '@/components/suggestions/SuggestionCarousel';
import { PermissionGate } from '@/components/suggestions/PermissionGate';
import { useMessageWatcher } from '@/hooks/suggestions/useMessageWatcher';
import { useSuggestions } from '@/hooks/suggestions/useSuggestions';
import { useSuggestionStore } from '@/services/suggestions/suggestionStore';
import { SwipeableConversationItem } from '@/components/SwipeableConversationItem';
import { StatusRing } from '@/components/StatusRing';

const Home = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { isOnline } = useOnlineStatus();
  const [selectedTab, setSelectedTab] = useState<'direct' | 'group'>('direct');
  const [conversations, setConversations] = useState<ConversationProps[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPermission, setShowPermission] = useState(false);

  // AI Suggestions
  const { permissionGranted, setPermissionGranted, hydrate } = useSuggestionStore();
  const { suggestions, isProcessing, handleAction, dismiss } = useSuggestions({
    router,
    onNavigateToChat: (chatId: string) => {
      const conv = conversations.find(c => c._id === chatId);
      if (conv) {
        const isDirect = conv.type === 'direct';
        const otherParticipant = isDirect ? conv.participants.find(p => p._id !== user?.id) : null;
        router.push({
          pathname: '/conversation',
          params: {
            id: conv._id,
            name: isDirect ? otherParticipant?.name : conv.name,
            avatar: isDirect ? otherParticipant?.avatar : conv.avatar,
            type: conv.type,
            participants: JSON.stringify(conv.participants),
          },
        });
      }
    },
  });

  // Start watching messages for AI suggestions
  useMessageWatcher(conversations);

  // Instant load - load from cache immediately, then refresh
  useEffect(() => {
    console.log('[DEBUG] Home: Component mounted');
    
    // Hydrate AI suggestions from storage
    hydrate();
    
    // Show permission gate after 1s if not granted
    const timer = setTimeout(() => {
      if (!permissionGranted) setShowPermission(true);
    }, 1000);
    
    // Step 1: Load cached data INSTANTLY (no waiting)
    loadCachedData();
    
    // Step 2: Setup socket for real-time updates IMMEDIATELY
    setupSocketListeners();
    
    // Step 3: Fetch fresh data in background (non-blocking)
    if (user) {
      // Don't wait - fire and forget
      fetchFreshData().catch(err => console.log('[DEBUG] Background fetch error:', err));
    }

    return () => {
      clearTimeout(timer);
      cleanupSocketListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Re-run when user changes

  // Instant load from cache
  const loadCachedData = async () => {
    try {
      const { getCachedContacts, getCachedConversations } = await import('@/utils/network');
      const [cachedContacts, cachedConversations] = await Promise.all([
        getCachedContacts(),
        getCachedConversations()
      ]);
      
      if (cachedContacts && cachedContacts.length > 0) {
        console.log('[DEBUG] Home: Loaded', cachedContacts.length, 'contacts from cache');
        setContacts(cachedContacts);
      }
      
      if (cachedConversations && cachedConversations.length > 0) {
        console.log('[DEBUG] Home: Loaded', cachedConversations.length, 'conversations from cache');
        setConversations(cachedConversations);
      }
    } catch (error) {
      console.log('[DEBUG] Home: Error loading cache:', error);
    }
  };

  // Fetch fresh data from API (non-blocking) - OPTIMIZED for speed
  const fetchFreshData = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        console.log('[DEBUG] Home: No token found');
        return;
      }

      // Fire both requests in parallel - don't wait
      Promise.all([
        (async () => {
          try {
            const { fetchContactsFromAPI } = await import('@/services/contactsService');
            console.log('[DEBUG] Home: Fetching contacts from API...');
            const apiContacts = await fetchContactsFromAPI(token);
            
            if (apiContacts && apiContacts.length > 0) {
              console.log('[DEBUG] Home: Got', apiContacts.length, 'contacts from API');
              setContacts(apiContacts);
            }
          } catch (err) {
            console.log('[DEBUG] Home: Contacts fetch error:', err);
          }
        })(),
        (async () => {
          try {
            const { fetchConversationsFromAPI } = await import('@/services/contactsService');
            console.log('[DEBUG] Home: Fetching conversations from API...');
            const apiConversations = await fetchConversationsFromAPI(token);
            
            if (apiConversations && apiConversations.length > 0) {
              console.log('[DEBUG] Home: Got', apiConversations.length, 'conversations from API');
              setConversations(apiConversations);
            }
          } catch (err) {
            console.log('[DEBUG] Home: Conversations fetch error:', err);
          }
        })(),
      ]).catch(err => console.log('[DEBUG] Home: Parallel fetch error:', err));
    } catch (error) {
      console.log('[DEBUG] Home: Error in fetchFreshData:', error);
    }
  };

  // Setup socket listeners for real-time updates
  const setupSocketListeners = () => {
    getConversations(processConversations);
    newConversation(newConversationHandler);
    getContacts(processContacts);

    const handleNewMessage = (res: ResponseProps) => {
      if (res.success && res.data) {
        const { conversationId, content, createdAt, sender, attachment, id } = res.data;
        const isMyMessage = sender.id === user?.id;
        
        setConversations((prev) => {
          const existingConv = prev.find(conv => conv._id === conversationId);
          if (existingConv) {
            const updatedConv = {
              ...existingConv,
              lastMessage: { _id: id, content, createdAt, senderId: sender.id, type: attachment ? 'image' as const : 'text' as const, attachment },
              updatedAt: createdAt,
              unreadCount: isMyMessage ? existingConv.unreadCount : (existingConv.unreadCount || 0) + 1,
            };
            const filtered = prev.filter(c => c._id !== conversationId);
            return [updatedConv, ...filtered];
          }
          return prev;
        });
      }
    };

    newMessage(handleNewMessage);
    
    const socket = getSocket();
    if (socket) {
      socket.on('markAsRead', (res: ResponseProps) => {
        if (res.success && res.data?.conversationId) {
          setConversations(prev => prev.map(c => c._id === res.data.conversationId ? { ...c, unreadCount: 0 } : c));
        }
      });
      
      // Listen for new user registrations
      socket.on('newUserRegistered', (newUser: any) => {
        console.log('[DEBUG] Home: New user registered:', newUser);
        // Add new user to contacts if not already there
        setContacts(prev => {
          const exists = prev.some(c => c._id === newUser._id);
          if (exists) return prev;
          console.log('[DEBUG] Home: Adding new user to contacts:', newUser.name);
          return [...prev, newUser];
        });
      });
    }
  };

  const cleanupSocketListeners = () => {
    getConversations(processConversations, true);
    newConversation(newConversationHandler, true);
    getContacts(processContacts, true);
    newMessage(() => {}, true);
    
    const socket = getSocket();
    if (socket) {
      socket.off('newUserRegistered');
    }
  };

  const processContacts = (res: ResponseProps) => {
    console.log('[DEBUG] processContacts received:', res?.data?.length, 'contacts');
    if (res.success && res.data) {
      // Always use fresh socket data (it's already sorted newest first from backend)
      setContacts(res.data);
      console.log('[DEBUG] Loaded', res.data.length, 'contacts via socket');
      if (res.data.length > 0) {
        console.log('[DEBUG] Contact names:', res.data.map((c: any) => c.name).join(', '));
        console.log('[DEBUG] Contact IDs:', res.data.map((c: any) => c._id).join(', '));
      }
    }
  };

  // Fallback function to load contacts and conversations from API
  const loadContactsFromAPI = async () => {
    try {
      console.log('[DEBUG] Loading contacts and conversations from API');
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        console.log('[DEBUG] No token found');
        return;
      }
      
      // Fetch both contacts and conversations in parallel
      const [apiContacts, apiConversations] = await Promise.all([
        fetchContactsFromAPI(token),
        fetchConversationsFromAPI(token)
      ]);
      
      console.log('[DEBUG] API returned:', apiContacts?.length || 0, 'contacts');
      console.log('[DEBUG] API returned:', apiConversations?.length || 0, 'conversations');
      
      if (apiContacts && apiContacts.length > 0) {
        console.log('[DEBUG] Loaded', apiContacts.length, 'contacts from API');
        console.log('[DEBUG] Contact names:', apiContacts.map((c: any) => c.name).join(', '));
        setContacts(apiContacts);
      } else {
        console.log('[DEBUG] No contacts returned from API');
        // Still show cached if available
        setContacts(apiContacts || []);
      }
      
      if (apiConversations && apiConversations.length > 0) {
        console.log('[DEBUG] Loaded', apiConversations.length, 'conversations from API');
        // Update conversations list - merge with existing or replace
        setConversations((prev) => {
          const existingIds = new Set(prev.map(c => c._id));
          const newConversations = apiConversations.filter((c: any) => !existingIds.has(c._id));
          return [...newConversations, ...prev];
        });
      } else {
        console.log('[DEBUG] No conversations returned from API');
      }
    } catch (error) {
      console.error('[DEBUG] Error loading data from API:', error);
    }
  };



  const processConversations = (res: ResponseProps) => {
    console.log('[DEBUG] processConversations:', res);
    if (res.success) {
      setConversations(res.data);
      console.log('[DEBUG] Loaded', res.data.length, 'conversations');
    }
  };

  const newConversationHandler = (res: ResponseProps) => {
    console.log('[DEBUG] newConversationHandler:', res);
    if (res.success && res.data) {
      // Check if conversation already exists
      setConversations((prev) => {
        const exists = prev.some(conv => conv._id === res.data._id);
        if (exists) {
          console.log('[DEBUG] Conversation already exists, updating it');
          // Update existing conversation
          return prev.map(conv => 
            conv._id === res.data._id ? res.data : conv
          );
        }
        console.log('[DEBUG] Adding new conversation:', res.data);
        console.log('[DEBUG] Conversation type:', res.data.type);
        console.log('[DEBUG] Conversation name:', res.data.name);
        return [res.data, ...prev];
      });
      
      // If it's a group, automatically switch to Groups tab
      if (res.data.type === 'group') {
        console.log('[DEBUG] New group created, switching to Groups tab');
        setSelectedTab('group');
      }
    }
  };

  const refreshConversations = async () => {
    console.log('[DEBUG] Home: Manual refresh triggered');
    setLoading(true);
    
    // Check if user is authenticated before attempting any operations
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      console.log('[DEBUG] Home: No token, skipping refresh');
      setLoading(false);
      return;
    }
    
    // Always try API first (more reliable)
    await loadContactsFromAPI();
    
    const socket = getSocket();
    if (socket && socket.connected) {
      console.log('[DEBUG] Home: Socket connected, fetching conversations');
      getConversations(null);
      getContacts(null); // Also try socket as backup
      setTimeout(() => setLoading(false), 1000);
    } else {
      console.log('[DEBUG] Home: Socket not connected, attempting to reconnect...');
      try {
        const { connectSocket } = await import('@/socket/socket');
        await connectSocket();
        console.log('[DEBUG] Home: Reconnected successfully');
        getConversations(null);
        getContacts(null);
        setTimeout(() => setLoading(false), 1000);
      } catch (error) {
        console.error('[DEBUG] Home: Reconnection failed:', error);
        setLoading(false);
      }
    }
  };

  const onRefresh = async () => {
    console.log('[DEBUG] Home: Pull-to-refresh triggered');
    
    // Check if user is authenticated
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      console.log('[DEBUG] Home: No token, skipping refresh');
      return;
    }
    
    setRefreshing(true);
    await loadContactsFromAPI();
    
    const socket = getSocket();
    if (socket && socket.connected) {
      getConversations(null);
      getContacts(null);
    }
    
    setRefreshing(false);
  };

  // Refresh conversations when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('[DEBUG] Home: Screen focused, refreshing conversations');
      
      // Fetch conversations from socket
      const socket = getSocket();
      if (socket && socket.connected) {
        console.log('[DEBUG] Home: Socket connected, fetching conversations');
        getConversations(null);
      } else {
        console.log('[DEBUG] Home: Socket not connected, will retry');
        // Try to reconnect
        setTimeout(() => {
          const s = getSocket();
          if (s && s.connected) {
            getConversations(null);
          }
        }, 1000);
      }
      
      // Return cleanup function
      return () => {
        console.log('[DEBUG] Home: Screen unfocused');
      };
    }, [])
  );

  const openProfile = () => {
    router.push('/(main)/profileModal');
  };

  const startConversationWithUser = async (contact: any) => {
    console.log('='.repeat(60));
    console.log('[DEBUG] === STARTING CONVERSATION ===');
    console.log('[DEBUG] Contact:', contact.name, '(', contact._id, ')');
    console.log('[DEBUG] Current user:', user?.name, '(', user?.id, ')');
    
    try {
      // Check if conversation already exists
      const existingConv = conversations.find((conv: ConversationProps) => {
        if (conv.type !== 'direct') return false;
        return conv.participants.some((p: any) => p._id === contact._id);
      });

      if (existingConv) {
        console.log('[DEBUG] Found existing conversation:', existingConv._id);
        
        // Reset unread count locally
        setConversations(prev =>
          prev.map(c =>
            c._id === existingConv._id
              ? { ...c, unreadCount: 0 }
              : c
          )
        );
        
        // Navigate to existing conversation
        router.push({
          pathname: "/conversation",
          params: {
            id: existingConv._id,
            name: contact.name,
            avatar: contact.avatar || '',
            type: "direct",
            participants: JSON.stringify(existingConv.participants),
          },
        });
      } else {
        console.log('[DEBUG] No existing conversation, creating new one via socket...');
        // Create new conversation via socket
        const socket = getSocket();
        if (!socket || !socket.connected) {
          console.log('[DEBUG] Socket not connected, attempting to reconnect...');
          
          // Try to reconnect
          try {
            const { connectSocket } = await import('@/socket/socket');
            await connectSocket();
            const newSocket = getSocket();
            
            if (!newSocket || !newSocket.connected) {
              Alert.alert('Connection Error', 'Cannot connect to server. Please check your internet connection and try again.');
              return;
            }
            
            // Continue with the connected socket
            createNewConversation(newSocket, contact);
          } catch (error) {
            console.error('[DEBUG] Reconnection failed:', error);
            Alert.alert('Connection Error', 'Cannot connect to server. Please try again.');
            return;
          }
        } else {
          createNewConversation(socket, contact);
        }
      }
    } catch (error) {
      console.error('[DEBUG] Error in startConversationWithUser:', error);
      Alert.alert('Error', String(error));
    }
    console.log('='.repeat(60));
  };

  const createNewConversation = (socket: any, contact: any) => {
    // Emit newConversation event directly
    socket.emit('newConversation', {
      type: 'direct',
      participants: [user?.id, contact._id],
    });

    // Listen for response
    const handleNewConversation = (response: ResponseProps) => {
      console.log('[DEBUG] newConversation response:', response);
      if (response.success && response.data) {
        // Remove listener
        socket.off('newConversation', handleNewConversation);
        
        // Navigate to new conversation
        router.push({
          pathname: "/conversation",
          params: {
            id: response.data._id,
            name: contact.name,
            avatar: contact.avatar || '',
            type: "direct",
            participants: JSON.stringify(response.data.participants),
          },
        });
      } else {
        console.error('[DEBUG] Failed to create conversation:', response.msg);
        socket.off('newConversation', handleNewConversation);
        Alert.alert('Error', response.msg || 'Failed to create conversation');
      }
    };

    socket.on('newConversation', handleNewConversation);
  };

  // Separate conversations by type and sort by most recent
  const directConversations = conversations
    .filter((item: ConversationProps) => item.type === "direct")
    .sort((a: ConversationProps, b: ConversationProps) => {
      const aDate = a?.lastMessage?.createdAt || a.createdAt;
      const bDate = b?.lastMessage?.createdAt || b.createdAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

  const groupConversations = conversations
    .filter((item: ConversationProps) => item.type === "group")
    .sort((a: ConversationProps, b: ConversationProps) => {
      const aDate = a?.lastMessage?.createdAt || a.createdAt;
      const bDate = b?.lastMessage?.createdAt || b.createdAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

  // Contacts who DON'T have a conversation yet (shown below active chats)
  // FIX: Use proper string comparison for MongoDB ObjectIds
  const contactsWithoutConversation = contacts.filter(contact => {
    const contactId = contact._id?.toString();
    const hasConversation = conversations.some((conv: ConversationProps) => {
      if (conv.type !== 'direct') return false;
      return conv.participants?.some((p: any) => {
        const participantId = p._id?.toString() || p?.toString();
        return participantId === contactId;
      });
    });
    return !hasConversation;
  });

  // Debug logging
  console.log('[DEBUG] Total contacts:', contacts.length);
  console.log('[DEBUG] Total conversations:', conversations.length);
  console.log('[DEBUG] Direct conversations:', directConversations.length);
  if (contacts.length > 0) {
    console.log('[DEBUG] All contact names:', contacts.map(c => c.name).join(', '));
  }
  if (contactsWithoutConversation.length > 0) {
    console.log('[DEBUG] Contacts without conversation:', contactsWithoutConversation.map(c => ({ id: c._id, name: c.name, email: c.email })));
  } else {
    console.log('[DEBUG] No contacts without conversation (all have conversations or no contacts loaded)');
  }

  // Final merged list: active chats first (sorted), then ALL unused contacts
  const directListData = [...directConversations, ...contactsWithoutConversation];



  const renderList = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <Typo size={16} color={colors.neutral600}>
            Loading...
          </Typo>
        </View>
      );
    }

    // Show empty state only if we have no data at all
    if (directListData.length === 0 && groupConversations.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Typo size={16} color={colors.neutral600} style={{ textAlign: 'center' }}>
            {selectedTab === 'direct' ? 'No conversations yet' : 'No groups yet'}
          </Typo>
          <Typo size={14} color={colors.neutral500} style={{ textAlign: 'center', marginTop: 8 }}>
            {selectedTab === 'direct' ? 'Start chatting with someone!' : 'Create a group to get started'}
          </Typo>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={refreshConversations}
          >
            <Typo size={14} fontWeight="600" color={colors.white}>
              Refresh
            </Typo>
          </TouchableOpacity>
        </View>
      );
    }

    // Prepare data for FlatList based on selected tab
    const listData = selectedTab === 'direct' ? directListData : groupConversations;

    if (listData.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Typo size={16} color={colors.neutral600}>
            {selectedTab === 'direct' ? 'No conversations yet' : 'No groups yet'}
          </Typo>
          <Typo size={14} color={colors.neutral500} style={{ textAlign: 'center', marginTop: 8 }}>
            {selectedTab === 'direct' ? 'Tap on a contact below to start chatting' : 'Tap + to create a group'}
          </Typo>
        </View>
      );
    }

    return (
      <FlatList
        data={listData}
        keyExtractor={(item: any) => item._id}
        ListHeaderComponent={
          <SuggestionCarousel
            suggestions={suggestions}
            isProcessing={isProcessing}
            onAction={handleAction}
            onDismiss={dismiss}
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        renderItem={({ item, index }) => {
          if (selectedTab === 'direct') {
            if (item.participants && Array.isArray(item.participants)) {
              return (
                <SwipeableConversationItem
                  onMute={async () => {
                    const { muteConversation } = await import('@/services/conversationService');
                    const result = await muteConversation(item._id);
                    if (result.success) {
                      refreshConversations();
                    }
                  }}
                  onDelete={async () => {
                    Alert.alert(
                      'Delete Conversation',
                      'Are you sure you want to delete this conversation?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: async () => {
                            const { deleteConversation } = await import('@/services/conversationService');
                            const result = await deleteConversation(item._id);
                            if (result.success) {
                              refreshConversations();
                            }
                          },
                        },
                      ]
                    );
                  }}
                  isMuted={item.isMuted}
                >
                  <ConversationItem
                    item={item}
                    router={router}
                    showDivider={index < listData.length - 1}
                    onUpdate={refreshConversations}
                  />
                </SwipeableConversationItem>
              );
            } else {
              // Plain contact - check for stories
              const hasActiveStory = item.stories && item.stories.length > 0 &&
                item.stories.some((story: any) => new Date(story.expiresAt) > new Date());

              return (
                <TouchableOpacity
                  style={styles.userItem}
                  onPress={() => {
                    console.log('[DEBUG] TOUCH DETECTED for:', item.name);
                    startConversationWithUser(item);
                  }}
                  activeOpacity={0.7}
                >
                  <StatusRing
                    size={52}
                    hasStory={hasActiveStory || false}
                  >
                    <Avatar 
                      size={52} 
                      uri={item.avatar}
                      showOnline={true}
                      isOnline={isOnline(item._id)}
                    />
                  </StatusRing>
                  <View style={styles.userInfo}>
                    <Typo size={16} fontWeight="600" color={colors.neutral900}>
                      {item.name || item.email || 'Unknown User'}
                    </Typo>
                    <Typo size={13} color={colors.neutral400}>
                      Tap to start chatting
                    </Typo>
                  </View>
                </TouchableOpacity>
              );
            }
          } else {
            return (
              <SwipeableConversationItem
                onMute={async () => {
                  const { muteConversation } = await import('@/services/conversationService');
                  const result = await muteConversation(item._id);
                  if (result.success) {
                    refreshConversations();
                  }
                }}
                onDelete={async () => {
                  Alert.alert(
                    'Delete Group',
                    'Are you sure you want to leave this group?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Leave',
                        style: 'destructive',
                        onPress: async () => {
                          const { deleteConversation } = await import('@/services/conversationService');
                          const result = await deleteConversation(item._id);
                          if (result.success) {
                            refreshConversations();
                          }
                        },
                      },
                    ]
                  );
                }}
                isMuted={item.isMuted}
              >
                <ConversationItem
                  item={item}
                  router={router}
                  showDivider={index < listData.length - 1}
                  onUpdate={refreshConversations}
                />
              </SwipeableConversationItem>
            );
          }
        }}
        contentContainerStyle={styles.listContent}
      />
    );
  };

  const openNewGroupModal = () => {
    router.push({
      pathname: '/newConversationModal',
      params: { isGroup: '1' }
    });
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Typo size={18} fontWeight="400" color={colors.white}>
              Welcome back, <Typo size={18} fontWeight="700" color={colors.white}>{user?.name || 'User'}</Typo> 👑
            </Typo>
            <TouchableOpacity onPress={openProfile}>
              <Feather name="settings" size={24} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.contentContainer}>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tab,
                selectedTab === 'direct' && styles.activeTab,
              ]}
              onPress={() => setSelectedTab('direct')}
            >
              <Typo
                size={14}
                fontWeight="600"
                color={selectedTab === 'direct' ? colors.neutral900 : colors.neutral500}
              >
                Direct Messages
              </Typo>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tab,
                selectedTab === 'group' && styles.activeTab,
              ]}
              onPress={() => setSelectedTab('group')}
            >
              <Typo
                size={14}
                fontWeight="600"
                color={selectedTab === 'group' ? colors.neutral900 : colors.neutral500}
              >
                Groups
              </Typo>
            </TouchableOpacity>
          </View>

          {renderList()}
        </View>

        {/* Floating Action Button - Only show on Groups tab */}
        {selectedTab === 'group' && (
          <TouchableOpacity
            style={styles.fab}
            onPress={openNewGroupModal}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={28} color={colors.white} />
          </TouchableOpacity>
        )}

        {/* AI Suggestions Permission Gate */}
        <PermissionGate
          visible={showPermission && !permissionGranted}
          onGrant={() => {
            setPermissionGranted(true);
            setShowPermission(false);
          }}
          onDeny={() => setShowPermission(false)}
        />
      </View>
    </ScreenWrapper>
  );
};

export default Home;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._20,
    paddingBottom: 65,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
    marginHorizontal: 0,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._20,
    paddingBottom: spacingY._15,
    gap: 12,
    justifyContent: 'center',
  },
  tab: {
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._10,
    borderRadius: radius._20,
    backgroundColor: colors.neutral100,
  },
  activeTab: {
    backgroundColor: colors.primaryLight,
  },
  conversationList: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacingY._60,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacingX._40,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._15,
    gap: spacingX._12,
  },
  userInfo: {
    flex: 1,
  },
  divider: {
    position: 'absolute',
    bottom: 0,
    left: spacingX._20 + 50 + spacingX._12,
    right: spacingX._20,
    height: 1,
    backgroundColor: colors.neutral200,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._12,
    borderRadius: radius._20,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});

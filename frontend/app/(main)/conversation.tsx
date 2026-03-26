import ScreenWrapper from "@/components/ScreenWrapper";
import Typo from "@/components/Typo";
import { colors, spacingX, spacingY, radius } from "@/constants/theme";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
  Pressable,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/context/authContext";
import { verticalScale, scale } from "@/utils/styling";
import BackButton from "@/components/BackButton";
import Avatar from "@/components/Avatar";
import { Ionicons, Feather } from "@expo/vector-icons";
import Header from "@/components/Header";
import MessageItem from "@/components/MessageItem";
import Input from "@/components/Input";
import { uploadImageToCloudinary } from "@/services/imageService";
import { getSocket } from "@/socket/socket";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { VoiceRecorder } from "@/components/chat/VoiceRecorder";
import { VoiceMessageBubble } from "@/components/chat/VoiceMessageBubble";
import { PinnedMessageBanner } from "@/components/chat/PinnedMessageBanner";
import { EmojiReactionPicker } from "@/components/chat/EmojiReactionPicker";
import { ReactionBubble } from "@/components/chat/ReactionBubble";
import { audioService } from "@/services/audioService";
import { MessageType } from "@/types";
import { useAIChat } from '@/hooks/useAIChat';
import { AITypingIndicator } from '@/components/chat/AITypingIndicator';
import { AIMessageBubble } from '@/components/chat/AIMessageBubble';

const Conversation = () => {
  const { user: currentUser } = useAuth();
  const { isOnline, onlineUsers } = useOnlineStatus();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [reactionPicker, setReactionPicker] = useState({
    visible: false,
    messageId: '',
    position: { x: 0, y: 0 }
  });
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);

  const {
    id: conversationId,
    name,
    participants: stringifiedParticipants,
    avatar,
    type,
  } = useLocalSearchParams();

  const { isAITyping, insertAIMention } = useAIChat(conversationId as string);

  const participants = JSON.parse(stringifiedParticipants as string);

  const rawType = Array.isArray(type) ? type[0] : String(type || '');
  let isDirect = rawType === "direct";

  let conversationAvatar = Array.isArray(avatar) ? avatar[0] : avatar;

  const otherParticipant = isDirect
    ? participants.find((p: any) => p._id !== currentUser?.id)
    : null;

  if (isDirect && otherParticipant) {
    conversationAvatar = otherParticipant.avatar;
  }

  let conversationName = isDirect ? otherParticipant?.name : name;
  const otherUserId = isDirect ? otherParticipant?._id : null;

  const online = isDirect && otherUserId ? isOnline(otherUserId) : false;

  useEffect(() => {
    if (isDirect && otherUserId) {
      console.log('[Conversation] Online status for:', otherUserId, '=', online);
    }
  }, [isDirect, otherUserId, online, onlineUsers]);

  // ─── START CALL ───────────────────────────────────────────
  const startCall = (callType: 'voice' | 'video') => {
    if (!isDirect || !otherUserId) {
      Alert.alert('Error', 'Calls are only available in direct conversations');
      return;
    }

    console.log('[Conversation] ========== START CALL ==========');
    console.log('[Conversation] Current user ID:', currentUser?.id);
    console.log('[Conversation] Current user name:', currentUser?.name);
    console.log('[Conversation] Other user ID:', otherUserId);
    console.log('[Conversation] Call type:', callType);
    console.log('[Conversation] Conversation ID:', conversationId);

    const socket = getSocket();
    if (!socket || !socket.connected) {
      console.error('[Conversation] Socket not connected');
      Alert.alert('Error', 'Not connected to server');
      return;
    }

    console.log('[Conversation] Socket connected, socket ID:', socket.id);

    const roomId = `chatzi-${conversationId}-${Date.now()}`;
    console.log('[Conversation] Generated room ID:', roomId);

    const callData = {
      receiverId: String(otherUserId),
      callType,
      conversationId: String(conversationId),
      callerName: currentUser?.name || 'Unknown',
      callerAvatar: currentUser?.avatar || '',
      roomId,
    };

    console.log('[Conversation] Emitting initiateCall with data:', JSON.stringify(callData, null, 2));

    socket.emit('initiateCall', callData);

    socket.once('callInitiated', ({ callId }: any) => {
      router.push({
        pathname: '/callScreen',
        params: {
          callId: String(callId),
          roomId: String(roomId),
          callType: String(callType),
          name: String(conversationName || 'User'),
          avatar: String(conversationAvatar || ''),
          otherUserId: String(otherUserId || ''),
          conversationId: String(conversationId),
          isCaller: 'true',
        },
      });
    });

    socket.once('callResponse', (res: any) => {
      if (!res.success) {
        Alert.alert('Call Failed', res.msg || 'Unable to initiate call');
      }
    });
  };

  // ─── PICK FILE ────────────────────────────────────────────
  const onPickFile = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      aspect: [4, 3],
      quality: 0.5,
    });

    if (!result.canceled) {
      setSelectedFile(result.assets[0]);
    }
  };

  // ─── SEND MESSAGE ─────────────────────────────────────────
  const onSend = async () => {
    if (!message.trim() && !selectedFile) return;

    const socket = getSocket();
    if (!socket || !socket.connected) {
      Alert.alert('Error', 'Not connected to server');
      return;
    }

    const messageContent = message.trim();
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    const fileToUpload = selectedFile;

    try {
      setLoading(true);

      const optimisticMessage: MessageType = {
        id: tempId,
        sender: {
          id: currentUser?.id || '',
          name: currentUser?.name || '',
          avatar: currentUser?.avatar || null,
        },
        content: messageContent || '',
        attachment: fileToUpload ? fileToUpload.uri : null,
        createdAt: new Date().toISOString(),
        isMe: true,
      };

      setMessages(prev => [optimisticMessage, ...prev]);
      setMessage("");
      setSelectedFile(null);

      let attachment = null;
      if (fileToUpload) {
        try {
          attachment = await uploadImageToCloudinary(fileToUpload.uri);
        } catch {
          if (!messageContent) {
            Alert.alert('Error', 'Image upload failed. Please try again.');
            setLoading(false);
            setMessages(prev => prev.filter(m => m.id !== tempId));
            return;
          }
          Alert.alert('Warning', 'Image upload failed, sending text only');
        }
      }

      socket.emit('newMessage', {
        conversationId,
        sender: {
          id: currentUser?.id,
          name: currentUser?.name,
          avatar: currentUser?.avatar,
        },
        content: messageContent || '',
        attachment,
      });

      setLoading(false);
    } catch (error) {
      console.error('[Conversation] Send message error:', error);
      Alert.alert("Error", "Failed to send message");
      setLoading(false);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }
  };

  // ─── SEND VOICE MESSAGE ───────────────────────────────────
  const handleVoiceSend = async (uri: string, duration: number) => {
    try {
      console.log('[Conversation] Sending voice message...');
      setLoading(true);

      // Directly use the production URL — no URL manipulation
      const apiBaseUrl = 'https://chatzi-ilj9.onrender.com';
      
      console.log('[Conversation] Uploading to:', `${apiBaseUrl}/api/upload/voice`);
      const { audioUrl } = await audioService.uploadVoice(uri, duration, apiBaseUrl);

      console.log('[Conversation] Voice uploaded:', audioUrl);

      const socket = getSocket();
      if (!socket || !socket.connected) {
        throw new Error('Socket not connected');
      }

      socket.emit('voice:send', {
        conversationId,
        senderId: currentUser?.id,
        audioUrl,
        duration,
      });

      setLoading(false);
      console.log('[Conversation] Voice message sent');
    } catch (error) {
      console.error('[Conversation] Voice send error:', error);
      Alert.alert('Error', 'Failed to send voice message');
      setLoading(false);
    }
  };

  // ─── SOCKET SETUP ─────────────────────────────────────────
  useEffect(() => {
    if (!conversationId || !currentUser?.id) return;

    const socket = getSocket();
    if (!socket?.connected) {
      Alert.alert('Error', 'Not connected to server. Please restart the app.');
      return;
    }

    const onGetMessages = (data: any) => {
      if (data.success && data.data && data.data.length > 0) {
        const msgs = data.data.map((m: any) => ({
          id: m.id,
          sender: m.sender,
          content: m.content,
          attachment: m.attachment,
          type: m.type || 'text',
          audioUrl: m.audioUrl,
          audioDuration: m.audioDuration,
          createdAt: m.createdAt,
          isMe: m.sender.id === currentUser.id,
          isAI: m.isAI || m.sender?.name === 'Chatzi AI',
          isCallMessage: m.isCallMessage,
          callData: m.callData,
          reactions: m.reactions || [],
        }));
        setMessages(msgs);
      }
    };

    const onNewMessage = (data: any) => {
      if (data.success && data.data && data.data.conversationId === conversationId) {
        const msg = {
          id: data.data.id,
          sender: data.data.sender,
          content: data.data.content,
          attachment: data.data.attachment,
          type: data.data.type || 'text',
          audioUrl: data.data.audioUrl,
          audioDuration: data.data.audioDuration,
          createdAt: data.data.createdAt,
          isMe: data.data.sender.id === currentUser.id,
          isAI: data.data.isAI || data.data.sender?.name === 'Chatzi AI',
          isCallMessage: data.data.isCallMessage,
          callData: data.data.callData,
          reactions: data.data.reactions || [],
        };

        setMessages(prev => {
          const existsByRealId = prev.some(m => m.id === msg.id && !m.id.startsWith('temp_'));
          if (existsByRealId) return prev;

          if (msg.isMe) {
            const optimisticIndex = prev.findIndex(
              m => m.id.startsWith('temp_') &&
                m.content === msg.content &&
                m.sender.id === msg.sender.id
            );
            if (optimisticIndex !== -1) {
              const newList = [...prev];
              newList[optimisticIndex] = msg;
              return newList;
            }
          }

          return [msg, ...prev];
        });
      }
      setLoading(false);
    };

    const onNewCallMessage = (data: any) => {
      if (data.success && data.data && data.data.conversationId === conversationId) {
        const msg = {
          id: data.data.id,
          sender: data.data.sender,
          content: data.data.content,
          attachment: data.data.attachment,
          createdAt: data.data.createdAt,
          isMe: data.data.sender.id === currentUser.id,
          isCallMessage: data.data.isCallMessage,
          callData: data.data.callData,
        };

        setMessages(prev => {
          const exists = prev.some(m => m.id === msg.id);
          if (exists) return prev;
          return [msg, ...prev];
        });
      }
    };

    const onMarkAsRead = (data: any) => {
      if (data.success) {
        console.log('✓ Conversation marked as read');
      }
    };

    const onVoiceReceived = (data: any) => {
      if (data.success && data.data && data.data.conversationId === conversationId) {
        const msg = {
          id: data.data.id,
          sender: data.data.sender,
          content: '',
          type: 'voice' as const,
          audioUrl: data.data.audioUrl,
          audioDuration: data.data.audioDuration,
          createdAt: data.data.createdAt,
          isMe: data.data.sender.id === currentUser.id,
          reactions: [],
        };

        setMessages(prev => {
          const exists = prev.some(m => m.id === msg.id);
          if (exists) return prev;
          return [msg, ...prev];
        });
      }
    };

    const onMessagePinned = ({ message }: any) => {
      setPinnedMessages(prev => [message, ...prev].slice(0, 3));
    };

    const onMessageUnpinned = ({ messageId }: any) => {
      setPinnedMessages(prev => prev.filter(m => m._id !== messageId));
    };

    const onPinnedMessages = ({ data }: any) => {
      setPinnedMessages(data);
    };

    const onReactionUpdated = ({ messageId, reactions }: any) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, reactions } : m
      ));
    };

    socket.on('getMessages', onGetMessages);
    socket.on('newMessage', onNewMessage);
    socket.on('newCallMessage', onNewCallMessage);
    socket.on('markAsRead', onMarkAsRead);
    socket.on('voice:received', onVoiceReceived);
    socket.on('message:pinned', onMessagePinned);
    socket.on('message:unpinned', onMessageUnpinned);
    socket.on('pinnedMessages', onPinnedMessages);
    socket.on('reaction:updated', onReactionUpdated);

    socket.emit('joinConversation', conversationId);
    socket.emit('getMessages', { conversationId });
    socket.emit('getPinnedMessages', { conversationId });
    socket.emit('markAsRead', { conversationId });

    const pollTimer = setTimeout(() => {
      socket.emit('getMessages', { conversationId });
    }, 2000);

    return () => {
      clearTimeout(pollTimer);
      socket.off('getMessages', onGetMessages);
      socket.off('newMessage', onNewMessage);
      socket.off('newCallMessage', onNewCallMessage);
      socket.off('markAsRead', onMarkAsRead);
      socket.off('voice:received', onVoiceReceived);
      socket.off('message:pinned', onMessagePinned);
      socket.off('message:unpinned', onMessageUnpinned);
      socket.off('pinnedMessages', onPinnedMessages);
      socket.off('reaction:updated', onReactionUpdated);
    };
  }, [conversationId, currentUser?.id]);

  return (
    <ScreenWrapper showPattern={true} bgOpacity={0.5}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Header
          left={
            <View style={styles.headerLeft}>
              <BackButton />
              <Avatar
                size={40}
                uri={conversationAvatar as string}
                isGroup={rawType === "group"}
                {...(isDirect && { showOnline: true, isOnline: online })}
              />
              <Typo color={colors.white} fontWeight={"500"} size={22}>
                {conversationName}
              </Typo>
            </View>
          }
          right={
            <View style={styles.headerRight}>
              {isDirect && (
                <>
                  <TouchableOpacity
                    onPress={() => startCall('voice')}
                    style={styles.callButton}
                  >
                    <Feather name="phone" size={22} color={colors.white} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => startCall('video')}
                    style={styles.callButton}
                  >
                    <Feather name="video" size={22} color={colors.white} />
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity>
                <Ionicons name="ellipsis-vertical" size={24} color={colors.white} />
              </TouchableOpacity>
            </View>
          }
        />

        <View style={styles.content}>
          <PinnedMessageBanner
            pinnedMessages={pinnedMessages}
            onJumpToMessage={(id) => {
              console.log('[Conversation] Jump to message:', id);
            }}
            onUnpin={(id) => {
              const socket = getSocket();
              if (socket) {
                socket.emit('message:unpin', { messageId: id, conversationId });
              }
            }}
            isAdmin={true}
          />

          <AITypingIndicator visible={isAITyping} />

          <FlatList
            data={messages}
            inverted={true}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.messagesContent}
            renderItem={({ item }) => (
              <Pressable
                onLongPress={(e) => {
                  // Don't allow reactions on AI messages
                  if (item.isAI) return;
                  setReactionPicker({
                    visible: true,
                    messageId: item.id,
                    position: { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY },
                  });
                }}
              >
                {item.isAI ? (
                  <AIMessageBubble
                    content={item.content}
                    createdAt={item.createdAt}
                  />
                ) : item.type === 'voice' ? (
                  <VoiceMessageBubble
                    audioUrl={item.audioUrl!}
                    duration={item.audioDuration!}
                    isMine={item.isMe || false}
                  />
                ) : (
                  <MessageItem item={item} isDirect={isDirect} />
                )}

                {!item.isAI && (
                  <ReactionBubble
                    reactions={item.reactions || []}
                    currentUserId={currentUser?.id || ''}
                    onReact={(emoji) => {
                      const socket = getSocket();
                      if (socket) {
                        socket.emit('reaction:add', {
                          messageId: item.id,
                          emoji,
                          conversationId,
                          userId: currentUser?.id,
                        });
                      }
                    }}
                  />
                )}
              </Pressable>
            )}
            keyExtractor={(item) => item.id}
          />

          <View style={styles.footer}>
            <VoiceRecorder
              onVoiceSend={handleVoiceSend}
              onCancel={() => console.log('[Conversation] Voice cancelled')}
              isRecording={isRecordingVoice}
              onRecordingChange={setIsRecordingVoice}
            />

            {!isRecordingVoice && (
              <>
                <Input
                  value={message}
                  onChangeText={setMessage}
                  containerStyle={{
                    paddingLeft: spacingX._10,
                    paddingRight: scale(65),
                    borderWidth: 0,
                  }}
                  placeholder="Type message"
                  icon={
                    <TouchableOpacity style={styles.inputIcon} onPress={onPickFile}>
                      {selectedFile && selectedFile.uri && (
                        <Image
                          source={{ uri: selectedFile.uri }}
                          style={styles.selectedFile}
                        />
                      )}
                      <Ionicons
                        name="add"
                        color={colors.black}
                        size={verticalScale(22)}
                      />
                    </TouchableOpacity>
                  }
                />

                <TouchableOpacity
                  onPress={() => setMessage(prev => insertAIMention(prev))}
                  style={{
                    backgroundColor: 'rgba(99,102,241,0.12)',
                    borderRadius: 16,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderWidth: 1,
                    borderColor: 'rgba(99,102,241,0.25)',
                    marginRight: 8,
                  }}
                >
                  <Typo style={{ color: '#6366f1', fontWeight: '700', fontSize: 12 }}>
                    @ai
                  </Typo>
                </TouchableOpacity>

                <View style={styles.inputRightIcon}>
                  <TouchableOpacity style={styles.inputIcon} onPress={onSend}>
                    {loading ? (
                      <ActivityIndicator size="small" color={colors.black} />
                    ) : (
                      <Ionicons
                        name="paper-plane"
                        color={colors.black}
                        size={verticalScale(22)}
                      />
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>

        <EmojiReactionPicker
          visible={reactionPicker.visible}
          position={reactionPicker.position}
          onReact={(emoji) => {
            const socket = getSocket();
            if (socket) {
              socket.emit('reaction:add', {
                messageId: reactionPicker.messageId,
                emoji,
                conversationId,
                userId: currentUser?.id,
              });
            }
          }}
          onClose={() => setReactionPicker(p => ({ ...p, visible: false }))}
        />
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
};

export default Conversation;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingX._12,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingX._12,
  },
  callButton: {
    padding: 4,
  },
  inputRightIcon: {
    position: "absolute",
    right: scale(10),
    top: verticalScale(15),
    paddingLeft: spacingX._12,
    borderLeftWidth: 1.5,
    borderLeftColor: colors.neutral300,
  },
  selectedFile: {
    position: "absolute",
    height: verticalScale(38),
    width: verticalScale(38),
    borderRadius: radius.full,
    alignSelf: "center",
  },
  content: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius._50,
    borderTopRightRadius: radius._50,
    borderCurve: "continuous",
    overflow: "hidden",
    paddingHorizontal: spacingX._15,
  },
  inputIcon: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    padding: 8,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingX._12,
    paddingTop: spacingY._7,
    paddingBottom: verticalScale(22),
  },
  messagesContent: {
    paddingTop: spacingY._20,
    paddingBottom: spacingY._10,
    gap: spacingY._12,
  },
});
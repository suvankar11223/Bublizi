import { colors, spacingX, spacingY } from "@/constants/theme";
import { ConversationListItemProps } from "@/types";
import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View, Alert } from "react-native";
import Avatar from "./Avatar";
import Typo from "./Typo";
import { useAuth } from "@/context/authContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { StatusRing } from "./StatusRing";
import { ConversationMenu } from "./ConversationMenu";
import { Feather } from "@expo/vector-icons";
import { pinConversation, muteConversation, archiveConversation, deleteConversation } from "@/services/conversationService";

const ConversationItem = ({
  item,
  showDivider,
  router,
  onUpdate,
}: ConversationListItemProps) => {
  const { user: currentUser } = useAuth();
  const { isOnline } = useOnlineStatus();
  const [menuVisible, setMenuVisible] = useState(false);
  const [isPinned, setIsPinned] = useState(item.isPinned || false);
  const [isMuted, setIsMuted] = useState(item.isMuted || false);

  const openConversation = () => {
    router.push({
      pathname: "/conversation",
      params: {
        id: item._id,
        name: isDirect ? otherParticipant?.name : item.name,
        avatar: avatar,
        type: item.type,
        participants: JSON.stringify(item.participants),
      },
    });
  };

  const lastMessage: any = item.lastMessage;
  const isDirect = item.type === "direct";
  let avatar = item.avatar;
  const otherParticipant = isDirect
    ? item.participants.find((p) => p._id !== currentUser?.id)
    : null;
  if (isDirect && otherParticipant) avatar = otherParticipant?.avatar;

  const displayName = isDirect ? (otherParticipant?.name || 'Unknown') : (item?.name || 'Unknown');

  const online = isDirect ? isOnline(otherParticipant?._id || '') : false;

  const getLastMessageContent = () => {
    if (!lastMessage) return "Say hi 👋";
    return lastMessage?.attachment ? "📷 Image" : lastMessage.content;
  };

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff < 7) {
      return date.toLocaleDateString([], { weekday: 'short' }); // "Mon"
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }); // "Dec 12"
  };

  const getLastMessageDate = () => {
    if (!lastMessage?.createdAt) return null;
    return formatTime(lastMessage.createdAt);
  };

  const unreadCount = item.unreadCount || 0;
  const hasUnread = unreadCount > 0;

  // Check if other participant has active stories
  const hasActiveStory = isDirect && otherParticipant?.stories && otherParticipant.stories.length > 0 &&
    otherParticipant.stories.some(story => new Date(story.expiresAt) > new Date());

  const handlePin = async () => {
    const result = await pinConversation(item._id);
    if (result.success) {
      setIsPinned(result.isPinned);
      if (onUpdate) onUpdate();
    }
  };

  const handleMute = async () => {
    const result = await muteConversation(item._id);
    if (result.success) {
      setIsMuted(result.isMuted);
      if (onUpdate) onUpdate();
    }
  };

  const handleArchive = async () => {
    const result = await archiveConversation(item._id);
    if (result.success) {
      if (onUpdate) onUpdate();
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Delete Conversation',
      'Are you sure you want to delete this conversation? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteConversation(item._id);
            if (result.success && onUpdate) {
              onUpdate();
            }
          },
        },
      ]
    );
  };

  const menuOptions = [
    {
      icon: 'bookmark' as const,
      label: isPinned ? 'Unpin conversation' : 'Pin conversation',
      onPress: handlePin,
    },
    {
      icon: isMuted ? 'bell' as const : 'bell-off' as const,
      label: isMuted ? 'Unmute notifications' : 'Mute notifications',
      onPress: handleMute,
    },
    {
      icon: 'archive' as const,
      label: 'Archive',
      onPress: handleArchive,
    },
    {
      icon: 'trash-2' as const,
      label: 'Delete conversation',
      onPress: handleDelete,
      destructive: true,
    },
  ];

  return (
    <>
      <TouchableOpacity style={styles.container} onPress={openConversation}>
        {/* Avatar with Status Ring (only if has story) */}
        <View style={styles.avatarWrapper}>
          <StatusRing
            size={52}
            hasStory={hasActiveStory || false}
          >
            <Avatar 
              uri={avatar} 
              size={52} 
              isGroup={item.type === "group"}
              showOnline={item.type === "direct"}
              isOnline={online}
            />
          </StatusRing>
        </View>

        {/* Middle: name + last message */}
        <View style={styles.content}>
          <Typo
            size={16}
            fontWeight={hasUnread ? "700" : "600"}
            color={colors.neutral900}
            textProps={{ numberOfLines: 1 }}
          >
            {displayName}
          </Typo>
          <Typo
            size={13}
            color={hasUnread ? colors.neutral700 : colors.neutral500}
            fontWeight={hasUnread ? "500" : "400"}
            textProps={{ numberOfLines: 1 }}
          >
            {getLastMessageContent()}
          </Typo>
        </View>

        {/* Right: time + badge + menu */}
        <View style={styles.right}>
          <View style={styles.rightTop}>
            {lastMessage && (
              <Typo 
                size={11} 
                color={hasUnread ? colors.primary : colors.neutral400}
                fontWeight={hasUnread ? "600" : "400"}
              >
                {getLastMessageDate()}
              </Typo>
            )}
            <TouchableOpacity
              onPress={() => setMenuVisible(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.menuButton}
            >
              <Feather name="more-vertical" size={18} color={colors.neutral500} />
            </TouchableOpacity>
          </View>
          {hasUnread && (
            <View style={styles.badge}>
              <Typo size={11} fontWeight="700" color={colors.white}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Typo>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {showDivider && <View style={styles.divider} />}
      
      <ConversationMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        options={menuOptions}
      />
    </>
  );
};

export default ConversationItem;

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingHorizontal: spacingX._20,
    paddingVertical: spacingY._12,
    alignItems: "center",
    backgroundColor: colors.white,
  },
  avatarWrapper: {
    marginRight: spacingX._12,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  right: {
    alignItems: "flex-end",
    gap: 6,
    minWidth: 60,
  },
  rightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuButton: {
    padding: 2,
  },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  divider: {
    height: 1,
    backgroundColor: colors.neutral100,
    marginLeft: spacingX._20 + 52 + spacingX._12,
  },
});

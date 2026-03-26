import { Router } from "expo-router";
import { ReactNode } from "react";
import {
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  TouchableOpacityProps,
  ViewStyle,
} from "react-native";

export type TypoProps = {
  size?: number;
  color?: string;
  fontWeight?: TextStyle["fontWeight"];
  children: any | null;
  style?: TextStyle;
  textProps?: TextProps;
};

export interface UserProps {
  email: string;
  name: string;
  avatar?: string | null;
  id?: string;
  // Add any additional fields from the token payload as needed
}
export interface UserDataProps {
  name: string;
  email: string;
  avatar?: any;
}

export interface InputProps extends TextInputProps {
  icon?: React.ReactNode;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  inputRef?: React.RefObject<TextInput>;
  //   label?: string;
  //   error?: string;
}

export interface DecodedTokenProps {
  userId: string;
  email: string;
  name: string;
  exp: number;
  iat: number;
}

export type AuthContextProps = {
  token: string | null;
  user: UserProps | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    name: string,
    avatar?: string
  ) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateToken: (token: string) => Promise<void>;
  refreshUser: (userData: UserProps) => void;
  refreshToken?: () => Promise<string | null>;
};

export type ScreenWrapperProps = {
  style?: ViewStyle;
  children: React.ReactNode;
  isModal?: boolean;
  showPattern?: boolean;
  bgOpacity?: number;
};

export type ResponseProps = {
  success: boolean;
  data?: any;
  msg?: string;
};

export interface ButtonProps extends TouchableOpacityProps {
  style?: ViewStyle;
  onPress?: () => void;
  loading?: boolean;
  children: React.ReactNode;
}

export type BackButtonProps = {
  style?: ViewStyle;
  color?: string;
  iconSize?: number;
};

export type AvatarProps = {
  size?: number;
  uri: string | null;
  style?: ViewStyle;
  isGroup?: boolean;
};

export type HeaderProps = {
  title?: string;
  style?: ViewStyle;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export type ConversationListItemProps = {
  item: ConversationProps;
  showDivider: boolean;
  isGroup?: boolean;
  router: Router;
  onUpdate?: () => void;
};

export type ConversationProps = {
  _id: string;
  type: "direct" | "group";
  avatar: string | null;
  participants: {
    _id: string;
    name: string;
    avatar: string;
    email: string;
    stories?: {
      _id: string;
      mediaUrl: string;
      mediaType: 'image' | 'video';
      caption?: string;
      viewers: string[];
      expiresAt: string;
      createdAt: string;
    }[];
  }[];
  name?: string;
  lastMessage?: {
    _id: string;
    content: string;
    senderId: string;
    type: "text" | "image" | "file";
    attachment?: string;
    createdAt: string;
  };
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
  // User-specific metadata
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
};

export type MessageProps = {
  id: string;
  sender: {
    id: string;
    name: string;
    avatar: string | null;
  };
  content: string;
  attachment?: string | null;
  type?: 'text' | 'image' | 'voice';
  audioUrl?: string;
  audioDuration?: number;
  isMe?: boolean;
  createdAt: string;
  isCallMessage?: boolean;
  callData?: {
    type: 'voice' | 'video';
    duration?: number;
    status?: 'completed' | 'missed' | 'declined';
  };
  reactions?: {
    emoji: string;
    count: number;
    users: string[];
  }[];
  isAI?: boolean;
};

// Alias for MessageType (used in Conversation screen)
export type MessageType = MessageProps;

// Call types
export type CallType = "audio" | "video";

export type CallStatus = "idle" | "calling" | "ringing" | "connected" | "ended" | "declined" | "missed";

export interface CallData {
  callId: string;
  callerId: string;
  callerName?: string;
  callerAvatar?: string;
  calleeId: string;
  calleeName?: string;
  calleeAvatar?: string;
  type: CallType;
  status: CallStatus;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
}

export interface CallHistoryItem {
  _id: string;
  callerId: {
    _id: string;
    name: string;
    avatar?: string;
    email: string;
  };
  calleeId: {
    _id: string;
    name: string;
    avatar?: string;
    email: string;
  };
  conversationId?: {
    _id: string;
    name: string;
    avatar: string;
  };
  type: CallType;
  status: "initiated" | "ringing" | "connected" | "ended" | "missed" | "declined";
  startTime?: string;
  endTime?: string;
  duration?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CallContextProps {
  // Call state
  currentCall: CallData | null;
  incomingCall: CallData | null;
  callStatus: CallStatus;
  
  // Media state
  isMuted: boolean;
  isSpeakerOn: boolean;
  isCameraOn: boolean;
  
  // Local and remote streams
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  
  // Call history
  callHistory: CallHistoryItem[];
  
  // Actions
  initiateCall: (calleeId: string, type: CallType, conversationId?: string) => Promise<void>;
  acceptCall: (callId: string) => Promise<void>;
  declineCall: (callId: string) => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleCamera: () => void;
  fetchCallHistory: (limit?: number, offset?: number) => Promise<void>;
}

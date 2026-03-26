import AsyncStorage from "@react-native-async-storage/async-storage";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
let connectionPromise: Promise<Socket> | null = null;
let reconnectAttempts = 0;
let isConnecting = false;

// Debug logging helper
const logDebug = (message: string, ...args: any[]) => {
  console.log(`[Socket:${new Date().toISOString()}]`, message, ...args);
};

// Get socket URL from network utility
const getSocketURL = async (): Promise<string> => {
  try {
    // Get the full server URL including protocol
    const { getApiUrl } = await import("@/constants");
    const apiUrl = await getApiUrl();
    // Remove /api suffix to get base URL
    const baseUrl = apiUrl.replace('/api', '');
    
    // For socket connection, use the same base URL but without https:// prefix issue
    let socketUrl = baseUrl;
    
    // If it's an ngrok URL, keep https, otherwise use http for local
    if (baseUrl.includes('ngrok') || baseUrl.includes('render')) {
      // Keep the https for cloud URLs
      socketUrl = baseUrl;
    } else {
      // For local, ensure http
      socketUrl = baseUrl.replace('https://', 'http://');
    }
    
    logDebug('Socket URL resolved:', socketUrl);
    return socketUrl;
  } catch {
    logDebug('Failed to get socket URL, using fallback');
    return "https://chatzi-1m0m.onrender.com";
  }
};

/**
 * Attempt to connect to socket server with retry logic
 */
export const connectSocket = async (): Promise<Socket> => {
  // If already connecting, return the existing promise
  if (connectionPromise && isConnecting) {
    return connectionPromise;
  }

  const token = await AsyncStorage.getItem("token");

  if (!token) {
    throw new Error("No token found. User must login first");
  }

  // If already connected, return existing socket
  if (socket && socket.connected) {
    return socket;
  }

  isConnecting = true;

  // Disconnect old socket if exists but not connected
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  const SOCKET_URL = await getSocketURL();

  // Create the socket connection with improved settings
  socket = io(SOCKET_URL, {
    auth: {
      token
    },
    transports: ["websocket", "polling"], // WebSocket first for HTTPS
    reconnection: true,
    reconnectionAttempts: Infinity, // Never give up reconnecting
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
    forceNew: true,
    autoConnect: true,
    secure: SOCKET_URL.startsWith('https'), // Use secure connection for HTTPS
  });

  // Connection events - minimal logging
  socket.on("connect", () => {
    logDebug('Socket connected successfully', socket?.id);
    isConnecting = false;
    reconnectAttempts = 0;
    connectionPromise = null;
  });

  socket.on("connect_error", () => {
    logDebug('Socket connection error');
    isConnecting = false;
    reconnectAttempts++;
  });

  socket.on("disconnect", (reason) => {
    logDebug('Socket disconnected:', reason);
    if (reason === "io client disconnect") {
      socket?.connect();
    }
  });

  socket.on("reconnect", (attemptNumber) => {
    logDebug('Socket reconnected after', attemptNumber, 'attempts');
    socket?.emit("rejoinConversations");
  });

  socket.on("reconnect_failed", () => {
    logDebug('Socket reconnection failed after all attempts');
    isConnecting = false;
    connectionPromise = null;
  });

  socket.on("connect_timeout", () => {
    logDebug('Socket connection timeout');
  });

  // Create a promise that resolves when connected or after timeout
  connectionPromise = new Promise((resolve) => {
    if (socket?.connected) {
      resolve(socket);
      return;
    }

    const onConnect = () => {
      socket?.off("connect", onConnect);
      socket?.off("connect_error", onError);
      isConnecting = false;
      resolve(socket!);
    };

    const onError = () => {
      isConnecting = false;
    };

    socket?.on("connect", onConnect);
    socket?.on("connect_error", onError);

    // Timeout after 15 seconds - keep trying in background
    setTimeout(() => {
      if (socket?.connected) {
        resolve(socket);
      } else {
        resolve(socket!);
      }
    }, 15000);
  });

  return connectionPromise;
};

/**
 * Disconnect from socket server
 */
export const disconnectSocket = () => {
  isConnecting = false;
  connectionPromise = null;
  reconnectAttempts = 0;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

/**
 * Get the current socket instance
 */
export const getSocket = (): Socket | null => {
  return socket;
};

/**
 * Check if socket is connected
 */
export const isSocketConnected = (): boolean => {
  return socket?.connected || false;
};

/**
 * Emit an event through the socket
 */
export const emitEvent = (event: string, data?: any) => {
  if (socket && socket.connected) {
    socket.emit(event, data);
  }
};

/**
 * Listen for an event
 */
export const onEvent = (event: string, callback: (data: any) => void) => {
  if (socket) {
    socket.on(event, callback);
  }
};

/**
 * Remove event listener
 */
export const offEvent = (event: string, callback?: (data: any) => void) => {
  if (socket) {
    if (callback) {
      socket.off(event, callback);
    } else {
      socket.off(event);
    }
  }
};

// Specific event emitters
export const sendMessage = (conversationId: string, message: any) => {
  emitEvent("sendMessage", { conversationId, message });
};

export const joinConversation = (conversationId: string) => {
  emitEvent("joinConversation", conversationId);
};

export const leaveConversation = (conversationId: string) => {
  emitEvent("leaveConversation", conversationId);
};

export const sendTypingIndicator = (conversationId: string, isTyping: boolean) => {
  emitEvent("typing", { conversationId, isTyping });
};

export const markMessageAsRead = (conversationId: string, messageId: string) => {
  emitEvent("messageRead", { conversationId, messageId });
};

export const setUserOnline = () => {
  emitEvent("userOnline", {});
};

export const setUserOffline = () => {
  emitEvent("userOffline", {});
};

/**
 * Manually trigger a reconnection attempt
 */
export const reconnectSocket = async (): Promise<Socket | null> => {
  disconnectSocket();
  reconnectAttempts = 0;
  try {
    return await connectSocket();
  } catch {
    return null;
  }
};

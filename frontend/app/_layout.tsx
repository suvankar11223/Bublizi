import React, { useEffect } from 'react'
import { Stack, useRouter, usePathname } from 'expo-router'
import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo'
import * as SecureStore from 'expo-secure-store'
import { AuthProvider, useAuth } from '@/context/authContext'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getSocket } from '@/socket/socket'

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!

if (!publishableKey) {
  throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in .env')
}

// Token cache for Clerk
const tokenCache = {
  async getToken(key: string) {
    try {
      return SecureStore.getItemAsync(key)
    } catch {
      return null
    }
  },
  async saveToken(key: string, value: string) {
    try {
      return SecureStore.setItemAsync(key, value)
    } catch {
      return
    }
  },
}

const InitialLayout = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    const checkInitialRoute = async () => {
      try {
        if (pathname === '/') {
          const token = await AsyncStorage.getItem('token');
          if (token) {
            router.replace('/(main)/home');
          } else {
            router.replace('/(auth)/welcome');
          }
        }
      } catch (error) {
        console.error('Error checking initial route:', error);
        if (pathname === '/') {
          router.replace('/(auth)/welcome');
        }
      }
    };

    checkInitialRoute();
  }, [pathname, router]);

  useEffect(() => {
    const socket = getSocket();
    console.log('[_layout] ========== INCOMING CALL SETUP ==========');
    console.log('[_layout] Socket exists:', !!socket);
    console.log('[_layout] Socket connected:', socket?.connected);
    console.log('[_layout] User ID:', user?.id);
    console.log('[_layout] Current pathname:', pathname);
    
    if (!socket || !user?.id) {
      console.log('[_layout] ❌ Not setting up incoming call listener - missing socket or user');
      return;
    }

    console.log('[_layout] ✅ Setting up incoming call listener for user:', user.id);

    const handleIncomingCall = (data: any) => {
      console.log('[IncomingCall] ========== INCOMING CALL RECEIVED ==========');
      console.log('[IncomingCall] ✅ Received event data:', JSON.stringify(data, null, 2));
      console.log('[IncomingCall] Current pathname:', pathname);
      console.log('[IncomingCall] Navigating to /incomingCall');
      
      router.push({
        pathname: '/incomingCall',
        params: {
          callId: String(data.callId),
          callerId: String(data.callerId),
          callerName: String(data.callerName),
          callerAvatar: String(data.callerAvatar || ''),
          callType: String(data.callType),
          roomId: String(data.roomId),
          conversationId: String(data.conversationId),
        },
      });
      
      console.log('[IncomingCall] ✅ Navigation triggered');
    };

    socket.on('incomingCall', handleIncomingCall);
    console.log('[_layout] ✅ Incoming call listener registered');
    console.log('[_layout] ========== SETUP COMPLETE ==========');
    
    return () => { 
      console.log('[_layout] 🧹 Removing incoming call listener');
      socket.off('incomingCall', handleIncomingCall); 
    };
  }, [user?.id, router, pathname]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(main)" options={{ headerShown: false }} />
    </Stack>
  );
};

const RootLayout = () => {
  return (
    <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
      <ClerkLoaded>
        <AuthProvider>
          <InitialLayout />
        </AuthProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
};

export default RootLayout;

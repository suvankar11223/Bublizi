import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, StatusBar, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getSocket } from '@/socket/socket';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/authContext';
import { getServerUrl } from '@/utils/network';

export default function CallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth(); // Get current user from context
  
  const callId = String(params.callId || '');
  const roomId = String(params.roomId || '');
  const callType = String(params.callType || 'video');
  const name = String(params.name || 'User');
  const otherUserId = String(params.otherUserId || '');
  const isCaller = params.isCaller === 'true';
  const conversationId = String(params.conversationId || '');
  
  const [callUrl, setCallUrl] = useState<string | null>(null);

  // Helper to navigate back to conversation or home
  const navigateBack = useCallback(() => {
    if (conversationId) {
      // Go back to the conversation screen
      router.back();
    } else {
      // Fallback to home if no conversationId
      router.replace('/(main)/home');
    }
  }, [conversationId, router]);

  useEffect(() => {
    buildCallUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildCallUrl = async () => {
    const token = await AsyncStorage.getItem('token');
    const serverUrl = await getServerUrl(); // Use dynamic server URL instead of hardcoded
    const userId = user?.id || ''; // Use user from context
    const conversationId = String(params.conversationId || '');

    console.log('[CallScreen] ========== BUILD CALL URL ==========');
    console.log('[CallScreen] userId:', userId);
    console.log('[CallScreen] conversationId:', conversationId);
    console.log('[CallScreen] roomId:', roomId);
    console.log('[CallScreen] callType:', callType);

    // Build URL pointing to the HTML page served by your backend
    const url = `${serverUrl}/call.html?roomId=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(userId)}&isCaller=${isCaller}&callType=${callType}&serverUrl=${encodeURIComponent(serverUrl)}&token=${encodeURIComponent(token || '')}&name=${encodeURIComponent(name)}&conversationId=${encodeURIComponent(conversationId)}`;
    
    console.log('[CallScreen] ========== FULL CALL URL ==========');
    console.log('[CallScreen] URL:', url);
    console.log('[CallScreen] URL length:', url.length);
    console.log('[CallScreen] ==========================================');
    
    setCallUrl(url);
  };

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onCallEnded = (data: any) => {
      if (data.callId === callId) {
        Alert.alert('Call Ended', `${name} ended the call`, [
          { text: 'OK', onPress: navigateBack }
        ]);
      }
    };

    socket.on('callEnded', onCallEnded);
    return () => { socket.off('callEnded', onCallEnded); };
  }, [callId, name, navigateBack]);

  const handleMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('[CallScreen] ========== WEBVIEW MESSAGE ==========');
      console.log('[CallScreen] Message type:', data.type);
      console.log('[CallScreen] Message data:', JSON.stringify(data, null, 2));
      
      if (data.type === 'debug') {
        console.log('[CallScreen] DEBUG from WebView:', data.message);
        return;
      }
      
      if (data.type === 'endCall' || data.type === 'callEnded') {
        console.log('[CallScreen] Call ended, handling cleanup');
        
        const socket = getSocket();
        const conversationId = String(params.conversationId || '');
        const userId = user?.id || ''; // Use user from context
        
        console.log('[CallScreen] conversationId:', conversationId);
        console.log('[CallScreen] userId (caller):', userId);
        console.log('[CallScreen] roomId:', roomId);
        console.log('[CallScreen] callType:', callType);
        
        // Send endCallRoom from React Native (backup for WebView socket)
        if (socket && conversationId && userId) {
          const callData = {
            conversationId,
            callerId: userId, // Current user's ID from context
            duration: data.duration || 0,
            callType,
            status: 'completed',
          };
          
          console.log('[CallScreen] Emitting endCallRoom with data:', JSON.stringify(callData, null, 2));
          
          socket.emit('endCallRoom', {
            roomId,
            callData,
          });
          
          console.log('[CallScreen] ✅ endCallRoom emitted');
        } else {
          console.error('[CallScreen] ❌ Cannot emit endCallRoom');
          console.error('[CallScreen] socket:', !!socket);
          console.error('[CallScreen] conversationId:', conversationId);
          console.error('[CallScreen] userId:', userId);
        }
        
        // Also send endCall to the other user
        if (socket && callId) {
          socket.emit('endCall', { callId, otherUserId });
        }
        
        console.log('[CallScreen] Navigating back');
        navigateBack();
      }
    } catch (error) {
      console.error('[CallScreen] Error handling WebView message:', error);
    }
  };

  if (!callUrl) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <WebView
        source={{ uri: callUrl }}
        style={styles.webview}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        mixedContentMode="always"
        thirdPartyCookiesEnabled={true}
        sharedCookiesEnabled={true}
        cacheEnabled={false}
        onMessage={handleMessage}
        onConsoleMessage={(event: any) => {
          console.log('[WebView Console]', event.nativeEvent.message);
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[WebView Error]', JSON.stringify(nativeEvent));
          Alert.alert('Error', 'Call failed. Please try again.', [
            { text: 'OK', onPress: navigateBack }
          ]);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[WebView HTTP Error]', nativeEvent.statusCode, nativeEvent.url);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  webview: { flex: 1 },
});

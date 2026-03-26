import { getApiUrl } from '@/utils/network';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const pinConversation = async (conversationId: string): Promise<{ success: boolean; isPinned: boolean }> => {
  try {
    const token = await AsyncStorage.getItem('token');
    const apiUrl = await getApiUrl();
    
    const response = await fetch(`${apiUrl}/api/conversations/${conversationId}/pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();
    return { success: data.success, isPinned: data.data?.isPinned || false };
  } catch (error) {
    console.error('[conversationService] Error pinning conversation:', error);
    return { success: false, isPinned: false };
  }
};

export const muteConversation = async (conversationId: string): Promise<{ success: boolean; isMuted: boolean }> => {
  try {
    const token = await AsyncStorage.getItem('token');
    const apiUrl = await getApiUrl();
    
    const response = await fetch(`${apiUrl}/api/conversations/${conversationId}/mute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();
    return { success: data.success, isMuted: data.data?.isMuted || false };
  } catch (error) {
    console.error('[conversationService] Error muting conversation:', error);
    return { success: false, isMuted: false };
  }
};

export const archiveConversation = async (conversationId: string): Promise<{ success: boolean; isArchived: boolean }> => {
  try {
    const token = await AsyncStorage.getItem('token');
    const apiUrl = await getApiUrl();
    
    const response = await fetch(`${apiUrl}/api/conversations/${conversationId}/archive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();
    return { success: data.success, isArchived: data.data?.isArchived || false };
  } catch (error) {
    console.error('[conversationService] Error archiving conversation:', error);
    return { success: false, isArchived: false };
  }
};

export const deleteConversation = async (conversationId: string): Promise<{ success: boolean }> => {
  try {
    const token = await AsyncStorage.getItem('token');
    const apiUrl = await getApiUrl();
    
    const response = await fetch(`${apiUrl}/api/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();
    return { success: data.success };
  } catch (error) {
    console.error('[conversationService] Error deleting conversation:', error);
    return { success: false };
  }
};

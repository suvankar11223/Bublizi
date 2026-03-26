import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "../utils/network";

// Track if we're currently refreshing to prevent multiple refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

/**
 * Refresh the authentication token
 * Returns new token or null if refresh fails
 */
const refreshAuthToken = async (): Promise<string | null> => {
  // If already refreshing, wait for that promise to complete
  if (isRefreshing && refreshPromise) {
    const token = await refreshPromise;
    return token;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const currentToken = await AsyncStorage.getItem("token");
      if (!currentToken) {
        console.log('[API] No token to refresh');
        return null;
      }

      const apiUrl = await getApiUrl();
      
      // Try to refresh token
      const response = await fetch(`${apiUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data?.accessToken) {
          const newToken = result.data.accessToken;
          await AsyncStorage.setItem('token', newToken);
          console.log('[API] ✅ Token refreshed successfully');
          return newToken;
        }
      }

      console.log('[API] ❌ Token refresh failed');
      return null;
    } catch (error) {
      console.error('[API] Token refresh error:', error);
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

export const apiFetch = async (endpoint: string, options: any = {}, retryCount = 0): Promise<any> => {
  const apiUrl = await getApiUrl();
  const token = await AsyncStorage.getItem("token");

  const res = await fetch(`${apiUrl}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  // Handle 401 Unauthorized - token expired
  if (res.status === 401 && retryCount === 0) {
    console.log('[API] 401 Unauthorized - attempting token refresh');
    
    const newToken = await refreshAuthToken();
    
    if (newToken) {
      // Retry request with new token
      console.log('[API] Retrying request with new token');
      return apiFetch(endpoint, options, retryCount + 1);
    } else {
      // Refresh failed - user needs to re-login
      console.log('[API] Token refresh failed - user needs to re-login');
      // Clear token and redirect to login (handled by auth context)
      await AsyncStorage.removeItem('token');
      throw new Error('Authentication expired. Please login again.');
    }
  }

  const json = await res.json();
  return json;
};

export const apiService = {
  async get(endpoint: string) {
    return apiFetch(endpoint, { method: 'GET' });
  },
  
  async post(endpoint: string, data?: any) {
    return apiFetch(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  },
  
  async put(endpoint: string, data?: any) {
    return apiFetch(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  },
  
  async delete(endpoint: string) {
    return apiFetch(endpoint, { method: 'DELETE' });
  }
};

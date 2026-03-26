import { AuthContextProps, UserProps } from "@/types";
import React, { createContext, ReactNode, useState, useEffect, useRef, useContext, useCallback } from "react";
import { useRouter, useSegments } from "expo-router";
import { useUser, useAuth as useClerkAuth } from '@clerk/clerk-expo';
import { connectSocket, disconnectSocket, getSocket } from "@/socket/socket";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const AuthContext = createContext<AuthContextProps>({
  token: null,
  user: null,
  signIn: async (_email: string, _password: string) => {},
  signUp: async (_email: string, _password: string, _name: string, _avatar?: string) => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  updateToken: async (_token: string) => {},
  refreshUser: (_userData: UserProps) => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { user: clerkUser, isLoaded: isUserLoaded } = useUser();
  const { getToken, signOut: clerkSignOut } = useClerkAuth();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProps | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  // ✅ Use ref instead of state for profileFetched — avoids re-render loop
  const profileFetchedRef = useRef(false);
  const router = useRouter();
  const segments = useSegments();

  // Preload contacts and conversations after login
  const preloadData = async (token: string) => {
    try {
      console.log('[Auth] Preloading contacts and conversations...');
      const { fetchContactsFromAPI, fetchConversationsFromAPI } = await import('@/services/contactsService');
      
      // Fire both in parallel
      Promise.all([
        fetchContactsFromAPI(token).catch(() => []),
        fetchConversationsFromAPI(token).catch(() => []),
      ]).then(([contacts, conversations]) => {
        console.log('[Auth] Preloaded:', contacts.length, 'contacts,', conversations.length, 'conversations');
      }).catch(() => {});
    } catch (err) {
      console.log('[Auth] Preload error:', err);
    }
  };

  // Load Clerk user and token - only fetch profile once
  useEffect(() => {
    if (!isUserLoaded) return;

    const loadClerkData = async () => {
      try {
        // Check for stored JWT token first (from phone OTP)
        const storedToken = await AsyncStorage.getItem('token');
        
        if (storedToken && !clerkUser) {
          // JWT token exists but no Clerk user - phone OTP login
          console.log('[Auth] Found JWT token, loading phone user profile');
          setToken(storedToken);
          
          try {
            const { getApiUrl } = await import('@/constants');
            const apiUrl = await getApiUrl();
            
            const response = await fetch(`${apiUrl}/user/profile`, {
              headers: {
                'Authorization': `Bearer ${storedToken}`,
              },
            });
            
            if (response.ok) {
              const result = await response.json();
              if (result.success && result.data) {
                const userObj: UserProps = {
                  id: result.data.id,
                  email: result.data.email,
                  name: result.data.name,
                  avatar: result.data.avatar || undefined,
                };
                setUser(userObj);
                profileFetchedRef.current = true;
                console.log('[Auth] ✅ Phone user profile loaded, MongoDB ID:', userObj.id);
                
                // Connect socket and preload data
                connectSocket().catch((err) => {
                  console.error('[Auth] Socket connection failed:', err);
                });
                preloadData(storedToken).catch(() => {});
              }
            } else {
              // Invalid token, remove it
              await AsyncStorage.removeItem('token');
              setToken(null);
              setUser(null);
            }
          } catch (error) {
            console.error('[Auth] Error loading phone user profile:', error);
            await AsyncStorage.removeItem('token');
            setToken(null);
            setUser(null);
          }
          
          if (!isInitialized) {
            setIsInitialized(true);
          }
          return;
        }

        if (clerkUser) {
          // Always get fresh token (Google OAuth tokens expire faster)
          const clerkToken = await getToken({ skipCache: true });
          
          if (clerkToken) {
            console.log('[Auth] Got fresh Clerk token');
            setToken(clerkToken);
            
            // Store token in AsyncStorage FIRST before fetching profile
            await AsyncStorage.setItem('token', clerkToken);
            console.log('[Auth] Token stored in AsyncStorage');
            
            // ✅ Always update live socket's auth token (fixes reconnect loop)
            const existingSocket = getSocket();
            if (existingSocket) {
              (existingSocket as any).auth = { token: clerkToken };
              console.log('[Auth] Updated live socket auth token');
            }
            
            // Only fetch profile if not already fetched
            if (!profileFetchedRef.current) {
              // Fetch user profile from backend to get MongoDB ID
              try {
                const { getApiUrl } = await import('@/constants');
                const apiUrl = await getApiUrl();
                console.log('[Auth] Fetching profile from:', `${apiUrl}/user/profile`);
                
                const response = await fetch(`${apiUrl}/user/profile`, {
                  headers: {
                    'Authorization': `Bearer ${clerkToken}`,
                  },
                });
                
                if (response.ok) {
                  const result = await response.json();
                  if (result.success && result.data) {
                    // Use MongoDB user data
                    const userObj: UserProps = {
                      id: result.data.id, // MongoDB ObjectId
                      email: result.data.email,
                      name: result.data.name,
                      avatar: result.data.avatar || clerkUser.imageUrl || undefined,
                    };
                    setUser(userObj);
                    profileFetchedRef.current = true;
                    console.log('[Auth] ✅ User profile loaded, MongoDB ID:', userObj.id);
                    
                    // ✅ Preload contacts and conversations in background
                    preloadData(clerkToken).catch(() => {});
                  } else {
                    throw new Error('Failed to get user profile');
                  }
                } else {
                  const errorText = await response.text();
                  console.error('[Auth] Profile fetch failed:', response.status, errorText);
                  throw new Error('Profile fetch failed');
                }
              } catch (profileError) {
                console.error('[Auth] Error fetching profile, using Clerk fallback:', profileError);
                console.warn('[Auth] ⚠️ Using Clerk ID as fallback — calls may not work correctly!');
                // Fallback to Clerk data temporarily
                setUser({
                  id: clerkUser.id, // ⚠️ Clerk ID, not MongoDB ID
                  email: clerkUser.primaryEmailAddress?.emailAddress || '',
                  name: clerkUser.firstName || clerkUser.username || 'User',
                  avatar: clerkUser.imageUrl || undefined,
                });
                profileFetchedRef.current = true;
                
                // Try to fetch profile again after a delay
                setTimeout(async () => {
                  try {
                    const { getApiUrl } = await import('@/constants');
                    const apiUrl = await getApiUrl();
                    const freshToken = await getToken({ skipCache: true });
                    
                    if (freshToken) {
                      const response = await fetch(`${apiUrl}/user/profile`, {
                        headers: { 'Authorization': `Bearer ${freshToken}` },
                      });
                      
                      if (response.ok) {
                        const result = await response.json();
                        if (result.success && result.data) {
                          console.log('[Auth] ✅ Retry got MongoDB ID:', result.data.id);
                          setUser({
                            id: result.data.id,
                            email: result.data.email,
                            name: result.data.name,
                            avatar: result.data.avatar || clerkUser.imageUrl || undefined,
                          });
                          
                          // ✅ Preload data after retry
                          preloadData(freshToken).catch(() => {});
                        }
                      }
                    }
                  } catch (retryError) {
                    console.error('[Auth] Retry failed:', retryError);
                  }
                }, 2000);
              }
            }
            
            // Try to connect socket (don't block)
            connectSocket().catch((err) => {
              console.error('[Auth] Socket connection failed:', err);
            });
          }
        } else {
          console.log('[Auth] No Clerk user, clearing state');
          setToken(null);
          setUser(null);
          profileFetchedRef.current = false;
          await AsyncStorage.removeItem('token');
        }
      } catch (error) {
        console.error('[Auth] Error loading Clerk data:', error);
        setToken(null);
        setUser(null);
        profileFetchedRef.current = false;
        await AsyncStorage.removeItem('token');
      } finally {
        if (!isInitialized) {
          setIsInitialized(true);
        }
      }
    };

    loadClerkData();
    // ✅ profileFetched removed from deps — prevents the re-render loop
  }, [clerkUser, isUserLoaded, getToken, isInitialized]);

  // Check phone verification status
  const checkPhoneVerificationStatus = useCallback(async () => {
    if (!token) return;

    try {
      // Check cache first (avoid repeated API calls)
      const cachedStatus = await AsyncStorage.getItem('phoneVerified');
      if (cachedStatus === 'true') {
        console.log('[Auth] Phone verified (cached), going to home');
        router.replace('/(main)/home');
        return;
      }

      // Check with backend
      const { getApiUrl } = await import('@/constants');
      const apiUrl = await getApiUrl();
      
      const response = await fetch(`${apiUrl}/api/phone/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        if (data.data.hasPhone) {
          // User has verified phone, cache and go to main app
          await AsyncStorage.setItem('phoneVerified', 'true');
          router.replace('/(main)/home');
        } else {
          // User needs to verify phone
          router.replace('/(auth)/phoneVerification');
        }
      } else {
        // Error checking status, default to main app
        router.replace('/(main)/home');
      }
    } catch (error) {
      console.error('[Auth] Error checking phone status:', error);
      // On error, default to main app
      router.replace('/(main)/home');
    }
  }, [token, router]);

  // Handle navigation based on auth state and phone verification
  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inMainGroup = segments[0] === '(main)';

    if (!inAuthGroup && !inMainGroup) return;

    if (!token && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (token && inAuthGroup) {
      // Check if user needs phone verification
      checkPhoneVerificationStatus();
    }
  }, [token, segments, isInitialized, router, checkPhoneVerificationStatus]);

  const updateToken = async (newToken: string) => {
    setToken(newToken);
  };

  // These functions are kept for compatibility but Clerk handles auth
  const signIn = async (_email: string, _password: string) => {
    // Clerk handles this in login.tsx
    throw new Error('Use Clerk useSignIn hook in login.tsx');
  };

  const signUp = async (
    _email: string,
    _password: string,
    _name: string,
    _avatar?: string
  ) => {
    // Clerk handles this in register.tsx
    throw new Error('Use Clerk useSignUp hook in register.tsx');
  };

  const signInWithGoogle = async () => {
    // Clerk handles OAuth - not implemented yet
    throw new Error('Google Sign-In not implemented with Clerk yet');
  };

  const signOut = async () => {
    console.log('[Auth] Signing out...');
    disconnectSocket();
    
    // Sign out from Clerk if user is signed in with Clerk
    if (clerkUser) {
      await clerkSignOut();
    }
    
    setToken(null);
    setUser(null);
    profileFetchedRef.current = false;
    await AsyncStorage.removeItem('token');
    router.replace("/(auth)/welcome");
  };

  const refreshUser = (userData: UserProps) => {
    console.log('[Auth] Refreshing user data:', userData);
    setUser((prevUser) => {
      const updatedUser = {
        ...prevUser,
        ...userData,
      };
      console.log('[Auth] User updated:', updatedUser);
      return updatedUser;
    });
  };

  const refreshToken = async (): Promise<string | null> => {
    try {
      // For JWT tokens (phone OTP), return existing token
      const storedToken = await AsyncStorage.getItem('token');
      if (storedToken && !clerkUser) {
        return storedToken;
      }
      
      // For Clerk tokens, refresh
      if (!clerkUser) return null;
      const freshToken = await getToken({ skipCache: true });
      if (freshToken) {
        setToken(freshToken);
        await AsyncStorage.setItem('token', freshToken);
        // ✅ Also update live socket
        const existingSocket = getSocket();
        if (existingSocket) {
          (existingSocket as any).auth = { token: freshToken };
        }
        return freshToken;
      }
      return null;
    } catch (error) {
      console.error('[Auth] Error refreshing token:', error);
      return null;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        updateToken,
        refreshUser,
        refreshToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

import { AuthContextProps, UserProps } from "@/types";
import { createContext, ReactNode, useState, useEffect, useContext } from "react";
import { useRouter, useSegments } from "expo-router";
import { useUser, useAuth as useClerkAuth } from '@clerk/clerk-expo';
import { connectSocket, disconnectSocket } from "@/socket/socket";
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
  const [profileFetched, setProfileFetched] = useState(false); // Track if profile was fetched
  const router = useRouter();
  const segments = useSegments();

  // Load Clerk user and token - only fetch profile once
  useEffect(() => {
    if (!isUserLoaded) return;

    const loadClerkData = async () => {
      try {
        if (clerkUser) {
          // Always get fresh token (Google OAuth tokens expire faster)
          const clerkToken = await getToken({ skipCache: true });
          
          if (clerkToken) {
            console.log('[Auth] Got fresh Clerk token');
            setToken(clerkToken);
            
            // Store token in AsyncStorage FIRST before fetching profile
            await AsyncStorage.setItem('token', clerkToken);
            console.log('[Auth] Token stored in AsyncStorage');
            
            // Only fetch profile if not already fetched
            if (!profileFetched) {
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
                    setProfileFetched(true);
                    console.log('[Auth] User profile loaded from backend:', userObj.id);
                    console.log('[Auth] User name:', userObj.name);
                    console.log('[Auth] User avatar:', userObj.avatar);
                  } else {
                    throw new Error('Failed to get user profile');
                  }
                } else {
                  const errorText = await response.text();
                  console.error('[Auth] Profile fetch failed:', response.status, errorText);
                  throw new Error('Profile fetch failed');
                }
              } catch (profileError) {
                console.error('[Auth] Error fetching profile, using Clerk data:', profileError);
                console.error('[Auth] ⚠️ WARNING: Using Clerk ID as fallback - calls may not work!');
                // Fallback to Clerk data
                const userObj: UserProps = {
                  id: clerkUser.id, // ⚠️ This is Clerk ID, not MongoDB ID
                  email: clerkUser.primaryEmailAddress?.emailAddress || '',
                  name: clerkUser.firstName || clerkUser.username || 'User',
                  avatar: clerkUser.imageUrl || undefined,
                };
                setUser(userObj);
                setProfileFetched(true);
                
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
                          console.log('[Auth] ✅ Retry successful - got MongoDB ID:', result.data.id);
                          setUser({
                            id: result.data.id, // MongoDB ObjectId
                            email: result.data.email,
                            name: result.data.name,
                            avatar: result.data.avatar || clerkUser.imageUrl || undefined,
                          });
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
          setProfileFetched(false);
          // Clear token from AsyncStorage when logged out
          await AsyncStorage.removeItem('token');
        }
      } catch (error) {
        console.error('[Auth] Error loading Clerk data:', error);
        setToken(null);
        setUser(null);
        setProfileFetched(false);
        await AsyncStorage.removeItem('token');
      } finally {
        if (!isInitialized) {
          setIsInitialized(true);
        }
      }
    };

    loadClerkData();
  }, [clerkUser, isUserLoaded, profileFetched, getToken, isInitialized]);

  // Handle navigation based on auth state
  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inMainGroup = segments[0] === '(main)';

    if (!inAuthGroup && !inMainGroup) return;

    if (!token && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (token && inAuthGroup) {
      router.replace('/(main)/home');
    }
  }, [token, segments, isInitialized, router]);

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
    await clerkSignOut();
    setToken(null);
    setUser(null);
    setProfileFetched(false); // Reset profile fetched flag
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
      if (!clerkUser) return null;
      const freshToken = await getToken({ skipCache: true });
      if (freshToken) {
        setToken(freshToken);
        await AsyncStorage.setItem('token', freshToken);
        console.log('[Auth] Token refreshed successfully');
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

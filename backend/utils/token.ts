import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  email?: string;
  name?: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generate access and refresh tokens for a user
 * 🔒 SECURITY FIX: Short-lived access token + long-lived refresh token
 * 
 * @param userId - The user's MongoDB ObjectId as a string
 * @param email - Optional user email
 * @param name - Optional user name
 */
export const generateTokenPair = (
  userId: string, 
  email?: string, 
  name?: string
): TokenPair => {
  const payload: TokenPayload = {
    userId,
    email,
    name
  };

  // Access token: 15 minutes (short-lived for security)
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: '15m'
  });

  // Refresh token: 30 days (long-lived, stored securely)
  const refreshToken = jwt.sign(
    { userId }, // Only userId in refresh token
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET as string,
    { expiresIn: '30d' }
  );

  return { accessToken, refreshToken };
};

/**
 * Generate a JWT token for a user (backward compatibility)
 * @deprecated Use generateTokenPair instead
 */
export const generateToken = (
  userId: string, 
  email?: string, 
  name?: string
): string => {
  const payload: TokenPayload = {
    userId,
    email,
    name
  };

  // Generate token with 7 days expiry for production use
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: '7d'
  });
};

/**
 * Verify a JWT token and return the decoded payload
 */
export const verifyToken = (token: string): TokenPayload | null => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as TokenPayload;
    return decoded;
  } catch (error) {
    console.error("[DEBUG] Token verification failed:", error);
    return null;
  }
};

/**
 * Verify a refresh token
 */
export const verifyRefreshToken = (token: string): { userId: string } | null => {
  try {
    const decoded = jwt.verify(
      token, 
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET as string
    ) as { userId: string };
    return decoded;
  } catch (error) {
    console.error("[DEBUG] Refresh token verification failed:", error);
    return null;
  }
};


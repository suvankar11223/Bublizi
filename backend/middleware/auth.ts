import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { clerkClient } from '@clerk/clerk-sdk-node';

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, msg: 'Access token required' });
  }

  try {
    // Try to verify as Clerk token first
    try {
      // Verify the Clerk session token - simplified approach
      const payload = await clerkClient.verifyToken(token);
      
      if (payload && payload.sub) {
        // Get user from Clerk
        const clerkUser = await clerkClient.users.getUser(payload.sub);
        
        console.log('='.repeat(60));
        console.log('[AUTH] Clerk user retrieved:');
        console.log('[AUTH]   - id:', clerkUser.id);
        console.log('[AUTH]   - email:', clerkUser.emailAddresses[0]?.emailAddress);
        console.log('[AUTH]   - firstName:', clerkUser.firstName);
        console.log('[AUTH]   - username:', clerkUser.username);
        console.log('[AUTH]   - imageUrl:', clerkUser.imageUrl);
        console.log('[AUTH]   - imageUrl type:', typeof clerkUser.imageUrl);
        console.log('[AUTH]   - profileImageUrl:', clerkUser.profileImageUrl);
        console.log('='.repeat(60));
        
        (req as any).user = {
          id: clerkUser.id,
          userId: clerkUser.id, // For backward compatibility
          email: clerkUser.emailAddresses[0]?.emailAddress,
          name: clerkUser.firstName || clerkUser.username || 'User',
          avatar: clerkUser.imageUrl || clerkUser.profileImageUrl || null,
        };
        
        console.log('[AUTH] Set req.user.avatar to:', (req as any).user.avatar);
        
        return next();
      }
    } catch (clerkError) {
      // If Clerk verification fails, try JWT (for backward compatibility)
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      (req as any).user = decoded;
      return next();
    }
  } catch (error) {
    return res.status(403).json({ success: false, msg: 'Invalid or expired token' });
  }
};


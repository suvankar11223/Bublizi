import { Request, Response } from 'express';
import User from '../modals/userModal.js';
import { getFirebaseAdmin } from '../config/firebaseAdmin.js';
import { generateToken } from '../utils/token.js';
import { resetPhoneRateLimit } from '../middleware/phoneRateLimit.js';
import { firebaseCircuitBreaker } from '../utils/circuitBreaker.js';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
  };
}

/**
 * Verify Firebase phone auth token and link phone to user account
 * POST /api/phone/verify
 * Body: { firebaseIdToken: string }
 */
export const verifyPhoneNumber = async (req: AuthRequest, res: Response): Promise<void> => {
  const { firebaseIdToken } = req.body;
  const userId = req.user?.id;

  if (!firebaseIdToken) {
    res.status(400).json({ success: false, msg: 'Firebase ID token is required' });
    return;
  }

  if (!userId) {
    res.status(401).json({ success: false, msg: 'User not authenticated' });
    return;
  }

  try {
    // Verify Firebase ID token with circuit breaker protection
    const admin = getFirebaseAdmin();
    const decodedToken: any = await firebaseCircuitBreaker.execute(() =>
      Promise.race([
        admin.auth().verifyIdToken(firebaseIdToken),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Firebase timeout')), 5000)
        ),
      ])
    );
    const phoneNumber = decodedToken.phone_number;

    if (!phoneNumber) {
      res.status(400).json({ success: false, msg: 'No phone number in Firebase token' });
      return;
    }

    console.log('[PhoneVerify] Verified phone:', phoneNumber, 'for user:', userId);

    // Check if phone number is already used by another user
    const existingUser = await User.findOne({
      phoneNumber,
      _id: { $ne: userId },
    });

    if (existingUser) {
      res.status(400).json({ 
        success: false, 
        msg: 'This phone number is already linked to another account' 
      });
      return;
    }

    // Update user with verified phone number
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        phoneNumber,
        isPhoneVerified: true,
        contactsSyncedAt: new Date(),
      },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      res.status(404).json({ success: false, msg: 'User not found' });
      return;
    }

    console.log('[PhoneVerify] Phone linked successfully:', phoneNumber);

    // Reset rate limit on successful verification
    await resetPhoneRateLimit(userId);

    res.status(200).json({
      success: true,
      msg: 'Phone number verified successfully',
      data: {
        id: updatedUser._id,
        email: updatedUser.email,
        name: updatedUser.name,
        avatar: updatedUser.avatar,
        phoneNumber: updatedUser.phoneNumber,
        isPhoneVerified: updatedUser.isPhoneVerified,
      },
    });
  } catch (error: any) {
    console.error('[PhoneVerify] Error:', error);
    
    // Check if circuit breaker is open
    if (error.message?.includes('Circuit breaker')) {
      res.status(503).json({
        success: false,
        msg: 'Phone verification service temporarily unavailable. Please try again in a moment.',
        retryAfter: firebaseCircuitBreaker.getRetryAfter(),
      });
      return;
    }
    
    if (error.code === 'auth/id-token-expired') {
      res.status(401).json({ success: false, msg: 'Firebase token expired. Please try again.' });
      return;
    }
    
    if (error.code === 'auth/argument-error') {
      res.status(400).json({ success: false, msg: 'Invalid Firebase token' });
      return;
    }

    res.status(500).json({ success: false, msg: 'Phone verification failed' });
  }
};

/**
 * Check if user has verified phone number
 * GET /api/phone/status
 */
export const getPhoneStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ success: false, msg: 'User not authenticated' });
    return;
  }

  try {
    const user = await User.findById(userId).select('phoneNumber isPhoneVerified');

    if (!user) {
      res.status(404).json({ success: false, msg: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        hasPhone: !!user.phoneNumber && user.isPhoneVerified,
        phoneNumber: user.phoneNumber,
        isPhoneVerified: user.isPhoneVerified,
      },
    });
  } catch (error) {
    console.error('[PhoneStatus] Error:', error);
    res.status(500).json({ success: false, msg: 'Failed to get phone status' });
  }
};

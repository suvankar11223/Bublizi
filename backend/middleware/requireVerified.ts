import { Request, Response, NextFunction } from 'express';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    isEmailVerified?: boolean;
  };
}

// Email verification gate - blocks unverified users from sensitive actions
export const requireVerified = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        msg: 'Authentication required' 
      });
    }

    // For now, we'll allow all authenticated users
    // TODO: Implement email verification system
    // if (!user.isEmailVerified) {
    //   return res.status(403).json({ 
    //     success: false, 
    //     msg: 'Email verification required. Please check your inbox.',
    //     code: 'EMAIL_NOT_VERIFIED'
    //   });
    // }

    next();
  } catch (error) {
    console.error('[RequireVerified] Error:', error);
    return res.status(500).json({ 
      success: false, 
      msg: 'Error verifying email status' 
    });
  }
};

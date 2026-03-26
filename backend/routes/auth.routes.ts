import { Router, Request, Response } from "express";
import { registerUser, loginUser, forgotPassword, resetPassword } from "../controller/auth.controller.js";
import { loginRateLimit, resetLoginRateLimit } from "../middleware/loginRateLimit.js";
import { validateUserRegistration } from "../middleware/validation.js";
import { verifyRefreshToken, generateTokenPair } from "../utils/token.js";

const router = Router();

// Test endpoint for connection verification
router.get("/test", (req: Request, res: Response) => {
  res.json({ success: true, message: "Server is reachable" });
});

// Auth routes with validation
router.post("/register", validateUserRegistration, registerUser);
router.post("/login", loginRateLimit, async (req: Request, res: Response) => {
  await loginUser(req, res);
  // Reset rate limit on successful login
  if (res.statusCode === 200) {
    resetLoginRateLimit(req);
  }
});

// Password reset routes
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// 🔒 SECURITY FIX: Token refresh endpoint
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken || typeof refreshToken !== 'string') {
      res.status(400).json({
        success: false,
        msg: 'Refresh token is required',
      });
      return;
    }
    
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    
    if (!decoded) {
      res.status(401).json({
        success: false,
        msg: 'Invalid or expired refresh token',
      });
      return;
    }
    
    // Get user from database
    const { default: User } = await import('../modals/userModal.js');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      res.status(401).json({
        success: false,
        msg: 'User not found',
      });
      return;
    }
    
    // Generate new token pair
    const tokens = generateTokenPair(
      user._id.toString(),
      user.email,
      user.name
    );
    
    res.json({
      success: true,
      ...tokens,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    });
  } catch (error: any) {
    console.error('[Auth] Refresh token error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to refresh token',
    });
  }
});

export default router;

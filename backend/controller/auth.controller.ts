import { Request, Response } from "express";
import User from "../modals/userModal.js";
import { generateToken } from "../utils/token.js";
import crypto from "crypto";
import { securityMonitor } from "../services/securityMonitor.js";
import { auditLogger } from "../services/auditLog.js";
import { validatePassword, addToPasswordHistory, validatePasswordChange } from "../utils/passwordPolicy.js";

interface AuthRequest extends Request {
  userId?: string;
}

export const registerUser = async (req: Request, res: Response): Promise<void> => {
  const { email, password, name, avatar } = req.body;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  // Debug: Log incoming request
  console.log("[DEBUG] Register request received:", { email, name });

  // Validate input
  if (!email || !password || !name) {
    res.status(400).json({ 
      success: false, 
      msg: "Please provide all required fields: email, password, name" 
    });
    return;
  }

  // Validate email format
  const emailRegex = /^\S+@\S+\.\S+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({ 
      success: false, 
      msg: "Please provide a valid email address" 
    });
    return;
  }

  // 🔒 PHASE 3: Validate password strength
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    await auditLogger.logAuth(
      'auth.login.failure',
      undefined,
      email,
      ip,
      false,
      { reason: 'weak_password', errors: passwordValidation.errors }
    );
    
    res.status(400).json({ 
      success: false, 
      msg: "Password does not meet security requirements",
      errors: passwordValidation.errors,
      strength: passwordValidation.strength,
    });
    return;
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      console.log("[DEBUG] User already exists:", email);
      res.status(400).json({ success: false, msg: "User with this email already exists" });
      return;
    }

    // Create new user (password will be hashed by pre-save middleware)
    const user = new User({
      email: email.toLowerCase(),
      password,
      name: name.trim(),
      avatar: avatar || "",
      created: new Date()
    });

    await user.save();
    console.log("[DEBUG] User created successfully:", user._id);

    // 🔒 PHASE 3: Add password to history
    await addToPasswordHistory(user._id.toString(), password);

    // 🔒 PHASE 3: Log successful registration
    await auditLogger.logAuth(
      'auth.login.success',
      user._id.toString(),
      user.email,
      ip,
      true,
      { action: 'register' }
    );

    // Generate JWT token
    const token = generateToken(user._id.toString(), user.email, user.name);

    res.status(201).json({ 
      success: true, 
      msg: "User registered successfully", 
      token,
      data: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        created: user.created
      }
    });
  } catch (error: any) {
    console.error("[DEBUG] Register error:", error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      res.status(400).json({ 
        success: false, 
        msg: messages.join(", ") 
      });
      return;
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      res.status(400).json({ 
        success: false, 
        msg: "User with this email already exists" 
      });
      return;
    }

    res.status(500).json({ success: false, msg: "Server error during registration" });
  }
};

export const loginUser = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  // Debug: Log incoming request
  console.log("[DEBUG] Login request received:", { email, ip });

  // Validate input
  if (!email || !password) {
    res.status(400).json({ 
      success: false, 
      msg: "Please provide email and password" 
    });
    return;
  }

  try {
    // 🔒 PHASE 3: Check if IP is blocked
    const isBlocked = await securityMonitor.isBlocked(ip);
    if (isBlocked) {
      const blockInfo = await securityMonitor.getBlockInfo(ip);
      console.log("[SECURITY] Blocked IP attempted login:", { ip, email });
      
      await auditLogger.logSecurity(
        'security.ip.blocked',
        ip,
        'login_attempt_while_blocked',
        { email, expiresIn: blockInfo.expiresIn }
      );
      
      res.status(429).json({ 
        success: false, 
        msg: `Too many failed login attempts. Please try again in ${Math.ceil((blockInfo.expiresIn || 0) / 60)} minutes.`,
        blockedUntil: blockInfo.expiresIn,
      });
      return;
    }

    // Check if user exists
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log("[DEBUG] User not found:", email);
      
      // 🔒 PHASE 3: Track failed attempt
      await securityMonitor.trackFailedLogin(ip, email);
      await auditLogger.logAuth(
        'auth.login.failure',
        undefined,
        email,
        ip,
        false,
        { reason: 'user_not_found' }
      );
      
      res.status(400).json({ success: false, msg: "Invalid credentials" });
      return;
    }

    // Check password using bcrypt compare
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log("[DEBUG] Password mismatch for:", email);
      
      // 🔒 PHASE 3: Track failed attempt
      await securityMonitor.trackFailedLogin(ip, email);
      await auditLogger.logAuth(
        'auth.login.failure',
        user._id.toString(),
        email,
        ip,
        false,
        { reason: 'invalid_password' }
      );
      
      res.status(400).json({ success: false, msg: "Invalid credentials" });
      return;
    }

    console.log("[DEBUG] Login successful:", user._id);

    // 🔒 PHASE 3: Clear failed attempts and log success
    await securityMonitor.trackSuccessfulLogin(ip, email);
    await auditLogger.logAuth(
      'auth.login.success',
      user._id.toString(),
      email,
      ip,
      true
    );

    // Generate JWT token
    const token = generateToken(user._id.toString(), user.email, user.name);

    res.status(200).json({ 
      success: true, 
      msg: "Login successful", 
      token,
      data: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        created: user.created
      }
    });
  } catch (error: any) {
    console.error("[DEBUG] Login error:", error);
    res.status(500).json({ success: false, msg: "Server error during login" });
  }
};

// ============================================================================
// PASSWORD RESET FLOW - Secure implementation with 15-minute expiry
// ============================================================================

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  console.log("[ForgotPassword] Request received for:", email);

  if (!email) {
    res.status(400).json({ 
      success: false, 
      msg: "Please provide email address" 
    });
    return;
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return success to prevent email enumeration
    if (!user) {
      console.log("[ForgotPassword] User not found, but returning success");
      res.status(200).json({ 
        success: true, 
        msg: "If an account exists with this email, a password reset link has been sent." 
      });
      return;
    }

    // Generate secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Hash token before storing (prevents token theft from DB breach)
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Store hashed token with 15-minute expiry
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    user.resetPasswordUsed = false;
    await user.save();

    console.log("[ForgotPassword] Reset token generated for:", email);

    // TODO: Send email with reset link
    // const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    // await sendEmail(user.email, 'Password Reset', resetUrl);

    // For now, log the token (REMOVE IN PRODUCTION)
    console.log("[ForgotPassword] Reset token (REMOVE IN PROD):", resetToken);
    console.log("[ForgotPassword] Reset URL:", `http://localhost:3000/reset-password?token=${resetToken}`);

    res.status(200).json({ 
      success: true, 
      msg: "If an account exists with this email, a password reset link has been sent.",
      // REMOVE IN PRODUCTION - only for testing
      ...(process.env.NODE_ENV === 'development' && { resetToken })
    });
  } catch (error: any) {
    console.error("[ForgotPassword] Error:", error);
    res.status(500).json({ 
      success: false, 
      msg: "Error processing password reset request" 
    });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const { token, newPassword } = req.body;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  console.log("[ResetPassword] Request received");

  if (!token || !newPassword) {
    res.status(400).json({ 
      success: false, 
      msg: "Please provide reset token and new password" 
    });
    return;
  }

  // 🔒 PHASE 3: Validate password strength
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    res.status(400).json({ 
      success: false, 
      msg: "Password does not meet security requirements",
      errors: passwordValidation.errors,
      strength: passwordValidation.strength,
    });
    return;
  }

  try {
    // Hash the token to match stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }, // Not expired
      resetPasswordUsed: false, // Not already used
    });

    if (!user) {
      console.log("[ResetPassword] Invalid or expired token");
      res.status(400).json({ 
        success: false, 
        msg: "Invalid or expired reset token. Please request a new password reset." 
      });
      return;
    }

    // 🔒 PHASE 3: Check password history
    const passwordCheck = await validatePasswordChange(user._id.toString(), newPassword);
    if (passwordCheck.reused) {
      await auditLogger.logAuth(
        'auth.password.reset',
        user._id.toString(),
        user.email,
        ip,
        false,
        { reason: 'password_reused' }
      );
      
      res.status(400).json({ 
        success: false, 
        msg: "Password was used recently. Please choose a different password.",
      });
      return;
    }

    // Update password (will be hashed by pre-save hook)
    user.password = newPassword;
    
    // Mark token as used and clear reset fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.resetPasswordUsed = true;
    
    await user.save();

    // 🔒 PHASE 3: Add to password history and log
    await addToPasswordHistory(user._id.toString(), newPassword);
    await auditLogger.logAuth(
      'auth.password.reset',
      user._id.toString(),
      user.email,
      ip,
      true
    );

    console.log("[ResetPassword] Password reset successful for:", user.email);

    res.status(200).json({ 
      success: true, 
      msg: "Password reset successful. You can now login with your new password." 
    });
  } catch (error: any) {
    console.error("[ResetPassword] Error:", error);
    res.status(500).json({ 
      success: false, 
      msg: "Error resetting password" 
    });
  }
};

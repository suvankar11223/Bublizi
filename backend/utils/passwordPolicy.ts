/**
 * Password Policy Enforcement (PHASE 3)
 * 
 * Enforces strong password requirements:
 * - Minimum length
 * - Character complexity
 * - Common password check
 * - Password history
 */

import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

// Common passwords to reject (top 100 most common)
const COMMON_PASSWORDS = new Set([
  'password', '123456', '12345678', 'qwerty', 'abc123', 'monkey', '1234567',
  'letmein', 'trustno1', 'dragon', 'baseball', 'iloveyou', 'master', 'sunshine',
  'ashley', 'bailey', 'passw0rd', 'shadow', '123123', '654321', 'superman',
  'qazwsx', 'michael', 'football', 'welcome', 'jesus', 'ninja', 'mustang',
  'password1', '123456789', '12345', '1234', '111111', '1234567890', 'admin',
  'welcome123', 'root', 'toor', 'pass', 'test', 'guest', 'info', 'adm',
  'mysql', 'user', 'administrator', 'oracle', 'ftp', 'pi', 'puppet', 'ansible',
  'ec2-user', 'vagrant', 'azureuser', 'admin123', 'password123', 'changeme',
]);

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong' | 'very-strong';
  score: number; // 0-100
}

/**
 * Validate password against policy
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  let score = 0;
  
  // Check minimum length (8 characters)
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  } else {
    score += 20;
    
    // Bonus for longer passwords
    if (password.length >= 12) score += 10;
    if (password.length >= 16) score += 10;
  }
  
  // Check for uppercase letter
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  } else {
    score += 15;
  }
  
  // Check for lowercase letter
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  } else {
    score += 15;
  }
  
  // Check for number
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  } else {
    score += 15;
  }
  
  // Check for special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*...)');
  } else {
    score += 15;
  }
  
  // Check against common passwords
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Password is too common and easily guessable');
    score = Math.min(score, 30); // Cap score for common passwords
  }
  
  // Check for sequential characters
  if (/(.)\1{2,}/.test(password)) {
    errors.push('Password should not contain repeated characters (e.g., "aaa", "111")');
    score -= 10;
  }
  
  // Check for sequential patterns
  if (
    /012|123|234|345|456|567|678|789|890/.test(password) ||
    /abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/i.test(password)
  ) {
    errors.push('Password should not contain sequential patterns (e.g., "123", "abc")');
    score -= 10;
  }
  
  // Determine strength
  let strength: 'weak' | 'medium' | 'strong' | 'very-strong';
  if (score < 40) {
    strength = 'weak';
  } else if (score < 60) {
    strength = 'medium';
  } else if (score < 80) {
    strength = 'strong';
  } else {
    strength = 'very-strong';
  }
  
  return {
    valid: errors.length === 0,
    errors,
    strength,
    score: Math.max(0, Math.min(100, score)),
  };
}

/**
 * Hash password for storage in history
 */
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Check if password was used before
 */
export async function checkPasswordHistory(
  userId: string,
  password: string,
  historySize: number = 5
): Promise<boolean> {
  try {
    const key = `password:history:${userId}`;
    const passwordHash = hashPassword(password);
    
    // Get password history
    const history = await redis.get(key);
    if (!history) {
      return false; // No history, password is new
    }
    
    const hashes: string[] = JSON.parse(history);
    return hashes.includes(passwordHash);
  } catch (error: any) {
    logger.error('Failed to check password history', {
      error: error.message,
      userId,
    });
    return false; // Fail open
  }
}

/**
 * Add password to history
 */
export async function addToPasswordHistory(
  userId: string,
  password: string,
  historySize: number = 5
): Promise<void> {
  try {
    const key = `password:history:${userId}`;
    const passwordHash = hashPassword(password);
    
    // Get existing history
    const history = await redis.get(key);
    let hashes: string[] = history ? JSON.parse(history) : [];
    
    // Add new hash
    hashes.unshift(passwordHash);
    
    // Keep only last N passwords
    hashes = hashes.slice(0, historySize);
    
    // Store updated history (expires in 1 year)
    await redis.set(key, JSON.stringify(hashes), { ex: 365 * 24 * 60 * 60 });
    
    logger.info('Password added to history', { userId, historySize: hashes.length });
  } catch (error: any) {
    logger.error('Failed to add password to history', {
      error: error.message,
      userId,
    });
  }
}

/**
 * Validate password change
 */
export async function validatePasswordChange(
  userId: string,
  newPassword: string
): Promise<PasswordValidationResult & { reused: boolean }> {
  const validation = validatePassword(newPassword);
  const reused = await checkPasswordHistory(userId, newPassword);
  
  if (reused) {
    validation.errors.push('Password was used recently. Please choose a different password.');
    validation.valid = false;
  }
  
  return {
    ...validation,
    reused,
  };
}

/**
 * Generate strong password suggestion
 */
export function generateStrongPassword(length: number = 16): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  const allChars = uppercase + lowercase + numbers + special;
  
  let password = '';
  
  // Ensure at least one of each type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Check if password meets minimum requirements (quick check)
 */
export function meetsMinimumRequirements(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) &&
    !COMMON_PASSWORDS.has(password.toLowerCase())
  );
}

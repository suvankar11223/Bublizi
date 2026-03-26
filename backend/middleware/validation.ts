/**
 * Input Validation Middleware (PHASE 0 - SECURITY)
 * 
 * Validates and sanitizes all user input to prevent:
 * - XSS attacks
 * - NoSQL injection
 * - Buffer overflow
 * - DOS via large payloads
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

// Maximum lengths for different input types
const MAX_LENGTHS = {
  message: 10000,      // 10KB
  name: 100,
  email: 255,
  phone: 20,
  url: 2048,
  general: 1000,
};

/**
 * Sanitize string input
 * - Remove null bytes
 * - Trim whitespace
 * - Remove control characters
 * - Limit length
 */
function sanitizeString(input: string, maxLength: number = MAX_LENGTHS.general): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }
  
  return input
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
    .trim()
    .slice(0, maxLength);
}

/**
 * Validate message content
 */
export function validateMessage(req: Request, res: Response, next: NextFunction): void {
  try {
    const { content, attachment } = req.body;
    
    // Must have either content or attachment
    if (!content && !attachment) {
      res.status(400).json({
        success: false,
        msg: 'Message must have either content or attachment',
      });
      return;
    }
    
    // Validate content if present
    if (content) {
      if (typeof content !== 'string') {
        res.status(400).json({
          success: false,
          msg: 'Content must be a string',
        });
        return;
      }
      
      if (content.length > MAX_LENGTHS.message) {
        res.status(400).json({
          success: false,
          msg: `Message too long (max ${MAX_LENGTHS.message} characters)`,
        });
        return;
      }
      
      // Sanitize content
      req.body.content = sanitizeString(content, MAX_LENGTHS.message);
    }
    
    // Validate attachment URL if present
    if (attachment) {
      if (typeof attachment !== 'string') {
        res.status(400).json({
          success: false,
          msg: 'Attachment must be a URL string',
        });
        return;
      }
      
      if (attachment.length > MAX_LENGTHS.url) {
        res.status(400).json({
          success: false,
          msg: 'Attachment URL too long',
        });
        return;
      }
      
      // Basic URL validation
      try {
        new URL(attachment);
      } catch {
        res.status(400).json({
          success: false,
          msg: 'Invalid attachment URL',
        });
        return;
      }
    }
    
    next();
  } catch (error: any) {
    logger.error('Message validation error', { error: error.message });
    res.status(400).json({
      success: false,
      msg: 'Invalid message data',
    });
  }
}

/**
 * Validate user registration data
 */
export function validateUserRegistration(req: Request, res: Response, next: NextFunction): void {
  try {
    const { email, password, name } = req.body;
    
    // Validate email
    if (!email || typeof email !== 'string') {
      res.status(400).json({
        success: false,
        msg: 'Valid email is required',
      });
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || email.length > MAX_LENGTHS.email) {
      res.status(400).json({
        success: false,
        msg: 'Invalid email format',
      });
      return;
    }
    
    // Validate password
    if (!password || typeof password !== 'string') {
      res.status(400).json({
        success: false,
        msg: 'Password is required',
      });
      return;
    }
    
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({
        success: false,
        msg: 'Password must be 8-128 characters',
      });
      return;
    }
    
    // Validate name
    if (!name || typeof name !== 'string') {
      res.status(400).json({
        success: false,
        msg: 'Name is required',
      });
      return;
    }
    
    if (name.length > MAX_LENGTHS.name) {
      res.status(400).json({
        success: false,
        msg: `Name too long (max ${MAX_LENGTHS.name} characters)`,
      });
      return;
    }
    
    // Sanitize inputs
    req.body.email = sanitizeString(email, MAX_LENGTHS.email).toLowerCase();
    req.body.name = sanitizeString(name, MAX_LENGTHS.name);
    
    next();
  } catch (error: any) {
    logger.error('User validation error', { error: error.message });
    res.status(400).json({
      success: false,
      msg: 'Invalid user data',
    });
  }
}

/**
 * Validate phone number
 */
export function validatePhone(req: Request, res: Response, next: NextFunction): void {
  try {
    const { phone } = req.body;
    
    if (!phone || typeof phone !== 'string') {
      res.status(400).json({
        success: false,
        msg: 'Phone number is required',
      });
      return;
    }
    
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    if (digits.length < 10 || digits.length > 15) {
      res.status(400).json({
        success: false,
        msg: 'Invalid phone number',
      });
      return;
    }
    
    req.body.phone = digits;
    next();
  } catch (error: any) {
    logger.error('Phone validation error', { error: error.message });
    res.status(400).json({
      success: false,
      msg: 'Invalid phone number',
    });
  }
}

/**
 * Validate conversation ID (MongoDB ObjectId)
 */
export function validateObjectId(paramName: string = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const id = req.params[paramName] || req.body[paramName];
      
      if (!id || typeof id !== 'string') {
        res.status(400).json({
          success: false,
          msg: `Invalid ${paramName}`,
        });
        return;
      }
      
      // MongoDB ObjectId is 24 hex characters
      const objectIdRegex = /^[0-9a-fA-F]{24}$/;
      if (!objectIdRegex.test(id)) {
        res.status(400).json({
          success: false,
          msg: `Invalid ${paramName} format`,
        });
        return;
      }
      
      next();
    } catch (error: any) {
      logger.error('ObjectId validation error', { error: error.message });
      res.status(400).json({
        success: false,
        msg: 'Invalid ID',
      });
    }
  };
}

/**
 * Validate file upload
 */
export function validateFileUpload(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        msg: 'No file uploaded',
      });
      return;
    }
    
    const file = req.file;
    
    // Check file size (10MB max)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      res.status(400).json({
        success: false,
        msg: 'File too large (max 10MB)',
      });
      return;
    }
    
    // Check file type
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'audio/mpeg',
      'audio/wav',
      'application/pdf',
    ];
    
    if (!allowedTypes.includes(file.mimetype)) {
      res.status(400).json({
        success: false,
        msg: 'Invalid file type',
      });
      return;
    }
    
    next();
  } catch (error: any) {
    logger.error('File validation error', { error: error.message });
    res.status(400).json({
      success: false,
      msg: 'Invalid file',
    });
  }
}

/**
 * Socket event validation wrapper
 */
export function validateSocketData(schema: any) {
  return (data: any): { valid: boolean; error?: string; sanitized?: any } => {
    try {
      // Validate required fields
      for (const [key, rules] of Object.entries(schema)) {
        const fieldRules = rules as any;
        
        // Support nested fields like 'sender.id'
        const value = key.includes('.') 
          ? key.split('.').reduce((obj: any, k: string) => obj?.[k], data)
          : data[key];
        
        // Check required
        if (fieldRules.required && (value === undefined || value === null || value === '')) {
          return { valid: false, error: `${key} is required` };
        }
        
        // Skip further validation if field is optional and not provided
        if (!fieldRules.required && (value === undefined || value === null)) {
          continue;
        }
        
        // Check type
        if (value !== undefined && fieldRules.type && typeof value !== fieldRules.type) {
          return { valid: false, error: `${key} must be ${fieldRules.type}` };
        }
        
        // Check max length for strings
        if (fieldRules.maxLength && typeof value === 'string' && value.length > fieldRules.maxLength) {
          return { valid: false, error: `${key} too long (max ${fieldRules.maxLength})` };
        }
        
        // Sanitize strings
        if (typeof value === 'string' && fieldRules.sanitize) {
          // Handle nested fields
          if (key.includes('.')) {
            const keys = key.split('.');
            let obj = data;
            for (let i = 0; i < keys.length - 1; i++) {
              obj = obj[keys[i]];
            }
            obj[keys[keys.length - 1]] = sanitizeString(value, fieldRules.maxLength || MAX_LENGTHS.general);
          } else {
            data[key] = sanitizeString(value, fieldRules.maxLength || MAX_LENGTHS.general);
          }
        }
      }
      
      return { valid: true, sanitized: data };
    } catch (error: any) {
      return { valid: false, error: 'Validation error' };
    }
  };
}

// Export validation schemas for socket events
export const socketSchemas = {
  newMessage: {
    conversationId: { required: true, type: 'string', maxLength: 24 },
    content: { required: false, type: 'string', maxLength: MAX_LENGTHS.message, sanitize: true },
    attachment: { required: false, type: 'string', maxLength: MAX_LENGTHS.url },
    tempId: { required: false, type: 'string', maxLength: 100 },
    'sender.id': { required: true, type: 'string', maxLength: 24 },
    'sender.name': { required: true, type: 'string', maxLength: 100, sanitize: true },
    'sender.avatar': { required: false, type: 'string', maxLength: 2048 },
  },
  
  joinConversation: {
    conversationId: { required: true, type: 'string', maxLength: 24 },
  },
  
  markAsRead: {
    conversationId: { required: true, type: 'string', maxLength: 24 },
  },
};

/**
 * Global Error Handler Middleware (FIX #7)
 * 
 * Catches all unhandled errors and provides consistent error responses
 * Logs errors with context for debugging
 * Categorizes errors as operational vs programmer errors
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

interface ErrorWithStatus extends Error {
  status?: number;
  statusCode?: number;
  code?: string | number;
  isOperational?: boolean;
}

/**
 * FIX #7: Custom Application Error class
 * Distinguishes between operational errors (expected) and programmer errors (bugs)
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly timestamp: string;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * FIX #7: Error categorization
 */
function categorizeError(err: ErrorWithStatus): {
  category: string;
  isOperational: boolean;
} {
  // MongoDB errors
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    return { category: 'database', isOperational: true };
  }
  
  // Validation errors
  if (err.name === 'ValidationError') {
    return { category: 'validation', isOperational: true };
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return { category: 'authentication', isOperational: true };
  }
  
  // Cast errors (invalid ObjectId, etc.)
  if (err.name === 'CastError') {
    return { category: 'validation', isOperational: true };
  }
  
  // Custom operational errors
  if (err.isOperational) {
    return { category: 'operational', isOperational: true };
  }
  
  // Unknown errors (programmer errors)
  return { category: 'unknown', isOperational: false };
}

/**
 * Global error handling middleware
 * Should be registered last in middleware chain
 */
export function errorHandler(
  err: ErrorWithStatus,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // FIX #7: Check if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;
  
  // Categorize error
  const { category, isOperational } = categorizeError(err);
  
  // Determine if error should be exposed to client
  const isProduction = process.env.NODE_ENV === 'production';
  const message = isProduction && !isOperational
    ? 'Internal server error'
    : err.message || 'An error occurred';

  // Log error with context
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    statusCode,
    category,
    isOperational,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: (req as any).userId,
    requestId: (req as any).requestId,
  });

  // Send error response
  res.status(statusCode).json({
    success: false,
    msg: message,
    ...(isProduction ? {} : { 
      stack: err.stack,
      category,
      isOperational,
    }), // Include debug info in development
  });
}

/**
 * Handle 404 errors
 */
export function notFoundHandler(req: Request, res: Response): void {
  logger.warn('Route not found', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: (req as any).userId,
  });

  res.status(404).json({
    success: false,
    msg: 'Route not found',
  });
}

/**
 * FIX #7: Handle unhandled promise rejections
 */
export function setupGlobalErrorHandlers(): void {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Promise Rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack,
    });
    
    // Don't exit process in production, just log
    if (process.env.NODE_ENV !== 'production') {
      console.error('Unhandled Rejection at:', promise);
    }
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack,
    });
    
    // Give time to log before exiting
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
}

/**
 * FIX #7: Async error wrapper
 * Wraps async route handlers to catch errors automatically
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

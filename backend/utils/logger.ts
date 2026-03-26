/**
 * Centralized Logging Utility (FIX #7)
 * 
 * Provides structured logging with multiple levels and transports
 * Production-ready with JSON formatting and request tracking
 */

interface LogContext {
  userId?: string;
  requestId?: string;
  action?: string;
  duration?: number;
  error?: any;
  statusCode?: number;
  method?: string;
  path?: string;
  ip?: string;
  [key: string]: any;
}

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

class Logger {
  private isDevelopment: boolean;
  private errorCount: number = 0;
  private warnCount: number = 0;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production';
  }

  /**
   * Format log message with timestamp and context
   */
  private formatLog(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    
    if (this.isDevelopment) {
      // Human-readable format for development
      const contextStr = context ? ` | ${this.safeStringify(context)}` : '';
      return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
    } else {
      // JSON format for production (easy to parse by log aggregators)
      return this.safeStringify({
        timestamp,
        level,
        message,
        environment: process.env.NODE_ENV || 'development',
        service: 'chat-backend',
        ...context,
      });
    }
  }

  /**
   * FIX #7: Safe JSON stringify that handles circular references
   */
  private safeStringify(obj: any): string {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      // Truncate long strings
      if (typeof value === 'string' && value.length > 1000) {
        return value.substring(0, 1000) + '... [truncated]';
      }
      return value;
    });
  }

  /**
   * Log error messages
   */
  error(message: string, context?: LogContext): void {
    this.errorCount++;
    const formatted = this.formatLog('error', message, context);
    console.error(formatted);
    
    // In production, you might want to send to error tracking service
    // e.g., Sentry.captureException(context?.error);
  }

  /**
   * Log warning messages
   */
  warn(message: string, context?: LogContext): void {
    this.warnCount++;
    const formatted = this.formatLog('warn', message, context);
    console.warn(formatted);
  }

  /**
   * Log info messages
   */
  info(message: string, context?: LogContext): void {
    const formatted = this.formatLog('info', message, context);
    console.log(formatted);
  }

  /**
   * Log debug messages (only in development)
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const formatted = this.formatLog('debug', message, context);
      console.log(formatted);
    }
  }

  /**
   * Log performance metrics
   */
  performance(action: string, duration: number, context?: LogContext): void {
    if (duration > 1000) {
      this.warn(`Slow operation: ${action}`, {
        action,
        duration,
        ...context,
      });
    } else {
      this.info(`Performance: ${action}`, {
        action,
        duration,
        ...context,
      });
    }
  }

  /**
   * Log database queries
   */
  query(query: string, duration: number, context?: LogContext): void {
    if (duration > 1000) {
      // Warn on slow queries (>1 second)
      this.warn(`Slow query detected: ${query}`, {
        query,
        duration,
        ...context,
      });
    } else {
      this.debug(`Query: ${query}`, {
        query,
        duration,
        ...context,
      });
    }
  }

  /**
   * Log socket events
   */
  socket(event: string, userId: string, context?: LogContext): void {
    this.debug(`Socket event: ${event}`, {
      event,
      userId,
      ...context,
    });
  }

  /**
   * Log API requests
   */
  request(method: string, path: string, statusCode: number, duration: number, context?: LogContext): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    
    this[level](`${method} ${path} ${statusCode}`, {
      method,
      path,
      statusCode,
      duration,
      ...context,
    });
  }

  /**
   * Get error statistics
   */
  getStats() {
    return {
      errors: this.errorCount,
      warnings: this.warnCount,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.errorCount = 0;
    this.warnCount = 0;
  }
}

// Export singleton instance
export const logger = new Logger();

// Export types
export type { LogContext, LogLevel };

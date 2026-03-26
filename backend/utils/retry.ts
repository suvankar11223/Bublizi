/**
 * Retry Utility with Exponential Backoff
 * 
 * Provides resilient error handling for transient failures
 * Implements circuit breaker pattern to prevent cascading failures
 */

import { logger } from './logger.js';

interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      if (attempt === maxAttempts) {
        logger.error('Max retry attempts reached', {
          attempts: maxAttempts,
          error: error.message,
        });
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, attempt - 1),
        maxDelay
      );

      logger.warn(`Retry attempt ${attempt}/${maxAttempts}`, {
        attempt,
        delay,
        error: error.message,
      });

      if (onRetry) {
        onRetry(attempt, error);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Circuit Breaker Pattern
 * Prevents repeated calls to failing services
 */
class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if timeout has passed
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        logger.info('Circuit breaker: half-open state');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      
      // FIX #2: Always reset failures on success
      if (this.failures > 0) {
        this.failures = 0;
        logger.debug('Circuit breaker: failures reset');
      }
      
      // Success - reset circuit breaker
      if (this.state === 'half-open') {
        this.state = 'closed';
        logger.info('Circuit breaker: closed state');
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.threshold) {
        this.state = 'open';
        logger.error('Circuit breaker: open state', {
          failures: this.failures,
          threshold: this.threshold,
        });
      }

      throw error;
    }
  }

  getState(): string {
    return this.state;
  }

  reset(): void {
    this.failures = 0;
    this.state = 'closed';
    logger.info('Circuit breaker: reset');
  }
}

/**
 * Sleep utility with maximum timeout protection
 * FIX #6: Prevent infinite sleep
 */
function sleep(ms: number): Promise<void> {
  const MAX_SLEEP = 60000; // 1 minute max
  const safeSleep = Math.min(ms, MAX_SLEEP);
  return new Promise(resolve => setTimeout(resolve, safeSleep));
}

/**
 * Retry specific to database operations
 */
export async function retryDatabaseOperation<T>(
  fn: () => Promise<T>,
  operationName: string
): Promise<T> {
  return retryWithBackoff(fn, {
    maxAttempts: 3,
    initialDelay: 500,
    maxDelay: 5000,
    onRetry: (attempt, error) => {
      logger.warn(`Database operation retry: ${operationName}`, {
        attempt,
        error: error.message,
      });
    },
  });
}

/**
 * Retry specific to external API calls
 */
export async function retryApiCall<T>(
  fn: () => Promise<T>,
  apiName: string
): Promise<T> {
  return retryWithBackoff(fn, {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    onRetry: (attempt, error) => {
      logger.warn(`API call retry: ${apiName}`, {
        attempt,
        error: error.message,
      });
    },
  });
}

// Export circuit breaker instance for external services
export const externalServiceBreaker = new CircuitBreaker(5, 60000);

export { CircuitBreaker };

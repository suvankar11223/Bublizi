/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures when external services are down
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests fail immediately
 * - HALF_OPEN: Testing if service recovered
 * 
 * Flow:
 * CLOSED → (failures >= threshold) → OPEN
 * OPEN → (timeout elapsed) → HALF_OPEN
 * HALF_OPEN → (success count >= attempts) → CLOSED
 * HALF_OPEN → (any failure) → OPEN
 */

import { logger } from './logger.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  name: string;
  threshold?: number;        // Failures before opening (default: 5)
  timeout?: number;          // Time in ms before trying again (default: 60000)
  halfOpenAttempts?: number; // Successes needed to close (default: 3)
}

export interface CircuitBreakerState {
  name: string;
  state: CircuitState;
  failures: number;
  lastFailure: number;
  successCount: number;
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: CircuitState = 'CLOSED';
  private successCount = 0;

  constructor(
    private name: string,
    private threshold = 5,
    private timeout = 60000,
    private halfOpenAttempts = 3
  ) {
    logger.info('Circuit breaker initialized', {
      name: this.name,
      threshold: this.threshold,
      timeout: this.timeout,
      halfOpenAttempts: this.halfOpenAttempts,
    });
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailure;
      
      if (timeSinceLastFailure > this.timeout) {
        // Timeout elapsed, transition to HALF_OPEN
        logger.info('Circuit breaker transitioning to HALF_OPEN', {
          name: this.name,
          timeSinceLastFailure,
        });
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        // Circuit still open, fail fast
        const retryAfter = Math.ceil((this.timeout - timeSinceLastFailure) / 1000);
        throw new Error(
          `Circuit breaker ${this.name} is OPEN. Retry after ${retryAfter}s`
        );
      }
    }

    try {
      // Execute the function
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess() {
    this.failures = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      
      logger.debug('Circuit breaker success in HALF_OPEN', {
        name: this.name,
        successCount: this.successCount,
        needed: this.halfOpenAttempts,
      });

      if (this.successCount >= this.halfOpenAttempts) {
        // Enough successes, close the circuit
        logger.info('Circuit breaker closing', {
          name: this.name,
          successCount: this.successCount,
        });
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Any failure in HALF_OPEN immediately opens circuit
      logger.warn('Circuit breaker reopening from HALF_OPEN', {
        name: this.name,
      });
      this.state = 'OPEN';
      this.successCount = 0;
      return;
    }

    if (this.failures >= this.threshold) {
      // Threshold reached, open the circuit
      logger.error('Circuit breaker opening', {
        name: this.name,
        failures: this.failures,
        threshold: this.threshold,
      });
      this.state = 'OPEN';
    } else {
      logger.warn('Circuit breaker failure', {
        name: this.name,
        failures: this.failures,
        threshold: this.threshold,
      });
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailure,
      successCount: this.successCount,
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset() {
    logger.info('Circuit breaker manually reset', { name: this.name });
    this.failures = 0;
    this.state = 'CLOSED';
    this.successCount = 0;
    this.lastFailure = 0;
  }

  /**
   * Check if circuit is currently open
   */
  isOpen(): boolean {
    return this.state === 'OPEN';
  }

  /**
   * Get time until circuit can be retried (in seconds)
   */
  getRetryAfter(): number {
    if (this.state !== 'OPEN') return 0;
    
    const timeSinceLastFailure = Date.now() - this.lastFailure;
    const remaining = this.timeout - timeSinceLastFailure;
    
    return Math.max(0, Math.ceil(remaining / 1000));
  }
}

// ============================================================================
// CIRCUIT BREAKER INSTANCES FOR EXTERNAL SERVICES
// ============================================================================

/**
 * Clerk Authentication Circuit Breaker
 * Protects against Clerk API failures
 */
export const clerkCircuitBreaker = new CircuitBreaker('clerk', 5, 60000, 3);

/**
 * Firebase Authentication Circuit Breaker
 * Protects against Firebase Auth API failures
 */
export const firebaseCircuitBreaker = new CircuitBreaker('firebase', 5, 60000, 3);

/**
 * Gemini AI Circuit Breaker
 * Protects against Gemini API failures
 * Lower threshold and shorter timeout for AI (non-critical)
 */
export const geminiCircuitBreaker = new CircuitBreaker('gemini', 3, 30000, 2);

/**
 * Get all circuit breaker states
 */
export function getAllCircuitBreakerStates(): CircuitBreakerState[] {
  return [
    clerkCircuitBreaker.getState(),
    firebaseCircuitBreaker.getState(),
    geminiCircuitBreaker.getState(),
  ];
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers(): void {
  clerkCircuitBreaker.reset();
  firebaseCircuitBreaker.reset();
  geminiCircuitBreaker.reset();
  logger.info('All circuit breakers reset');
}

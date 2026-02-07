import { CircuitBreakerOptions, CircuitState, CircuitOpenError, FailureRecord } from './types';

/**
 * Circuit Breaker implementation for protecting against cascading failures
 * when calling unreliable external dependencies.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is tripped, requests fail immediately
 * - HALF_OPEN: Testing if the dependency is healthy again
 * 
 * CONCURRENCY SAFETY NOTE:
 * This implementation is safe for single-threaded Node.js event loop execution.
 * The Half-Open probe guard uses synchronous check-and-set which is atomic within
 * a single JavaScript execution context.
 * 
 * This implementation is NOT safe for:
 * - worker_threads with shared CircuitBreaker instances
 * - Multi-process environments sharing state
 * - Distributed systems requiring coordination
 * 
 * For distributed safety, consider external state stores (Redis, etc.) with
 * atomic operations or distributed locks.
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: FailureRecord[] = [];
  private lastFailureTime: number = 0;
  private halfOpenInProgress: boolean = false;
  private successCount: number = 0;

  private readonly failureThreshold: number;
  private readonly failureWindowMs: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.failureWindowMs = options.failureWindowMs ?? 60000;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
    this.successThreshold = options.successThreshold ?? 1;
  }

  /**
   * Get the current state of the circuit breaker
   */
  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  /**
   * Get the number of failures within the current time window
   */
  getFailureCount(): number {
    this.cleanupOldFailures();
    return this.failures.length;
  }

  /**
   * Get the failure records within the current time window.
   * Each record contains timestamp, errorType, and errorMessage for debugging.
   * Returns a copy to prevent external mutation.
   */
  getFailures(): ReadonlyArray<FailureRecord> {
    this.cleanupOldFailures();
    return [...this.failures];
  }

  /**
   * Execute an async operation through the circuit breaker
   * @param operation - The async operation to execute
   * @returns The result of the operation
   * @throws CircuitOpenError if the circuit is open
   * @throws The original error if the operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.updateState();

    if (this.state === CircuitState.OPEN) {
      throw new CircuitOpenError('Circuit breaker is open');
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenInProgress) {
        throw new CircuitOpenError('Circuit breaker is half-open and a probe request is in progress');
      }
      this.halfOpenInProgress = true;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Reset the circuit breaker to its initial state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = [];
    this.lastFailureTime = 0;
    this.halfOpenInProgress = false;
    this.successCount = 0;
  }

  /**
   * Force the circuit to open
   */
  trip(): void {
    this.state = CircuitState.OPEN;
    this.lastFailureTime = Date.now();
    this.halfOpenInProgress = false;
    this.successCount = 0;
  }

  /**
   * Update the circuit state based on current conditions
   */
  private updateState(): void {
    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenInProgress = false;
        this.successCount = 0;
      }
    }
  }

  /**
   * Handle successful operation execution
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      this.halfOpenInProgress = false;
      
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failures = [];
        this.successCount = 0;
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state (optional behavior)
    }
  }

  /**
   * Handle failed operation execution
   */
  private onFailure(error: unknown): void {
    const now = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.lastFailureTime = now;
      this.halfOpenInProgress = false;
      this.successCount = 0;
      return;
    }

    if (this.state === CircuitState.CLOSED) {
      this.cleanupOldFailures();

      const errorType = error instanceof Error ? error.constructor.name : typeof error;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.failures.push({ timestamp: now, errorType, errorMessage });

      if (this.failures.length >= this.failureThreshold) {
        this.state = CircuitState.OPEN;
        this.lastFailureTime = now;
      }
    }
  }

  /**
   * Remove failure records that are outside the time window
   * Prevents memory growth from failure tracking
   */
  private cleanupOldFailures(): void {
    const now = Date.now();
    const windowStart = now - this.failureWindowMs;
    this.failures = this.failures.filter(f => f.timestamp > windowStart);
  }
}

export { CircuitOpenError };

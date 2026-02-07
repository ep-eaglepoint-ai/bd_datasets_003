/**
 * Circuit Breaker States
 */
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Configuration options for the Circuit Breaker
 */
export interface CircuitBreakerOptions {
  /**
   * Number of failures before opening the circuit
   * @default 5
   */
  failureThreshold?: number;

  /**
   * Time window in milliseconds for tracking failures
   * @default 60000 (1 minute)
   */
  failureWindowMs?: number;

  /**
   * Time in milliseconds before attempting to transition from Open to Half-Open
   * @default 30000 (30 seconds)
   */
  resetTimeoutMs?: number;

  /**
   * Number of successful requests needed to close the circuit from Half-Open
   * @default 1
   */
  successThreshold?: number;
}

/**
 * Error thrown when the circuit is open
 */
export class CircuitOpenError extends Error {
  constructor(message: string = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Failure record for tracking failures within the time window.
 * Stores rich context including the original error to aid debugging.
 */
export interface FailureRecord {
  timestamp: number;
  /** The original error type name (e.g. 'TypeError', 'NetworkError') */
  errorType: string;
  /** The original error message */
  errorMessage: string;
}

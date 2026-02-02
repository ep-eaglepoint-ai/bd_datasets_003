/**
 * Reconnection with Exponential Backoff
 *
 * Requirement 8: Exponential delays starting at 1s, max 30s, plus 20% random jitter
 */

// Requirement 8: Configuration constants
const BASE_DELAY_MS = 1000; // 1 second
const MAX_DELAY_MS = 30000; // 30 seconds
const JITTER_PERCENT = 0.2; // 20% jitter

/**
 * Reconnection State
 */
export interface ReconnectionState {
  attempt: number;
  baseDelay: number;
  maxDelay: number;
  jitterPercent: number;
}

/**
 * Create initial reconnection state
 */
export function createReconnectionState(): ReconnectionState {
  return {
    attempt: 0,
    baseDelay: BASE_DELAY_MS,
    maxDelay: MAX_DELAY_MS,
    jitterPercent: JITTER_PERCENT
  };
}

/**
 * Calculate the next delay with exponential backoff and optional jitter
 *
 * Requirement 8:
 * - Exponential delays starting at 1 second
 * - Maximum 30 seconds
 * - 20% random jitter to prevent thundering herd
 */
export function calculateNextDelay(state: ReconnectionState, withJitter: boolean = true): number {
  // Exponential backoff: delay = baseDelay * 2^attempt
  const exponentialDelay = state.baseDelay * Math.pow(2, state.attempt);

  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, state.maxDelay);

  if (withJitter) {
    // Add jitter (Requirement 8: 20% random jitter)
    return addJitter(cappedDelay, state.jitterPercent);
  }

  return cappedDelay;
}

/**
 * Add random jitter to a delay value
 *
 * Requirement 8: Without jitter, all disconnected clients reconnect
 * simultaneously when the server recovers, causing thundering herd
 */
export function addJitter(delay: number, jitterPercent: number): number {
  if (jitterPercent === 0) {
    return delay;
  }

  // Generate random value between -jitterPercent and +jitterPercent
  const jitterRange = delay * jitterPercent;
  const jitter = (Math.random() * 2 - 1) * jitterRange;

  // Ensure delay is at least 1ms
  return Math.max(1, Math.round(delay + jitter));
}

/**
 * Update reconnection state after a failed attempt
 */
export function incrementAttempt(state: ReconnectionState): ReconnectionState {
  return {
    ...state,
    attempt: state.attempt + 1
  };
}

/**
 * Reset reconnection state after successful connection
 */
export function resetReconnectionState(state: ReconnectionState): ReconnectionState {
  return {
    ...state,
    attempt: 0
  };
}

/**
 * Reconnection Manager
 *
 * Manages reconnection attempts with exponential backoff and jitter
 */
export class ReconnectionManager {
  private state: ReconnectionState;
  private timer: NodeJS.Timeout | null = null;
  private _isReconnecting: boolean = false;

  constructor(
    baseDelay: number = BASE_DELAY_MS,
    maxDelay: number = MAX_DELAY_MS,
    jitterPercent: number = JITTER_PERCENT
  ) {
    this.state = {
      attempt: 0,
      baseDelay,
      maxDelay,
      jitterPercent
    };
  }

  /**
   * Get number of attempts made
   */
  getAttemptCount(): number {
    return this.state.attempt;
  }

  /**
   * Get next delay with optional jitter
   */
  getNextDelay(withJitter: boolean = true): number {
    return calculateNextDelay(this.state, withJitter);
  }

  /**
   * Record a reconnection attempt
   */
  recordAttempt(): void {
    this.state = incrementAttempt(this.state);
  }

  /**
   * Reset state after successful connection
   */
  reset(): void {
    this.stop();
    this.state = resetReconnectionState(this.state);
  }

  /**
   * Schedule a reconnection attempt with callback
   */
  scheduleReconnect(callback: () => void): void {
    this._isReconnecting = true;
    const delay = this.getNextDelay(true);

    this.timer = setTimeout(() => {
      this.timer = null;
      callback();
    }, delay);
  }

  /**
   * Stop reconnection attempts
   */
  stop(): void {
    this._isReconnecting = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Check if reconnection is in progress
   */
  isReconnecting(): boolean {
    return this._isReconnecting;
  }

  /**
   * Get current reconnection state
   */
  getState(): ReconnectionState {
    return { ...this.state };
  }
}

/**
 * Create a new reconnection manager
 */
export function createReconnectionManager(
  baseDelay: number = BASE_DELAY_MS,
  maxDelay: number = MAX_DELAY_MS,
  jitterPercent: number = JITTER_PERCENT
): ReconnectionManager {
  return new ReconnectionManager(baseDelay, maxDelay, jitterPercent);
}

/**
 * Verify jitter is within acceptable range
 * Requirement 8: 20% jitter means delay should be within ±20% of base
 */
export function isJitterValid(
  originalDelay: number,
  delayWithJitter: number,
  jitterPercent: number
): boolean {
  const minAllowed = originalDelay * (1 - jitterPercent);
  const maxAllowed = originalDelay * (1 + jitterPercent);
  return delayWithJitter >= minAllowed && delayWithJitter <= maxAllowed;
}

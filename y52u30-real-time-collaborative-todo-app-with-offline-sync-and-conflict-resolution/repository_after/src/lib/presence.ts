/**
 * User Presence Management
 *
 * Requirement 5: Cleanup must delay 5 seconds after disconnect
 * Requirement 9: Presence updates must be throttled to max 1 per 100ms
 */

import { UserPresence } from '../types';

// Requirement 5: 5 second delay before cleanup
const PRESENCE_CLEANUP_DELAY_MS = 5000;

// Requirement 9: Throttle to max 1 emission per 100ms
const PRESENCE_THROTTLE_MS = 100;

/**
 * Presence Manager
 *
 * Manages user presence with proper cleanup delays and throttling
 */
export class PresenceManager {
  private presenceMap: Map<string, UserPresence> = new Map();
  private cleanupTimers: Map<string, NodeJS.Timeout> = new Map();
  private lastEmitTime: number = 0;
  private pendingEmit: NodeJS.Timeout | null = null;
  private cleanupDelayMs: number;
  private throttleMs: number;
  private onPresenceChange?: (presence: UserPresence[]) => void;

  constructor(
    cleanupDelayMs: number = PRESENCE_CLEANUP_DELAY_MS,
    throttleMs: number = PRESENCE_THROTTLE_MS
  ) {
    this.cleanupDelayMs = cleanupDelayMs;
    this.throttleMs = throttleMs;
  }

  /**
   * Set callback for presence changes
   */
  setOnPresenceChange(callback: (presence: UserPresence[]) => void): void {
    this.onPresenceChange = callback;
  }

  /**
   * Add or update user presence
   * Requirement 9: Updates are throttled to max 1 per 100ms
   */
  updatePresence(userId: string, currentTodoId: string | null): void {
    // Cancel any pending cleanup for this user
    this.cancelCleanup(userId);

    const now = new Date();
    const presence: UserPresence = {
      userId,
      currentTodoId,
      lastSeen: now
    };

    // Store the update
    this.presenceMap.set(userId, presence);

    // Throttle the emission (Requirement 9)
    this.throttleEmit();
  }

  /**
   * Throttle presence update emissions
   * Requirement 9: Max 1 emission per 100ms during rapid interactions
   */
  private throttleEmit(): void {
    const now = Date.now();
    const timeSinceLastEmit = now - this.lastEmitTime;

    if (timeSinceLastEmit >= this.throttleMs) {
      // Enough time has passed, emit immediately
      this.lastEmitTime = now;
      this.emitPresenceChange();
    } else {
      // Schedule emission if not already scheduled
      if (!this.pendingEmit) {
        this.pendingEmit = setTimeout(() => {
          this.pendingEmit = null;
          this.lastEmitTime = Date.now();
          this.emitPresenceChange();
        }, this.throttleMs - timeSinceLastEmit);
      }
    }
  }

  /**
   * Mark user as disconnected and schedule cleanup
   * Requirement 5: Delay 5 seconds before removing presence
   */
  markDisconnected(userId: string): void {
    // Cancel any existing cleanup timer
    this.cancelCleanup(userId);

    // If user doesn't exist, nothing to clean up
    if (!this.presenceMap.has(userId)) {
      return;
    }

    // Schedule cleanup after delay (Requirement 5)
    const timer = setTimeout(() => {
      this.removePresence(userId);
      this.cleanupTimers.delete(userId);
    }, this.cleanupDelayMs);

    this.cleanupTimers.set(userId, timer);
  }

  /**
   * Cancel a pending cleanup for a user (e.g., when they reconnect)
   */
  cancelCleanup(userId: string): void {
    const timer = this.cleanupTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(userId);
    }
  }

  /**
   * Immediately remove user presence
   */
  removePresence(userId: string): void {
    this.presenceMap.delete(userId);
    this.cancelCleanup(userId);
    this.throttleEmit();
  }

  /**
   * Get all current presence entries
   */
  getPresence(): UserPresence[] {
    return Array.from(this.presenceMap.values());
  }

  /**
   * Get presence for a specific user
   */
  getUserPresence(userId: string): UserPresence | undefined {
    return this.presenceMap.get(userId);
  }

  /**
   * Check if a user is currently present
   */
  isUserPresent(userId: string): boolean {
    return this.presenceMap.has(userId);
  }

  /**
   * Get users currently editing a specific todo
   */
  getUsersEditingTodo(todoId: string): UserPresence[] {
    return this.getPresence().filter(p => p.currentTodoId === todoId);
  }

  /**
   * Check if cleanup is pending for a user
   */
  isCleanupPending(userId: string): boolean {
    return this.cleanupTimers.has(userId);
  }

  /**
   * Get the cleanup delay in milliseconds
   */
  getCleanupDelayMs(): number {
    return this.cleanupDelayMs;
  }

  /**
   * Get the throttle interval in milliseconds
   */
  getThrottleMs(): number {
    return this.throttleMs;
  }

  /**
   * Emit presence change to listeners
   */
  private emitPresenceChange(): void {
    if (this.onPresenceChange) {
      this.onPresenceChange(this.getPresence());
    }
  }

  /**
   * Clear all presence data (for testing)
   */
  clear(): void {
    // Clear all timers
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    if (this.pendingEmit) {
      clearTimeout(this.pendingEmit);
      this.pendingEmit = null;
    }

    this.presenceMap.clear();
    this.cleanupTimers.clear();
    this.lastEmitTime = 0;
  }

  /**
   * Get count of connected users
   */
  getConnectedCount(): number {
    return this.presenceMap.size;
  }
}

/**
 * Create a new presence manager instance
 */
export function createPresenceManager(
  cleanupDelayMs: number = PRESENCE_CLEANUP_DELAY_MS,
  throttleMs: number = PRESENCE_THROTTLE_MS
): PresenceManager {
  return new PresenceManager(cleanupDelayMs, throttleMs);
}

/**
 * Throttle function for presence updates
 * Requirement 9: Max 1 emission per 100ms
 */
export function createThrottledEmitter<T>(
  emitFn: (data: T) => void,
  intervalMs: number = PRESENCE_THROTTLE_MS
): (data: T) => void {
  let lastEmitTime = 0;
  let pendingData: T | null = null;
  let timer: NodeJS.Timeout | null = null;

  return (data: T) => {
    const now = Date.now();
    const timeSinceLastEmit = now - lastEmitTime;

    if (timeSinceLastEmit >= intervalMs) {
      lastEmitTime = now;
      emitFn(data);
    } else {
      pendingData = data;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          if (pendingData !== null) {
            lastEmitTime = Date.now();
            emitFn(pendingData);
            pendingData = null;
          }
        }, intervalMs - timeSinceLastEmit);
      }
    }
  };
}

/**
 * Reconnection Manager Tests
 *
 * Tests for Requirement 8:
 * - Exponential backoff from 1s to 30s max
 * - 20% jitter on delays (both directions)
 */

import {
  ReconnectionManager,
  createReconnectionManager,
  createReconnectionState,
  calculateNextDelay,
  addJitter,
  incrementAttempt,
  resetReconnectionState,
  isJitterValid
} from '../repository_after/src/lib/reconnection';

describe('Reconnection - Requirement 8: Exponential Backoff', () => {
  describe('Base Delay Calculation', () => {
    test('should start with 1 second base delay', () => {
      const state = createReconnectionState();
      const delay = calculateNextDelay(state, false); // Without jitter
      expect(delay).toBe(1000);
    });

    test('should double delay on each attempt', () => {
      let state = createReconnectionState();

      const delays: number[] = [];
      for (let i = 0; i < 6; i++) {
        delays.push(calculateNextDelay(state, false));
        state = incrementAttempt(state);
      }

      // 1s, 2s, 4s, 8s, 16s, 30s (capped)
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);
      expect(delays[3]).toBe(8000);
      expect(delays[4]).toBe(16000);
      expect(delays[5]).toBe(30000); // Capped at 30s
    });

    test('should cap delay at 30 seconds maximum', () => {
      let state = createReconnectionState();

      // Make many attempts
      for (let i = 0; i < 20; i++) {
        state = incrementAttempt(state);
      }

      const delay = calculateNextDelay(state, false);
      expect(delay).toBe(30000);
    });

    test('should never exceed 30 seconds even with extreme attempts', () => {
      let state = createReconnectionState();

      for (let i = 0; i < 100; i++) {
        state = incrementAttempt(state);
      }

      const delay = calculateNextDelay(state, false);
      expect(delay).toBeLessThanOrEqual(30000);
    });

    test('should reset to 1 second after successful connection', () => {
      let state = createReconnectionState();

      // Make several attempts
      for (let i = 0; i < 5; i++) {
        state = incrementAttempt(state);
      }

      expect(calculateNextDelay(state, false)).toBeGreaterThan(1000);

      // Reset
      state = resetReconnectionState(state);

      expect(calculateNextDelay(state, false)).toBe(1000);
      expect(state.attempt).toBe(0);
    });
  });

  describe('Jitter - 20% Both Directions', () => {
    test('should add jitter within 20% range', () => {
      const baseDelay = 10000;
      const jitteredDelays: number[] = [];

      for (let i = 0; i < 100; i++) {
        jitteredDelays.push(addJitter(baseDelay, 0.2));
      }

      const minExpected = baseDelay * 0.8; // -20%
      const maxExpected = baseDelay * 1.2; // +20%

      for (const delay of jitteredDelays) {
        expect(delay).toBeGreaterThanOrEqual(minExpected);
        expect(delay).toBeLessThanOrEqual(maxExpected);
      }
    });

    test('should produce varied results (not always the same)', () => {
      const baseDelay = 10000;
      const jitteredDelays = new Set<number>();

      for (let i = 0; i < 50; i++) {
        jitteredDelays.add(addJitter(baseDelay, 0.2));
      }

      // Should have multiple different values (not deterministic)
      expect(jitteredDelays.size).toBeGreaterThan(1);
    });

    test('should have roughly uniform distribution within jitter range', () => {
      const baseDelay = 10000;
      const lowerHalf: number[] = [];
      const upperHalf: number[] = [];

      for (let i = 0; i < 1000; i++) {
        const jittered = addJitter(baseDelay, 0.2);
        if (jittered < baseDelay) {
          lowerHalf.push(jittered);
        } else {
          upperHalf.push(jittered);
        }
      }

      // Both halves should have values (roughly even distribution)
      expect(lowerHalf.length).toBeGreaterThan(300);
      expect(upperHalf.length).toBeGreaterThan(300);
    });

    test('isJitterValid should correctly validate jitter range', () => {
      const baseDelay = 10000;

      expect(isJitterValid(baseDelay, 10000, 0.2)).toBe(true); // Exact
      expect(isJitterValid(baseDelay, 8000, 0.2)).toBe(true); // Min bound
      expect(isJitterValid(baseDelay, 12000, 0.2)).toBe(true); // Max bound
      expect(isJitterValid(baseDelay, 9500, 0.2)).toBe(true); // Within range

      expect(isJitterValid(baseDelay, 7999, 0.2)).toBe(false); // Below min
      expect(isJitterValid(baseDelay, 12001, 0.2)).toBe(false); // Above max
    });

    test('should apply jitter to capped delays correctly', () => {
      let state = createReconnectionState();

      // Get to max delay
      for (let i = 0; i < 10; i++) {
        state = incrementAttempt(state);
      }

      const jitteredDelay = calculateNextDelay(state, true);

      // 30s with 20% jitter: 24s to 36s
      expect(jitteredDelay).toBeGreaterThanOrEqual(24000);
      expect(jitteredDelay).toBeLessThanOrEqual(36000);
    });
  });

  describe('ReconnectionManager', () => {
    let manager: ReconnectionManager;

    beforeEach(() => {
      jest.useFakeTimers();
      manager = createReconnectionManager();
    });

    afterEach(() => {
      manager.stop();
      jest.useRealTimers();
    });

    test('should track connection attempts', () => {
      expect(manager.getAttemptCount()).toBe(0);

      manager.recordAttempt();
      expect(manager.getAttemptCount()).toBe(1);

      manager.recordAttempt();
      expect(manager.getAttemptCount()).toBe(2);
    });

    test('should provide next delay based on attempts', () => {
      const delay1 = manager.getNextDelay(false);
      expect(delay1).toBe(1000);

      manager.recordAttempt();
      const delay2 = manager.getNextDelay(false);
      expect(delay2).toBe(2000);
    });

    test('should reset on successful connection', () => {
      manager.recordAttempt();
      manager.recordAttempt();
      manager.recordAttempt();

      expect(manager.getAttemptCount()).toBe(3);

      manager.reset();

      expect(manager.getAttemptCount()).toBe(0);
      expect(manager.getNextDelay(false)).toBe(1000);
    });

    test('should schedule reconnection with callback', () => {
      let callbackCalled = false;
      manager.scheduleReconnect(() => {
        callbackCalled = true;
      });

      expect(callbackCalled).toBe(false);

      // First attempt: ~1s delay (with jitter, 0.8-1.2s)
      jest.advanceTimersByTime(1200);

      expect(callbackCalled).toBe(true);
    });

    test('should be able to cancel scheduled reconnection', () => {
      let callbackCalled = false;
      manager.scheduleReconnect(() => {
        callbackCalled = true;
      });

      manager.stop();
      jest.advanceTimersByTime(5000);

      expect(callbackCalled).toBe(false);
    });

    test('should track reconnecting state', () => {
      expect(manager.isReconnecting()).toBe(false);

      manager.scheduleReconnect(() => {});
      expect(manager.isReconnecting()).toBe(true);

      manager.stop();
      expect(manager.isReconnecting()).toBe(false);
    });
  });

  describe('Exponential Backoff Sequence', () => {
    test('should follow exact exponential sequence before cap', () => {
      const manager = createReconnectionManager();
      const delays: number[] = [];

      for (let i = 0; i < 10; i++) {
        delays.push(manager.getNextDelay(false));
        manager.recordAttempt();
      }

      // Verify exponential sequence: 1, 2, 4, 8, 16, 30, 30, 30, 30, 30
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);
      expect(delays[3]).toBe(8000);
      expect(delays[4]).toBe(16000);
      expect(delays[5]).toBe(30000);
      expect(delays[6]).toBe(30000);
      expect(delays[7]).toBe(30000);
      expect(delays[8]).toBe(30000);
      expect(delays[9]).toBe(30000);
    });

    test('should correctly calculate intermediate delay (32s -> 30s)', () => {
      // 2^5 * 1000 = 32000, but cap at 30000
      let state = createReconnectionState();
      for (let i = 0; i < 5; i++) {
        state = incrementAttempt(state);
      }

      const delay = calculateNextDelay(state, false);
      expect(delay).toBe(30000); // Capped, not 32000
    });
  });
});

describe('Reconnection - Edge Cases', () => {
  test('should handle immediate reset after creation', () => {
    const state = resetReconnectionState(createReconnectionState());
    expect(state.attempt).toBe(0);
    expect(calculateNextDelay(state, false)).toBe(1000);
  });

  test('should handle zero jitter factor', () => {
    const baseDelay = 10000;
    const jittered = addJitter(baseDelay, 0);
    expect(jittered).toBe(baseDelay);
  });

  test('should handle very small base delays', () => {
    const state = createReconnectionState();
    const delay = calculateNextDelay(state, true);

    // Even with jitter, should be reasonable
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(1200); // 1000 + 20%
  });
});

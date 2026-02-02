/**
 * Presence Management Tests
 *
 * Tests for Requirements 5 and 9:
 * - Requirement 5: Delay cleanup by 5 seconds on disconnect
 * - Requirement 9: Throttle presence updates to max 1 per 100ms
 */

import {
  PresenceManager,
  createPresenceManager,
  createThrottledEmitter
} from '../repository_after/src/lib/presence';
import { UserPresence } from '../repository_after/src/types';

describe('Presence Management - Requirement 5: 5-Second Cleanup Delay', () => {
  let manager: PresenceManager;

  beforeEach(() => {
    jest.useFakeTimers();
    manager = createPresenceManager(5000, 100);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Disconnect Cleanup Delay', () => {
    test('should not remove user immediately on disconnect', () => {
      manager.updatePresence('user1', null);
      manager.markDisconnected('user1');

      // Immediately after disconnect, user should still be present
      const presence = manager.getPresence();
      const user = presence.find(p => p.userId === 'user1');
      expect(user).toBeDefined();
    });

    test('should keep user for exactly 5 seconds after disconnect', () => {
      manager.updatePresence('user1', null);
      manager.markDisconnected('user1');

      // At 4.9 seconds, user should still be present
      jest.advanceTimersByTime(4900);
      let presence = manager.getPresence();
      expect(presence.find(p => p.userId === 'user1')).toBeDefined();

      // At 5 seconds, user should be removed
      jest.advanceTimersByTime(200);
      presence = manager.getPresence();
      expect(presence.find(p => p.userId === 'user1')).toBeUndefined();
    });

    test('should cancel cleanup if user reconnects within 5 seconds', () => {
      manager.updatePresence('user1', null);
      manager.markDisconnected('user1');

      // User reconnects after 3 seconds
      jest.advanceTimersByTime(3000);
      manager.updatePresence('user1', 'todo-1');

      // After total of 6 seconds, user should still be present
      jest.advanceTimersByTime(3000);
      const presence = manager.getPresence();
      const user = presence.find(p => p.userId === 'user1');
      expect(user).toBeDefined();
      expect(user?.currentTodoId).toBe('todo-1');
    });

    test('should handle multiple disconnect/reconnect cycles', () => {
      manager.updatePresence('user1', null);

      // First disconnect
      manager.markDisconnected('user1');
      jest.advanceTimersByTime(2000);

      // Reconnect
      manager.updatePresence('user1', 'todo-1');
      jest.advanceTimersByTime(1000);

      // Second disconnect
      manager.markDisconnected('user1');
      jest.advanceTimersByTime(4000);

      // Still present (only 4 seconds since last disconnect)
      expect(manager.getPresence().find(p => p.userId === 'user1')).toBeDefined();

      // Now gone after 5 seconds
      jest.advanceTimersByTime(2000);
      expect(manager.getPresence().find(p => p.userId === 'user1')).toBeUndefined();
    });

    test('should use configurable delay', () => {
      const customManager = createPresenceManager(3000, 100); // 3 second delay
      customManager.updatePresence('user1', null);
      customManager.markDisconnected('user1');

      jest.advanceTimersByTime(2900);
      expect(customManager.getPresence().find(p => p.userId === 'user1')).toBeDefined();

      jest.advanceTimersByTime(200);
      expect(customManager.getPresence().find(p => p.userId === 'user1')).toBeUndefined();
    });
  });

  describe('Presence State', () => {
    test('should track user presence correctly', () => {
      manager.updatePresence('user1', null);
      manager.updatePresence('user2', 'todo-1');
      manager.updatePresence('user3', 'todo-2');

      const presence = manager.getPresence();
      expect(presence.length).toBe(3);
    });

    test('should update currentTodoId correctly', () => {
      manager.updatePresence('user1', 'todo-1');
      let presence = manager.getPresence();
      expect(presence.find(p => p.userId === 'user1')?.currentTodoId).toBe('todo-1');

      manager.updatePresence('user1', 'todo-2');
      presence = manager.getPresence();
      expect(presence.find(p => p.userId === 'user1')?.currentTodoId).toBe('todo-2');

      manager.updatePresence('user1', null);
      presence = manager.getPresence();
      expect(presence.find(p => p.userId === 'user1')?.currentTodoId).toBeNull();
    });

    test('should update lastSeen on presence update', () => {
      const before = new Date();
      jest.advanceTimersByTime(1000);

      manager.updatePresence('user1', null);
      const presence = manager.getPresence();
      const user = presence.find(p => p.userId === 'user1');

      expect(user?.lastSeen.getTime()).toBeGreaterThan(before.getTime());
    });
  });
});

describe('Presence Management - Requirement 9: Throttled Updates', () => {
  let manager: PresenceManager;
  let emitCount: number;
  let lastEmittedPresence: UserPresence[];

  beforeEach(() => {
    jest.useFakeTimers();
    emitCount = 0;
    lastEmittedPresence = [];

    manager = createPresenceManager(5000, 100);
    manager.setOnPresenceChange((presence) => {
      emitCount++;
      lastEmittedPresence = presence;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('100ms Throttle', () => {
    test('should emit first update immediately', () => {
      manager.updatePresence('user1', null);

      // First update should emit immediately
      expect(emitCount).toBe(1);
    });

    test('should throttle rapid updates to max 1 per 100ms', () => {
      // Rapid updates within 100ms
      manager.updatePresence('user1', 'todo-1');
      manager.updatePresence('user1', 'todo-2');
      manager.updatePresence('user1', 'todo-3');
      manager.updatePresence('user1', 'todo-4');
      manager.updatePresence('user1', 'todo-5');

      // Only first one should emit immediately
      expect(emitCount).toBe(1);

      // After 100ms, the last update should be emitted
      jest.advanceTimersByTime(100);
      expect(emitCount).toBe(2);
      expect(lastEmittedPresence.find(p => p.userId === 'user1')?.currentTodoId).toBe('todo-5');
    });

    test('should allow updates after throttle period', () => {
      manager.updatePresence('user1', 'todo-1');
      expect(emitCount).toBe(1);

      // Wait for throttle period
      jest.advanceTimersByTime(100);

      // New update should emit immediately
      manager.updatePresence('user1', 'todo-2');
      expect(emitCount).toBe(2);
    });

    test('should not emit more than 10 updates per second', () => {
      // Send 100 rapid updates
      for (let i = 0; i < 100; i++) {
        manager.updatePresence('user1', `todo-${i}`);
      }

      // Advance time by 1 second in 100ms increments
      for (let i = 0; i < 10; i++) {
        jest.advanceTimersByTime(100);
      }

      // Should have at most 11 emissions (1 immediate + 10 throttled)
      expect(emitCount).toBeLessThanOrEqual(11);
    });

    test('should use configurable throttle interval', () => {
      const customManager = createPresenceManager(5000, 200); // 200ms throttle
      let customEmitCount = 0;

      customManager.setOnPresenceChange(() => {
        customEmitCount++;
      });

      customManager.updatePresence('user1', 'todo-1');
      customManager.updatePresence('user1', 'todo-2');

      expect(customEmitCount).toBe(1);

      jest.advanceTimersByTime(150);
      expect(customEmitCount).toBe(1); // Still throttled

      jest.advanceTimersByTime(100);
      expect(customEmitCount).toBe(2); // Now emitted
    });
  });

  describe('createThrottledEmitter', () => {
    test('should throttle function calls', () => {
      let callCount = 0;
      const throttled = createThrottledEmitter(() => {
        callCount++;
      }, 100);

      throttled();
      throttled();
      throttled();

      expect(callCount).toBe(1);

      jest.advanceTimersByTime(100);
      expect(callCount).toBe(2);
    });

    test('should preserve latest arguments', () => {
      let lastArg: string = '';
      const throttled = createThrottledEmitter((arg: string) => {
        lastArg = arg;
      }, 100);

      throttled('first');
      throttled('second');
      throttled('third');

      expect(lastArg).toBe('first');

      jest.advanceTimersByTime(100);
      expect(lastArg).toBe('third');
    });
  });
});

describe('Presence Management - Edge Cases', () => {
  let manager: PresenceManager;

  beforeEach(() => {
    jest.useFakeTimers();
    manager = createPresenceManager(5000, 100);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should handle multiple users independently', () => {
    manager.updatePresence('user1', 'todo-1');
    manager.updatePresence('user2', 'todo-2');
    manager.updatePresence('user3', 'todo-3');

    manager.markDisconnected('user2');
    jest.advanceTimersByTime(5000);

    const presence = manager.getPresence();
    expect(presence.find(p => p.userId === 'user1')).toBeDefined();
    expect(presence.find(p => p.userId === 'user2')).toBeUndefined();
    expect(presence.find(p => p.userId === 'user3')).toBeDefined();
  });

  test('should handle disconnect of non-existent user gracefully', () => {
    expect(() => {
      manager.markDisconnected('nonexistent');
    }).not.toThrow();
  });

  test('should handle rapid connect/disconnect cycles', () => {
    for (let i = 0; i < 10; i++) {
      manager.updatePresence('user1', `todo-${i}`);
      manager.markDisconnected('user1');
      jest.advanceTimersByTime(1000); // Not long enough to clean up
    }

    // User should still be present
    expect(manager.getPresence().find(p => p.userId === 'user1')).toBeDefined();
  });

  test('should clean up pending timeouts on user reconnect', () => {
    manager.updatePresence('user1', null);

    // Multiple disconnects
    manager.markDisconnected('user1');
    jest.advanceTimersByTime(2000);
    manager.markDisconnected('user1');
    jest.advanceTimersByTime(2000);

    // Reconnect
    manager.updatePresence('user1', 'todo-1');

    // Wait past original timeout
    jest.advanceTimersByTime(5000);

    // User should still be present
    expect(manager.getPresence().find(p => p.userId === 'user1')).toBeDefined();
  });
});

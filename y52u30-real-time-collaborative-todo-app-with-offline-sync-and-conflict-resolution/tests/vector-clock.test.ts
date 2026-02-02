/**
 * Vector Clock Tests
 *
 * Tests for Requirements 1 and 2:
 * - Requirement 1: Four distinct comparison results (before, after, equal, concurrent)
 * - Requirement 2: Last-write-wins with deterministic tiebreaker
 */

import {
  createVectorClock,
  incrementVectorClock,
  mergeVectorClocks,
  compareVectorClocks,
  isBefore,
  isAfter,
  isConcurrent,
  isEqual,
  resolveConflict,
  lastWriteWins,
  cloneVectorClock
} from '../repository_after/src/lib/vector-clock';
import { Todo, VectorClock } from '../repository_after/src/types';

describe('Vector Clock - Requirement 1: Four Distinct Comparison Results', () => {
  describe('compareVectorClocks', () => {
    test('should return "equal" when clocks are identical', () => {
      const clockA: VectorClock = { user1: 1, user2: 2 };
      const clockB: VectorClock = { user1: 1, user2: 2 };

      expect(compareVectorClocks(clockA, clockB)).toBe('equal');
    });

    test('should return "equal" for empty clocks', () => {
      const clockA: VectorClock = {};
      const clockB: VectorClock = {};

      expect(compareVectorClocks(clockA, clockB)).toBe('equal');
    });

    test('should return "before" when clock A causally precedes B', () => {
      const clockA: VectorClock = { user1: 1 };
      const clockB: VectorClock = { user1: 2 };

      expect(compareVectorClocks(clockA, clockB)).toBe('before');
    });

    test('should return "before" when A is subset of B', () => {
      const clockA: VectorClock = { user1: 1 };
      const clockB: VectorClock = { user1: 1, user2: 1 };

      expect(compareVectorClocks(clockA, clockB)).toBe('before');
    });

    test('should return "after" when clock A causally follows B', () => {
      const clockA: VectorClock = { user1: 2 };
      const clockB: VectorClock = { user1: 1 };

      expect(compareVectorClocks(clockA, clockB)).toBe('after');
    });

    test('should return "after" when B is subset of A', () => {
      const clockA: VectorClock = { user1: 1, user2: 1 };
      const clockB: VectorClock = { user1: 1 };

      expect(compareVectorClocks(clockA, clockB)).toBe('after');
    });

    test('should return "concurrent" when neither clock dominates', () => {
      const clockA: VectorClock = { user1: 2, user2: 1 };
      const clockB: VectorClock = { user1: 1, user2: 2 };

      expect(compareVectorClocks(clockA, clockB)).toBe('concurrent');
    });

    test('should return "concurrent" for disjoint clocks', () => {
      const clockA: VectorClock = { user1: 1 };
      const clockB: VectorClock = { user2: 1 };

      expect(compareVectorClocks(clockA, clockB)).toBe('concurrent');
    });

    test('should return exactly one of four values', () => {
      const validResults = ['before', 'after', 'equal', 'concurrent'];
      const testCases = [
        [{ user1: 1 }, { user1: 1 }],
        [{ user1: 1 }, { user1: 2 }],
        [{ user1: 2 }, { user1: 1 }],
        [{ user1: 2, user2: 1 }, { user1: 1, user2: 2 }]
      ];

      for (const [clockA, clockB] of testCases) {
        const result = compareVectorClocks(clockA, clockB);
        expect(validResults).toContain(result);
      }
    });

    test('should distinguish "equal" from "concurrent"', () => {
      // Equal: all values same
      const equalA: VectorClock = { user1: 1, user2: 2 };
      const equalB: VectorClock = { user1: 1, user2: 2 };
      expect(compareVectorClocks(equalA, equalB)).toBe('equal');

      // Concurrent: mixed dominance
      const concurrentA: VectorClock = { user1: 2, user2: 1 };
      const concurrentB: VectorClock = { user1: 1, user2: 2 };
      expect(compareVectorClocks(concurrentA, concurrentB)).toBe('concurrent');

      // These must be different results
      expect(compareVectorClocks(equalA, equalB)).not.toBe(
        compareVectorClocks(concurrentA, concurrentB)
      );
    });
  });

  describe('Helper functions', () => {
    test('isBefore should return true only for "before" comparison', () => {
      expect(isBefore({ user1: 1 }, { user1: 2 })).toBe(true);
      expect(isBefore({ user1: 2 }, { user1: 1 })).toBe(false);
      expect(isBefore({ user1: 1 }, { user1: 1 })).toBe(false);
      expect(isBefore({ user1: 2, user2: 1 }, { user1: 1, user2: 2 })).toBe(false);
    });

    test('isAfter should return true only for "after" comparison', () => {
      expect(isAfter({ user1: 2 }, { user1: 1 })).toBe(true);
      expect(isAfter({ user1: 1 }, { user1: 2 })).toBe(false);
      expect(isAfter({ user1: 1 }, { user1: 1 })).toBe(false);
      expect(isAfter({ user1: 2, user2: 1 }, { user1: 1, user2: 2 })).toBe(false);
    });

    test('isConcurrent should return true only for "concurrent" comparison', () => {
      expect(isConcurrent({ user1: 2, user2: 1 }, { user1: 1, user2: 2 })).toBe(true);
      expect(isConcurrent({ user1: 1 }, { user1: 2 })).toBe(false);
      expect(isConcurrent({ user1: 1 }, { user1: 1 })).toBe(false);
    });

    test('isEqual should return true only for "equal" comparison', () => {
      expect(isEqual({ user1: 1 }, { user1: 1 })).toBe(true);
      expect(isEqual({ user1: 1 }, { user1: 2 })).toBe(false);
      expect(isEqual({ user1: 2, user2: 1 }, { user1: 1, user2: 2 })).toBe(false);
    });
  });
});

describe('Vector Clock - Requirement 2: Deterministic Tiebreaker', () => {
  const createTestTodo = (
    id: string,
    vectorClock: VectorClock,
    updatedAt: Date,
    updatedBy: string
  ): Todo => ({
    id,
    title: `Todo ${id}`,
    completed: false,
    position: 0,
    vectorClock,
    createdAt: new Date('2024-01-01'),
    updatedAt,
    createdBy: 'creator',
    updatedBy,
    deletedAt: null
  });

  describe('lastWriteWins', () => {
    test('should pick todo with later updated_at', () => {
      const earlier = new Date('2024-01-01T10:00:00Z');
      const later = new Date('2024-01-01T10:00:01Z');

      const todoA = createTestTodo('1', { user1: 1 }, later, 'userA');
      const todoB = createTestTodo('1', { user1: 1 }, earlier, 'userB');

      expect(lastWriteWins(todoA, todoB)).toBe(todoA);
      expect(lastWriteWins(todoB, todoA)).toBe(todoA);
    });

    test('should use lexicographic user ID comparison when timestamps equal', () => {
      const sameTime = new Date('2024-01-01T10:00:00Z');

      // 'alice' < 'bob' lexicographically
      const todoAlice = createTestTodo('1', { user1: 1 }, sameTime, 'alice');
      const todoBob = createTestTodo('1', { user1: 1 }, sameTime, 'bob');

      // Should pick 'alice' because it comes first lexicographically
      expect(lastWriteWins(todoAlice, todoBob)).toBe(todoAlice);
      expect(lastWriteWins(todoBob, todoAlice)).toBe(todoAlice);
    });

    test('should be deterministic regardless of argument order', () => {
      const sameTime = new Date('2024-01-01T10:00:00Z');
      const todoA = createTestTodo('1', { user1: 1 }, sameTime, 'userA');
      const todoB = createTestTodo('1', { user1: 1 }, sameTime, 'userB');

      // Same result regardless of order
      const result1 = lastWriteWins(todoA, todoB);
      const result2 = lastWriteWins(todoB, todoA);
      expect(result1).toBe(result2);
    });

    test('should handle identical todos', () => {
      const time = new Date('2024-01-01T10:00:00Z');
      const todoA = createTestTodo('1', { user1: 1 }, time, 'user');
      const todoB = createTestTodo('1', { user1: 1 }, time, 'user');

      // Should return one of them consistently
      const result = lastWriteWins(todoA, todoB);
      expect(result).toBeDefined();
    });
  });

  describe('resolveConflict', () => {
    test('should use todo with later vector clock if one dominates', () => {
      const todoA = createTestTodo('1', { user1: 2 }, new Date(), 'userA');
      const todoB = createTestTodo('1', { user1: 1 }, new Date(), 'userB');

      expect(resolveConflict(todoA, todoB)).toBe(todoA);
      expect(resolveConflict(todoB, todoA)).toBe(todoA);
    });

    test('should return either for equal clocks', () => {
      const time = new Date('2024-01-01T10:00:00Z');
      const todoA = createTestTodo('1', { user1: 1 }, time, 'user');
      const todoB = createTestTodo('1', { user1: 1 }, time, 'user');

      const result = resolveConflict(todoA, todoB);
      expect([todoA, todoB]).toContain(result);
    });

    test('should use lastWriteWins for concurrent modifications', () => {
      const earlier = new Date('2024-01-01T10:00:00Z');
      const later = new Date('2024-01-01T10:00:01Z');

      // Concurrent clocks (neither dominates)
      const todoA = createTestTodo('1', { user1: 2, user2: 1 }, later, 'userA');
      const todoB = createTestTodo('1', { user1: 1, user2: 2 }, earlier, 'userB');

      // Should pick the one with later timestamp
      expect(resolveConflict(todoA, todoB)).toBe(todoA);
    });

    test('should produce same result on all clients for concurrent edits', () => {
      const sameTime = new Date('2024-01-01T10:00:00Z');

      // Concurrent modifications from different users
      const todoFromAlice = createTestTodo('1', { alice: 1 }, sameTime, 'alice');
      const todoFromBob = createTestTodo('1', { bob: 1 }, sameTime, 'bob');

      // Both clients should resolve to the same todo
      const resultOnClient1 = resolveConflict(todoFromAlice, todoFromBob);
      const resultOnClient2 = resolveConflict(todoFromBob, todoFromAlice);

      expect(resultOnClient1.updatedBy).toBe(resultOnClient2.updatedBy);
    });
  });
});

describe('Vector Clock - Basic Operations', () => {
  test('createVectorClock should initialize with user having value 1', () => {
    const clock = createVectorClock('user1');
    expect(clock).toEqual({ user1: 1 });
  });

  test('incrementVectorClock should increase user value', () => {
    const clock = createVectorClock('user1');
    const incremented = incrementVectorClock(clock, 'user1');
    expect(incremented.user1).toBe(2);
  });

  test('incrementVectorClock should add new user if not present', () => {
    const clock = createVectorClock('user1');
    const incremented = incrementVectorClock(clock, 'user2');
    expect(incremented).toEqual({ user1: 1, user2: 1 });
  });

  test('mergeVectorClocks should take maximum of each entry', () => {
    const clockA: VectorClock = { user1: 2, user2: 1 };
    const clockB: VectorClock = { user1: 1, user2: 3, user3: 1 };

    const merged = mergeVectorClocks(clockA, clockB);
    expect(merged).toEqual({ user1: 2, user2: 3, user3: 1 });
  });

  test('cloneVectorClock should create independent copy', () => {
    const original: VectorClock = { user1: 1 };
    const cloned = cloneVectorClock(original);

    cloned.user1 = 5;
    expect(original.user1).toBe(1);
  });
});

/**
 * Vector Clock implementation for conflict detection and resolution
 *
 * Requirement 1: Vector clock comparison must return four distinct results
 * Requirement 2: Last-write-wins with deterministic tiebreaker
 */

import { VectorClock, VectorClockComparison, Todo } from '../types';

/**
 * Create a new vector clock with initial value for a user
 */
export function createVectorClock(userId: string): VectorClock {
  return { [userId]: 1 };
}

/**
 * Increment the vector clock for a specific user
 */
export function incrementVectorClock(clock: VectorClock, userId: string): VectorClock {
  return {
    ...clock,
    [userId]: (clock[userId] || 0) + 1
  };
}

/**
 * Merge two vector clocks, taking the maximum value for each user
 */
export function mergeVectorClocks(clockA: VectorClock, clockB: VectorClock): VectorClock {
  const merged: VectorClock = { ...clockA };

  for (const [userId, timestamp] of Object.entries(clockB)) {
    merged[userId] = Math.max(merged[userId] || 0, timestamp);
  }

  return merged;
}

/**
 * Compare two vector clocks
 *
 * Requirement 1: Returns four distinct results:
 * - "before": clock A causally precedes B (A happened-before B)
 * - "after": clock A causally follows B (B happened-before A)
 * - "equal": clocks are identical
 * - "concurrent": neither clock dominates (concurrent modifications)
 *
 * A clock dominates another if all its entries are >= the other's entries,
 * and at least one entry is strictly greater.
 */
export function compareVectorClocks(clockA: VectorClock, clockB: VectorClock): VectorClockComparison {
  const allUsers = new Set([...Object.keys(clockA), ...Object.keys(clockB)]);

  let aGreater = false;
  let bGreater = false;

  for (const userId of allUsers) {
    const valueA = clockA[userId] || 0;
    const valueB = clockB[userId] || 0;

    if (valueA > valueB) {
      aGreater = true;
    } else if (valueB > valueA) {
      bGreater = true;
    }
  }

  // Requirement 1: Four distinct results
  if (!aGreater && !bGreater) {
    return 'equal'; // All entries are equal
  } else if (aGreater && !bGreater) {
    return 'after'; // A dominates B, so A is after B
  } else if (!aGreater && bGreater) {
    return 'before'; // B dominates A, so A is before B
  } else {
    return 'concurrent'; // Neither dominates - concurrent modification
  }
}

/**
 * Check if clock A is causally before clock B
 */
export function isBefore(clockA: VectorClock, clockB: VectorClock): boolean {
  return compareVectorClocks(clockA, clockB) === 'before';
}

/**
 * Check if clock A is causally after clock B
 */
export function isAfter(clockA: VectorClock, clockB: VectorClock): boolean {
  return compareVectorClocks(clockA, clockB) === 'after';
}

/**
 * Check if two clocks are concurrent (neither dominates)
 */
export function isConcurrent(clockA: VectorClock, clockB: VectorClock): boolean {
  return compareVectorClocks(clockA, clockB) === 'concurrent';
}

/**
 * Check if two clocks are equal
 */
export function isEqual(clockA: VectorClock, clockB: VectorClock): boolean {
  return compareVectorClocks(clockA, clockB) === 'equal';
}

/**
 * Resolve conflict between two todos using last-write-wins strategy
 *
 * Requirement 2: Deterministic tiebreaker for concurrent clocks
 * 1. Compare updated_at timestamps
 * 2. If equal, use lexicographic comparison of updated_by user IDs
 *
 * This ensures all clients resolve the same conflict identically
 */
export function resolveConflict(todoA: Todo, todoB: Todo): Todo {
  const comparison = compareVectorClocks(todoA.vectorClock, todoB.vectorClock);

  // If one clearly happened after the other, use that one
  if (comparison === 'after') {
    return todoA;
  }
  if (comparison === 'before') {
    return todoB;
  }
  if (comparison === 'equal') {
    // Identical states - return either (they're the same)
    return todoA;
  }

  // Concurrent modification - use deterministic tiebreaker (Requirement 2)
  return lastWriteWins(todoA, todoB);
}

/**
 * Last-write-wins conflict resolution with deterministic tiebreaker
 *
 * Requirement 2:
 * 1. Compare updated_at first
 * 2. If equal, use lexicographic comparison of updated_by user IDs
 */
export function lastWriteWins(todoA: Todo, todoB: Todo): Todo {
  const timeA = todoA.updatedAt.getTime();
  const timeB = todoB.updatedAt.getTime();

  if (timeA > timeB) {
    return todoA;
  }
  if (timeB > timeA) {
    return todoB;
  }

  // Timestamps are equal - use lexicographic user ID comparison (Requirement 2)
  if (todoA.updatedBy < todoB.updatedBy) {
    return todoA;
  }
  if (todoB.updatedBy < todoA.updatedBy) {
    return todoB;
  }

  // Completely identical - return A (arbitrary but deterministic)
  return todoA;
}

/**
 * Get the sum of all values in a vector clock (useful for debugging)
 */
export function getVectorClockSum(clock: VectorClock): number {
  return Object.values(clock).reduce((sum, val) => sum + val, 0);
}

/**
 * Create a copy of a vector clock
 */
export function cloneVectorClock(clock: VectorClock): VectorClock {
  return { ...clock };
}

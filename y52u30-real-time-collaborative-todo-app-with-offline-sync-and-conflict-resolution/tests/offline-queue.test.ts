/**
 * Offline Queue Tests
 *
 * Tests for Requirements 4 and 12:
 * - Requirement 4: Use monotonically increasing sequence numbers for ordering
 * - Requirement 12: Use crypto.randomUUID() for client-generated IDs
 */

import {
  OfflineQueue,
  createOfflineQueue,
  generateUUID,
  isValidOperation,
  compareOperations
} from '../repository_after/src/lib/offline-queue';
import { OfflineOperation } from '../repository_after/src/types';

describe('Offline Queue - Requirement 4: Sequence Numbers', () => {
  let queue: OfflineQueue;

  beforeEach(() => {
    queue = createOfflineQueue();
  });

  describe('Monotonically Increasing Sequence Numbers', () => {
    test('should assign sequence numbers starting from 1', () => {
      const op = queue.enqueue('create', 'todo-1', { title: 'Test' }, 'user1');
      expect(op.sequenceNumber).toBe(1);
    });

    test('should increment sequence numbers monotonically', () => {
      const op1 = queue.enqueue('create', 'todo-1', null, 'user1');
      const op2 = queue.enqueue('update', 'todo-1', null, 'user1');
      const op3 = queue.enqueue('delete', 'todo-1', null, 'user1');

      expect(op1.sequenceNumber).toBe(1);
      expect(op2.sequenceNumber).toBe(2);
      expect(op3.sequenceNumber).toBe(3);
    });

    test('should never reuse sequence numbers', () => {
      queue.enqueue('create', 'todo-1', null, 'user1');
      queue.enqueue('create', 'todo-2', null, 'user1');
      queue.markSynced(1);
      queue.pruneSyncedOperations();

      const op = queue.enqueue('create', 'todo-3', null, 'user1');
      expect(op.sequenceNumber).toBe(3); // Not 1, even though queue was pruned
    });

    test('sequence numbers should be integers', () => {
      for (let i = 0; i < 10; i++) {
        const op = queue.enqueue('create', `todo-${i}`, null, 'user1');
        expect(Number.isInteger(op.sequenceNumber)).toBe(true);
      }
    });
  });

  describe('Replay Order', () => {
    test('should replay operations in sequence number order, not timestamp order', () => {
      // Create operations that might have out-of-order timestamps
      const op1 = queue.enqueue('create', 'todo-1', null, 'user1');
      const op2 = queue.enqueue('update', 'todo-1', null, 'user1');
      const op3 = queue.enqueue('delete', 'todo-2', null, 'user1');

      const pending = queue.getPendingOperations();

      // Should be ordered by sequence number
      expect(pending[0].sequenceNumber).toBe(1);
      expect(pending[1].sequenceNumber).toBe(2);
      expect(pending[2].sequenceNumber).toBe(3);
    });

    test('replay should return operations sorted by sequence number', () => {
      queue.enqueue('create', 'todo-1', null, 'user1');
      queue.enqueue('update', 'todo-1', null, 'user1');
      queue.enqueue('create', 'todo-2', null, 'user1');

      const replay = queue.replay();

      for (let i = 1; i < replay.length; i++) {
        expect(replay[i].sequenceNumber).toBeGreaterThan(replay[i - 1].sequenceNumber);
      }
    });

    test('should handle rapid operations within same millisecond', () => {
      // Simulate rapid operations that could have same timestamp
      const operations: OfflineOperation[] = [];
      for (let i = 0; i < 100; i++) {
        operations.push(queue.enqueue('update', `todo-${i % 10}`, null, 'user1'));
      }

      // Verify all have unique, sequential sequence numbers
      const sequenceNumbers = operations.map(op => op.sequenceNumber);
      const uniqueNumbers = new Set(sequenceNumbers);
      expect(uniqueNumbers.size).toBe(100);

      // Verify they're in order
      for (let i = 1; i < sequenceNumbers.length; i++) {
        expect(sequenceNumbers[i]).toBe(sequenceNumbers[i - 1] + 1);
      }
    });
  });

  describe('Sync Tracking', () => {
    test('should track last synced sequence number', () => {
      queue.enqueue('create', 'todo-1', null, 'user1');
      queue.enqueue('create', 'todo-2', null, 'user1');
      queue.enqueue('create', 'todo-3', null, 'user1');

      expect(queue.getLastSyncedSequenceNumber()).toBe(0);

      queue.markSynced(2);
      expect(queue.getLastSyncedSequenceNumber()).toBe(2);
    });

    test('should only return pending operations after last sync', () => {
      queue.enqueue('create', 'todo-1', null, 'user1');
      queue.enqueue('create', 'todo-2', null, 'user1');
      queue.enqueue('create', 'todo-3', null, 'user1');

      queue.markSynced(2);

      const pending = queue.getPendingOperations();
      expect(pending.length).toBe(1);
      expect(pending[0].sequenceNumber).toBe(3);
    });

    test('should not replay already-synced changes', () => {
      queue.enqueue('create', 'todo-1', null, 'user1');
      queue.enqueue('update', 'todo-1', null, 'user1');
      queue.markSynced(2);

      queue.enqueue('delete', 'todo-1', null, 'user1');

      const replay = queue.replay();
      expect(replay.length).toBe(1);
      expect(replay[0].operationType).toBe('delete');
    });
  });

  describe('compareOperations', () => {
    test('should sort by sequence number', () => {
      const opA: OfflineOperation = {
        sequenceNumber: 5,
        operationType: 'create',
        todoId: 'a',
        payload: null,
        timestamp: new Date(),
        userId: 'user1'
      };
      const opB: OfflineOperation = {
        sequenceNumber: 3,
        operationType: 'create',
        todoId: 'b',
        payload: null,
        timestamp: new Date(),
        userId: 'user1'
      };

      expect(compareOperations(opA, opB)).toBeGreaterThan(0);
      expect(compareOperations(opB, opA)).toBeLessThan(0);
      expect(compareOperations(opA, opA)).toBe(0);
    });
  });
});

describe('Offline Queue - Requirement 12: crypto.randomUUID()', () => {
  describe('generateUUID', () => {
    test('should generate valid UUID format', () => {
      const uuid = generateUUID();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    test('should generate unique UUIDs', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(1000);
    });

    test('should not collide when called rapidly', () => {
      const uuids: string[] = [];
      for (let i = 0; i < 100; i++) {
        uuids.push(generateUUID());
      }

      const unique = new Set(uuids);
      expect(unique.size).toBe(uuids.length);
    });

    test('should be cryptographically random (not timestamp-based)', () => {
      // Generate multiple UUIDs and check they don't follow a pattern
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      const uuid3 = generateUUID();

      // Timestamps would create similar prefixes
      expect(uuid1.substring(0, 8)).not.toBe(uuid2.substring(0, 8));
      expect(uuid2.substring(0, 8)).not.toBe(uuid3.substring(0, 8));
    });

    test('should use version 4 UUID format', () => {
      const uuid = generateUUID();
      // Version 4 UUIDs have '4' as the 13th character
      expect(uuid.charAt(14)).toBe('4');
      // And variant bits (8, 9, a, or b) as the 17th character
      expect(['8', '9', 'a', 'b']).toContain(uuid.charAt(19).toLowerCase());
    });
  });

  describe('Collision Prevention', () => {
    test('should handle simultaneous offline clients creating todos', () => {
      // Simulate multiple "clients" creating todos at the same time
      const client1Ids: string[] = [];
      const client2Ids: string[] = [];
      const client3Ids: string[] = [];

      for (let i = 0; i < 100; i++) {
        client1Ids.push(generateUUID());
        client2Ids.push(generateUUID());
        client3Ids.push(generateUUID());
      }

      const allIds = [...client1Ids, ...client2Ids, ...client3Ids];
      const uniqueIds = new Set(allIds);

      // No collisions across all clients
      expect(uniqueIds.size).toBe(allIds.length);
    });
  });
});

describe('Offline Queue - Additional Operations', () => {
  let queue: OfflineQueue;

  beforeEach(() => {
    queue = createOfflineQueue();
  });

  test('should report pending count correctly', () => {
    expect(queue.getPendingCount()).toBe(0);

    queue.enqueue('create', 'todo-1', null, 'user1');
    expect(queue.getPendingCount()).toBe(1);

    queue.enqueue('create', 'todo-2', null, 'user1');
    expect(queue.getPendingCount()).toBe(2);

    queue.markSynced(1);
    expect(queue.getPendingCount()).toBe(1);
  });

  test('should check for pending operations', () => {
    expect(queue.hasPendingOperations()).toBe(false);

    queue.enqueue('create', 'todo-1', null, 'user1');
    expect(queue.hasPendingOperations()).toBe(true);

    queue.markSynced(1);
    expect(queue.hasPendingOperations()).toBe(false);
  });

  test('should remove specific operation', () => {
    queue.enqueue('create', 'todo-1', null, 'user1');
    const op2 = queue.enqueue('create', 'todo-2', null, 'user1');
    queue.enqueue('create', 'todo-3', null, 'user1');

    const removed = queue.removeOperation(op2.sequenceNumber);
    expect(removed).toBe(true);

    const all = queue.getAllOperations();
    expect(all.length).toBe(2);
    expect(all.find(op => op.sequenceNumber === 2)).toBeUndefined();
  });

  test('should get operation by sequence number', () => {
    queue.enqueue('create', 'todo-1', null, 'user1');
    const op2 = queue.enqueue('update', 'todo-1', { title: 'Updated' }, 'user1');

    const found = queue.getOperation(2);
    expect(found).toBeDefined();
    expect(found?.operationType).toBe('update');
  });

  test('should clear all operations', () => {
    queue.enqueue('create', 'todo-1', null, 'user1');
    queue.enqueue('create', 'todo-2', null, 'user1');

    queue.clear();

    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getAllOperations().length).toBe(0);
  });
});

describe('isValidOperation', () => {
  test('should validate correct operation', () => {
    const op: OfflineOperation = {
      sequenceNumber: 1,
      operationType: 'create',
      todoId: 'todo-123',
      payload: null,
      timestamp: new Date(),
      userId: 'user1'
    };
    expect(isValidOperation(op)).toBe(true);
  });

  test('should reject operation with invalid sequence number', () => {
    const op: OfflineOperation = {
      sequenceNumber: 0,
      operationType: 'create',
      todoId: 'todo-123',
      payload: null,
      timestamp: new Date(),
      userId: 'user1'
    };
    expect(isValidOperation(op)).toBe(false);
  });

  test('should reject operation with negative sequence number', () => {
    const op: OfflineOperation = {
      sequenceNumber: -1,
      operationType: 'create',
      todoId: 'todo-123',
      payload: null,
      timestamp: new Date(),
      userId: 'user1'
    };
    expect(isValidOperation(op)).toBe(false);
  });

  test('should reject operation with empty todoId', () => {
    const op: OfflineOperation = {
      sequenceNumber: 1,
      operationType: 'create',
      todoId: '',
      payload: null,
      timestamp: new Date(),
      userId: 'user1'
    };
    expect(isValidOperation(op)).toBe(false);
  });

  test('should reject operation with invalid operation type', () => {
    const op = {
      sequenceNumber: 1,
      operationType: 'invalid',
      todoId: 'todo-123',
      payload: null,
      timestamp: new Date(),
      userId: 'user1'
    } as OfflineOperation;
    expect(isValidOperation(op)).toBe(false);
  });
});

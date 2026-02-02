/**
 * Sync Manager Tests
 *
 * Tests for Requirement 11:
 * - Only send changes since lastSyncTimestamp (not full state)
 */

import {
  SyncManager,
  createSyncManager,
  filterTodosSinceTimestamp,
  mergeTodos,
  detectConflicts,
  applyServerState,
  calculateSyncSavings
} from '../repository_after/src/lib/sync';
import { Todo, VectorClock } from '../repository_after/src/types';

const createTestTodo = (
  id: string,
  updatedAt: Date,
  vectorClock: VectorClock = { user1: 1 }
): Todo => ({
  id,
  title: `Todo ${id}`,
  completed: false,
  position: 0,
  vectorClock,
  createdAt: new Date('2024-01-01'),
  updatedAt,
  createdBy: 'user1',
  updatedBy: 'user1',
  deletedAt: null
});

describe('Sync - Requirement 11: Incremental Sync', () => {
  describe('filterTodosSinceTimestamp', () => {
    test('should return all todos when lastSyncTimestamp is null', () => {
      const todos = [
        createTestTodo('1', new Date('2024-01-01T10:00:00Z')),
        createTestTodo('2', new Date('2024-01-01T11:00:00Z')),
        createTestTodo('3', new Date('2024-01-01T12:00:00Z'))
      ];

      const filtered = filterTodosSinceTimestamp(todos, null);
      expect(filtered.length).toBe(3);
    });

    test('should filter todos updated after lastSyncTimestamp', () => {
      const syncTime = new Date('2024-01-01T11:00:00Z');
      const todos = [
        createTestTodo('1', new Date('2024-01-01T10:00:00Z')), // Before
        createTestTodo('2', new Date('2024-01-01T11:00:00Z')), // Equal (not included)
        createTestTodo('3', new Date('2024-01-01T12:00:00Z'))  // After
      ];

      const filtered = filterTodosSinceTimestamp(todos, syncTime);
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('3');
    });

    test('should return empty array when all todos are older', () => {
      const syncTime = new Date('2024-01-01T15:00:00Z');
      const todos = [
        createTestTodo('1', new Date('2024-01-01T10:00:00Z')),
        createTestTodo('2', new Date('2024-01-01T11:00:00Z')),
        createTestTodo('3', new Date('2024-01-01T12:00:00Z'))
      ];

      const filtered = filterTodosSinceTimestamp(todos, syncTime);
      expect(filtered.length).toBe(0);
    });

    test('should handle empty todos array', () => {
      const filtered = filterTodosSinceTimestamp([], new Date());
      expect(filtered.length).toBe(0);
    });

    test('should not modify original array', () => {
      const todos = [
        createTestTodo('1', new Date('2024-01-01T10:00:00Z')),
        createTestTodo('2', new Date('2024-01-01T12:00:00Z'))
      ];
      const originalLength = todos.length;

      filterTodosSinceTimestamp(todos, new Date('2024-01-01T11:00:00Z'));

      expect(todos.length).toBe(originalLength);
    });

    test('should include millisecond precision', () => {
      const syncTime = new Date('2024-01-01T10:00:00.500Z');
      const todos = [
        createTestTodo('1', new Date('2024-01-01T10:00:00.400Z')), // Before
        createTestTodo('2', new Date('2024-01-01T10:00:00.500Z')), // Equal
        createTestTodo('3', new Date('2024-01-01T10:00:00.600Z'))  // After
      ];

      const filtered = filterTodosSinceTimestamp(todos, syncTime);
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('3');
    });
  });

  describe('calculateSyncSavings', () => {
    test('should calculate bandwidth savings correctly', () => {
      const totalTodos = 100;
      const sentTodos = 5;

      const savings = calculateSyncSavings(totalTodos, sentTodos);

      expect(savings.totalTodos).toBe(100);
      expect(savings.sentTodos).toBe(5);
      expect(savings.savedTodos).toBe(95);
      expect(savings.savingsPercentage).toBe(95);
    });

    test('should handle zero savings', () => {
      const savings = calculateSyncSavings(10, 10);

      expect(savings.savingsPercentage).toBe(0);
      expect(savings.savedTodos).toBe(0);
    });

    test('should handle empty state', () => {
      const savings = calculateSyncSavings(0, 0);

      expect(savings.savingsPercentage).toBe(0);
      expect(savings.savedTodos).toBe(0);
    });

    test('should calculate high savings for many unchanged todos', () => {
      const savings = calculateSyncSavings(1000, 1);

      expect(savings.savingsPercentage).toBe(99.9);
      expect(savings.savedTodos).toBe(999);
    });
  });
});

describe('Sync - Merge Operations', () => {
  describe('mergeTodos', () => {
    test('should add new todos from server', () => {
      const local = new Map<string, Todo>();
      local.set('1', createTestTodo('1', new Date()));

      const server = [
        createTestTodo('2', new Date()),
        createTestTodo('3', new Date())
      ];

      const merged = mergeTodos(local, server);

      expect(merged.size).toBe(3);
      expect(merged.has('1')).toBe(true);
      expect(merged.has('2')).toBe(true);
      expect(merged.has('3')).toBe(true);
    });

    test('should resolve conflicts using vector clocks', () => {
      const localTodo = createTestTodo('1', new Date('2024-01-01T10:00:00Z'), { user1: 2 });
      localTodo.title = 'Local Title';

      const local = new Map<string, Todo>();
      local.set('1', localTodo);

      const serverTodo = createTestTodo('1', new Date('2024-01-01T11:00:00Z'), { user1: 1 });
      serverTodo.title = 'Server Title';

      const merged = mergeTodos(local, [serverTodo]);

      // Local has higher vector clock, should win
      expect(merged.get('1')?.title).toBe('Local Title');
    });

    test('should preserve local-only todos', () => {
      const localTodo = createTestTodo('local-only', new Date());
      const local = new Map<string, Todo>();
      local.set('local-only', localTodo);

      const merged = mergeTodos(local, []);

      expect(merged.has('local-only')).toBe(true);
    });

    test('should handle empty local state', () => {
      const local = new Map<string, Todo>();
      const server = [createTestTodo('1', new Date())];

      const merged = mergeTodos(local, server);

      expect(merged.size).toBe(1);
    });
  });

  describe('detectConflicts', () => {
    test('should detect concurrent modifications', () => {
      const localTodo = createTestTodo('1', new Date(), { user1: 2, user2: 1 });
      const serverTodo = createTestTodo('1', new Date(), { user1: 1, user2: 2 });

      const conflicts = detectConflicts([localTodo], [serverTodo]);

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].todoId).toBe('1');
      expect(conflicts[0].type).toBe('concurrent');
    });

    test('should not flag non-conflicting updates', () => {
      const localTodo = createTestTodo('1', new Date(), { user1: 1 });
      const serverTodo = createTestTodo('1', new Date(), { user1: 2 });

      const conflicts = detectConflicts([localTodo], [serverTodo]);

      // Server has higher clock, no conflict (it's just newer)
      expect(conflicts.length).toBe(0);
    });

    test('should handle multiple conflicts', () => {
      const localTodos = [
        createTestTodo('1', new Date(), { user1: 2, user2: 1 }),
        createTestTodo('2', new Date(), { user1: 2, user2: 1 })
      ];
      const serverTodos = [
        createTestTodo('1', new Date(), { user1: 1, user2: 2 }),
        createTestTodo('2', new Date(), { user1: 1, user2: 2 })
      ];

      const conflicts = detectConflicts(localTodos, serverTodos);

      expect(conflicts.length).toBe(2);
    });

    test('should return empty array for no conflicts', () => {
      const localTodos = [createTestTodo('1', new Date())];
      const serverTodos = [createTestTodo('2', new Date())];

      const conflicts = detectConflicts(localTodos, serverTodos);

      expect(conflicts.length).toBe(0);
    });
  });
});

describe('Sync - SyncManager', () => {
  let manager: SyncManager;

  beforeEach(() => {
    manager = createSyncManager();
  });

  test('should track last sync timestamp', () => {
    expect(manager.getLastSyncTimestamp()).toBeNull();

    const timestamp = new Date('2024-01-01T12:00:00Z');
    manager.setLastSyncTimestamp(timestamp);

    expect(manager.getLastSyncTimestamp()).toEqual(timestamp);
  });

  test('should generate sync request with timestamp', () => {
    const timestamp = new Date('2024-01-01T12:00:00Z');
    manager.setLastSyncTimestamp(timestamp);

    const request = manager.createSyncRequest();

    expect(request.lastSyncTimestamp).toEqual(timestamp);
  });

  test('should create initial sync request with null timestamp', () => {
    const request = manager.createSyncRequest();

    expect(request.lastSyncTimestamp).toBeNull();
  });

  test('should apply server state and update timestamp', () => {
    const todos = new Map<string, Todo>();
    const serverTodos = [createTestTodo('1', new Date())];
    const syncTimestamp = new Date('2024-01-01T12:00:00Z');

    const result = manager.applySyncResponse(todos, serverTodos, syncTimestamp);

    expect(result.todos.size).toBe(1);
    expect(manager.getLastSyncTimestamp()).toEqual(syncTimestamp);
  });

  test('should track sync statistics', () => {
    const todos = new Map<string, Todo>();
    for (let i = 0; i < 100; i++) {
      todos.set(`${i}`, createTestTodo(`${i}`, new Date('2024-01-01T10:00:00Z')));
    }

    const serverTodos = [
      createTestTodo('new-1', new Date('2024-01-01T12:00:00Z'))
    ];

    manager.applySyncResponse(todos, serverTodos, new Date());
    const stats = manager.getSyncStats();

    expect(stats.lastSyncedCount).toBe(1);
  });
});

describe('applyServerState', () => {
  test('should merge server state into local state', () => {
    const local = new Map<string, Todo>();
    local.set('1', createTestTodo('1', new Date()));

    const server = [
      createTestTodo('1', new Date(), { user1: 2 }), // Updated
      createTestTodo('2', new Date()) // New
    ];

    const result = applyServerState(local, server);

    expect(result.size).toBe(2);
    expect(result.get('1')?.vectorClock.user1).toBe(2);
  });

  test('should handle soft-deleted todos', () => {
    const local = new Map<string, Todo>();
    const activeTodo = createTestTodo('1', new Date('2024-01-01T10:00:00Z'));
    local.set('1', activeTodo);

    // Server todo is newer and has deletedAt set
    const deletedTodo = createTestTodo('1', new Date('2024-01-01T12:00:00Z'), { user1: 2 });
    deletedTodo.deletedAt = new Date('2024-01-01T12:00:00Z');

    const result = applyServerState(local, [deletedTodo]);

    // Server version wins because it has higher vector clock
    expect(result.get('1')?.deletedAt).not.toBeNull();
  });
});

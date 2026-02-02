/**
 * Todo Store Tests
 *
 * Tests for Requirements 6, 7, and 10:
 * - Requirement 6: Store complete previous state, atomic rollback, single re-render
 * - Requirement 7: Soft delete with deleted_at timestamp
 * - Requirement 10: Reorder updates vector clocks for ALL affected todos
 */

import {
  TodoStore,
  createTodoStore,
  OptimisticStateManager
} from '../repository_after/src/store/todoStore';
import { Todo } from '../repository_after/src/types';

describe('Todo Store - Requirement 6: Optimistic Updates', () => {
  let store: TodoStore;

  beforeEach(() => {
    store = createTodoStore('test-user');
  });

  describe('OptimisticStateManager', () => {
    let manager: OptimisticStateManager;

    beforeEach(() => {
      manager = new OptimisticStateManager();
    });

    test('should store complete previous state', () => {
      const todo: Todo = {
        id: 'todo-1',
        title: 'Original Title',
        completed: false,
        position: 0,
        vectorClock: { user1: 1 },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user1',
        updatedBy: 'user1',
        deletedAt: null
      };

      manager.storePreviousState('op-1', todo);
      const stored = manager.getPreviousState('op-1');

      expect(stored).toBeDefined();
      expect(stored?.title).toBe('Original Title');
      expect(stored?.vectorClock).toEqual({ user1: 1 });
    });

    test('should create deep copy of state', () => {
      const todo: Todo = {
        id: 'todo-1',
        title: 'Original',
        completed: false,
        position: 0,
        vectorClock: { user1: 1 },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user1',
        updatedBy: 'user1',
        deletedAt: null
      };

      manager.storePreviousState('op-1', todo);

      // Modify original
      todo.title = 'Modified';
      todo.vectorClock.user1 = 5;

      // Stored should be unchanged
      const stored = manager.getPreviousState('op-1');
      expect(stored?.title).toBe('Original');
      expect(stored?.vectorClock.user1).toBe(1);
    });

    test('should track pending operations', () => {
      const todo: Todo = {
        id: 'todo-1',
        title: 'Test',
        completed: false,
        position: 0,
        vectorClock: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user1',
        updatedBy: 'user1',
        deletedAt: null
      };

      manager.storePreviousState('op-1', todo);
      manager.storePreviousState('op-2', todo);

      expect(manager.isPending('op-1')).toBe(true);
      expect(manager.isPending('op-2')).toBe(true);
      expect(manager.isPending('op-3')).toBe(false);

      expect(manager.getPendingOperationIds()).toHaveLength(2);
    });

    test('should confirm operations', () => {
      const todo: Todo = {
        id: 'todo-1',
        title: 'Test',
        completed: false,
        position: 0,
        vectorClock: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user1',
        updatedBy: 'user1',
        deletedAt: null
      };

      manager.storePreviousState('op-1', todo);
      expect(manager.isPending('op-1')).toBe(true);

      manager.confirmOperation('op-1');

      expect(manager.isPending('op-1')).toBe(false);
      expect(manager.getPreviousState('op-1')).toBeUndefined();
    });

    test('rollback should return previous state and remove from pending', () => {
      const todo: Todo = {
        id: 'todo-1',
        title: 'Original',
        completed: false,
        position: 0,
        vectorClock: { user1: 1 },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user1',
        updatedBy: 'user1',
        deletedAt: null
      };

      manager.storePreviousState('op-1', todo);
      const rolled = manager.rollback('op-1');

      expect(rolled?.title).toBe('Original');
      expect(manager.isPending('op-1')).toBe(false);
      expect(manager.getPreviousState('op-1')).toBeUndefined();
    });
  });

  describe('Store Optimistic Updates', () => {
    test('should store previous state before update', () => {
      const { todo } = store.createTodo('Test Todo');
      const { operationId } = store.updateTodo(todo.id, { title: 'Updated' });

      const manager = store.getOptimisticManager();
      expect(manager.isPending(operationId)).toBe(true);
    });

    test('should rollback to previous state atomically', () => {
      const { todo } = store.createTodo('Original Title');
      const { operationId } = store.updateTodo(todo.id, { title: 'Updated Title' });

      // Verify update was applied
      expect(store.getTodo(todo.id)?.title).toBe('Updated Title');

      // Rollback
      const success = store.rollbackOptimisticUpdate(operationId);

      expect(success).toBe(true);
      expect(store.getTodo(todo.id)?.title).toBe('Original Title');
    });

    test('should trigger exactly one re-render on rollback', () => {
      const { todo } = store.createTodo('Test');
      const { operationId } = store.updateTodo(todo.id, { title: 'Updated' });

      store.resetRenderCount();
      store.rollbackOptimisticUpdate(operationId);

      // Requirement 6: Exactly one re-render
      expect(store.getRenderCount()).toBe(1);
    });

    test('should handle rollback of non-existent operation', () => {
      const success = store.rollbackOptimisticUpdate('non-existent');
      expect(success).toBe(false);
    });

    test('should preserve all todo fields on rollback', () => {
      const { todo } = store.createTodo('Test');
      const originalClock = { ...todo.vectorClock };
      const originalUpdatedAt = new Date(todo.updatedAt);

      store.updateTodo(todo.id, { title: 'Changed', completed: true });

      const { operationId: deleteOpId } = store.deleteTodo(todo.id);
      store.rollbackOptimisticUpdate(deleteOpId);

      const restored = store.getTodo(todo.id);
      expect(restored?.title).toBe('Changed');
      expect(restored?.deletedAt).toBeNull();
    });
  });

  describe('Confirm Operations', () => {
    test('should clear previous state on confirm', () => {
      const { todo } = store.createTodo('Test');
      const { operationId } = store.updateTodo(todo.id, { title: 'Updated' });

      store.confirmOptimisticUpdate(operationId);

      const manager = store.getOptimisticManager();
      expect(manager.isPending(operationId)).toBe(false);
    });
  });
});

describe('Todo Store - Requirement 7: Soft Delete', () => {
  let store: TodoStore;

  beforeEach(() => {
    store = createTodoStore('test-user');
  });

  test('should set deleted_at timestamp on delete', () => {
    const { todo } = store.createTodo('Test Todo');
    const beforeDelete = new Date();

    store.deleteTodo(todo.id);

    const deleted = store.getTodo(todo.id);
    expect(deleted?.deletedAt).not.toBeNull();
    expect(deleted?.deletedAt?.getTime()).toBeGreaterThanOrEqual(beforeDelete.getTime());
  });

  test('should not physically remove todo on delete', () => {
    const { todo } = store.createTodo('Test Todo');
    store.deleteTodo(todo.id);

    // Todo should still exist in store
    const deleted = store.getTodo(todo.id);
    expect(deleted).toBeDefined();
    expect(deleted?.id).toBe(todo.id);
  });

  test('should exclude soft-deleted todos from active list', () => {
    store.createTodo('Todo 1');
    const { todo: todo2 } = store.createTodo('Todo 2');
    store.createTodo('Todo 3');

    store.deleteTodo(todo2.id);

    const active = store.getActiveTodos();
    expect(active.length).toBe(2);
    expect(active.find(t => t.id === todo2.id)).toBeUndefined();
  });

  test('should include soft-deleted todos in all list', () => {
    store.createTodo('Todo 1');
    const { todo: todo2 } = store.createTodo('Todo 2');
    store.createTodo('Todo 3');

    store.deleteTodo(todo2.id);

    const all = store.getAllTodos();
    expect(all.length).toBe(3);
    expect(all.find(t => t.id === todo2.id)).toBeDefined();
  });

  test('should update vector clock on delete', () => {
    const { todo } = store.createTodo('Test Todo');
    const originalClock = { ...todo.vectorClock };

    store.deleteTodo(todo.id);

    const deleted = store.getTodo(todo.id);
    expect(deleted?.vectorClock['test-user']).toBeGreaterThan(originalClock['test-user'] || 0);
  });

  test('should update updatedAt on delete', () => {
    const { todo } = store.createTodo('Test Todo');
    const originalUpdatedAt = todo.updatedAt;

    // Small delay to ensure different timestamp
    const beforeDelete = new Date();
    store.deleteTodo(todo.id);

    const deleted = store.getTodo(todo.id);
    expect(deleted?.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeDelete.getTime());
  });

  test('should not allow update of soft-deleted todo', () => {
    const { todo } = store.createTodo('Test Todo');
    store.deleteTodo(todo.id);

    const { todo: updated } = store.updateTodo(todo.id, { title: 'New Title' });

    expect(updated).toBeNull();
  });

  test('should allow rollback of soft delete', () => {
    const { todo } = store.createTodo('Test Todo');
    const { operationId } = store.deleteTodo(todo.id);

    expect(store.getTodo(todo.id)?.deletedAt).not.toBeNull();

    store.rollbackOptimisticUpdate(operationId);

    expect(store.getTodo(todo.id)?.deletedAt).toBeNull();
  });
});

describe('Todo Store - Requirement 10: Reorder Vector Clocks', () => {
  let store: TodoStore;

  beforeEach(() => {
    store = createTodoStore('test-user');
  });

  test('should update vector clock of moved todo', () => {
    store.createTodo('Todo 1');
    const { todo: todo2 } = store.createTodo('Todo 2');
    store.createTodo('Todo 3');

    const originalClock = { ...todo2.vectorClock };

    store.reorderTodo(todo2.id, 1, 2);

    const movedTodo = store.getTodo(todo2.id);
    expect(movedTodo?.vectorClock['test-user']).toBeGreaterThan(originalClock['test-user'] || 0);
  });

  test('should update vector clocks for ALL affected todos when moving down', () => {
    const { todo: todo1 } = store.createTodo('Todo 1'); // position 0
    const { todo: todo2 } = store.createTodo('Todo 2'); // position 1
    const { todo: todo3 } = store.createTodo('Todo 3'); // position 2

    const clock1Before = todo1.vectorClock['test-user'] || 0;
    const clock2Before = todo2.vectorClock['test-user'] || 0;
    const clock3Before = todo3.vectorClock['test-user'] || 0;

    // Move todo1 from position 0 to position 2
    store.reorderTodo(todo1.id, 0, 2);

    const updated1 = store.getTodo(todo1.id);
    const updated2 = store.getTodo(todo2.id);
    const updated3 = store.getTodo(todo3.id);

    // Todo1 moved: clock should increase
    expect(updated1?.vectorClock['test-user']).toBeGreaterThan(clock1Before);

    // Todo2 affected (shifted up): clock should increase
    expect(updated2?.vectorClock['test-user']).toBeGreaterThan(clock2Before);

    // Todo3 affected (shifted up): clock should increase
    expect(updated3?.vectorClock['test-user']).toBeGreaterThan(clock3Before);
  });

  test('should update vector clocks for ALL affected todos when moving up', () => {
    const { todo: todo1 } = store.createTodo('Todo 1'); // position 0
    const { todo: todo2 } = store.createTodo('Todo 2'); // position 1
    const { todo: todo3 } = store.createTodo('Todo 3'); // position 2

    const clock1Before = todo1.vectorClock['test-user'] || 0;
    const clock2Before = todo2.vectorClock['test-user'] || 0;
    const clock3Before = todo3.vectorClock['test-user'] || 0;

    // Move todo3 from position 2 to position 0
    store.reorderTodo(todo3.id, 2, 0);

    const updated1 = store.getTodo(todo1.id);
    const updated2 = store.getTodo(todo2.id);
    const updated3 = store.getTodo(todo3.id);

    // Todo3 moved: clock should increase
    expect(updated3?.vectorClock['test-user']).toBeGreaterThan(clock3Before);

    // Todo1 affected (shifted down): clock should increase
    expect(updated1?.vectorClock['test-user']).toBeGreaterThan(clock1Before);

    // Todo2 affected (shifted down): clock should increase
    expect(updated2?.vectorClock['test-user']).toBeGreaterThan(clock2Before);
  });

  test('should not update unaffected todos', () => {
    const { todo: todo1 } = store.createTodo('Todo 1'); // position 0
    const { todo: todo2 } = store.createTodo('Todo 2'); // position 1
    const { todo: todo3 } = store.createTodo('Todo 3'); // position 2
    const { todo: todo4 } = store.createTodo('Todo 4'); // position 3

    const clock1Before = todo1.vectorClock['test-user'] || 0;
    const clock4Before = todo4.vectorClock['test-user'] || 0;

    // Move todo2 from position 1 to position 2
    store.reorderTodo(todo2.id, 1, 2);

    const updated1 = store.getTodo(todo1.id);
    const updated4 = store.getTodo(todo4.id);

    // Todo1 not affected (before the range)
    expect(updated1?.vectorClock['test-user']).toBe(clock1Before);

    // Todo4 not affected (after the range)
    expect(updated4?.vectorClock['test-user']).toBe(clock4Before);
  });

  test('should return all affected todos', () => {
    store.createTodo('Todo 1');
    store.createTodo('Todo 2');
    const { todo: todo3 } = store.createTodo('Todo 3');

    const { affectedTodos } = store.reorderTodo(todo3.id, 2, 0);

    expect(affectedTodos.length).toBe(3); // All three affected
  });

  test('should correctly update positions', () => {
    const { todo: todo1 } = store.createTodo('Todo 1');
    const { todo: todo2 } = store.createTodo('Todo 2');
    const { todo: todo3 } = store.createTodo('Todo 3');

    // Move todo3 to top
    store.reorderTodo(todo3.id, 2, 0);

    const active = store.getActiveTodos().sort((a, b) => a.position - b.position);
    expect(active[0].id).toBe(todo3.id);
    expect(active[1].id).toBe(todo1.id);
    expect(active[2].id).toBe(todo2.id);
  });

  test('should not reorder soft-deleted todos', () => {
    const { todo: todo1 } = store.createTodo('Todo 1');
    store.deleteTodo(todo1.id);

    const { affectedTodos } = store.reorderTodo(todo1.id, 0, 1);

    expect(affectedTodos.length).toBe(0);
  });

  test('should handle single todo reorder gracefully', () => {
    const { todo } = store.createTodo('Only Todo');

    const { affectedTodos } = store.reorderTodo(todo.id, 0, 0);

    // No movement needed
    expect(affectedTodos.length).toBe(0);
  });
});

describe('Todo Store - General Operations', () => {
  let store: TodoStore;

  beforeEach(() => {
    store = createTodoStore('test-user');
  });

  test('should generate unique IDs for todos', () => {
    const { todo: todo1 } = store.createTodo('Todo 1');
    const { todo: todo2 } = store.createTodo('Todo 2');

    expect(todo1.id).not.toBe(todo2.id);
  });

  test('should assign correct positions to new todos', () => {
    const { todo: todo1 } = store.createTodo('Todo 1');
    const { todo: todo2 } = store.createTodo('Todo 2');
    const { todo: todo3 } = store.createTodo('Todo 3');

    expect(todo1.position).toBe(0);
    expect(todo2.position).toBe(1);
    expect(todo3.position).toBe(2);
  });

  test('should update completed status', () => {
    const { todo } = store.createTodo('Test');

    store.updateTodo(todo.id, { completed: true });

    expect(store.getTodo(todo.id)?.completed).toBe(true);
  });

  test('should update title', () => {
    const { todo } = store.createTodo('Original');

    store.updateTodo(todo.id, { title: 'Updated' });

    expect(store.getTodo(todo.id)?.title).toBe('Updated');
  });

  test('should clear all state', () => {
    store.createTodo('Todo 1');
    store.createTodo('Todo 2');

    store.clear();

    expect(store.getAllTodos().length).toBe(0);
    expect(store.getActiveTodos().length).toBe(0);
  });

  test('should notify listeners on state change', () => {
    let notified = false;
    store.subscribe(() => {
      notified = true;
    });

    store.createTodo('Test');

    expect(notified).toBe(true);
  });

  test('should allow unsubscribe', () => {
    let count = 0;
    const unsubscribe = store.subscribe(() => {
      count++;
    });

    store.createTodo('Test 1');
    expect(count).toBe(1);

    unsubscribe();

    store.createTodo('Test 2');
    expect(count).toBe(1);
  });
});

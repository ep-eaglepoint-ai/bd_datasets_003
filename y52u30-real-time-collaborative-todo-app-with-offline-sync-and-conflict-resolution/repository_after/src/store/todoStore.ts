/**
 * Todo Store with Optimistic Updates
 *
 * Requirement 6: Store previous state for atomic rollback
 * Requirement 7: Soft delete with deleted_at timestamp
 * Requirement 10: Reorder updates vector clocks for all affected todos
 */

import { Todo, UserPresence, SyncStatus, VectorClock } from '../types';
import {
  createVectorClock,
  incrementVectorClock,
  mergeVectorClocks,
  resolveConflict
} from '../lib/vector-clock';
import { generateUUID, OfflineQueue } from '../lib/offline-queue';

/**
 * Optimistic State Manager
 *
 * Requirement 6: Store complete previous state before applying changes
 */
export class OptimisticStateManager {
  private previousStates: Map<string, Todo> = new Map();
  private pendingOperationIds: Set<string> = new Set();

  /**
   * Store the previous state before applying an optimistic update
   * Requirement 6: Must store complete previous state
   */
  storePreviousState(operationId: string, todo: Todo): void {
    // Deep clone to ensure we have a complete snapshot
    const snapshot: Todo = {
      ...todo,
      vectorClock: { ...todo.vectorClock },
      createdAt: new Date(todo.createdAt),
      updatedAt: new Date(todo.updatedAt),
      deletedAt: todo.deletedAt ? new Date(todo.deletedAt) : null
    };
    this.previousStates.set(operationId, snapshot);
    this.pendingOperationIds.add(operationId);
  }

  /**
   * Get the previous state for rollback
   */
  getPreviousState(operationId: string): Todo | undefined {
    return this.previousStates.get(operationId);
  }

  /**
   * Confirm an operation (remove from pending)
   */
  confirmOperation(operationId: string): void {
    this.previousStates.delete(operationId);
    this.pendingOperationIds.delete(operationId);
  }

  /**
   * Get state for rollback and remove from pending
   * Requirement 6: Atomically revert to stored state
   */
  rollback(operationId: string): Todo | undefined {
    const previous = this.previousStates.get(operationId);
    this.previousStates.delete(operationId);
    this.pendingOperationIds.delete(operationId);
    return previous;
  }

  /**
   * Check if an operation is pending
   */
  isPending(operationId: string): boolean {
    return this.pendingOperationIds.has(operationId);
  }

  /**
   * Get all pending operation IDs
   */
  getPendingOperationIds(): string[] {
    return Array.from(this.pendingOperationIds);
  }

  /**
   * Clear all stored states
   */
  clear(): void {
    this.previousStates.clear();
    this.pendingOperationIds.clear();
  }
}

/**
 * Todo Store
 *
 * Manages todo state with optimistic updates, offline support,
 * and conflict resolution
 */
export class TodoStore {
  private todos: Map<string, Todo> = new Map();
  private presence: Map<string, UserPresence> = new Map();
  private syncStatus: SyncStatus = 'synced';
  private lastSyncTimestamp: Date | null = null;
  private offlineQueue: OfflineQueue;
  private optimisticManager: OptimisticStateManager;
  private userId: string;
  private listeners: Set<() => void> = new Set();
  private renderCount: number = 0;

  constructor(userId: string) {
    this.userId = userId;
    this.offlineQueue = new OfflineQueue();
    this.optimisticManager = new OptimisticStateManager();
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of state change
   * Requirement 6: Rollback must trigger exactly one re-render
   */
  private notify(): void {
    this.renderCount++;
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Get render count (for testing Requirement 6)
   */
  getRenderCount(): number {
    return this.renderCount;
  }

  /**
   * Reset render count (for testing)
   */
  resetRenderCount(): void {
    this.renderCount = 0;
  }

  /**
   * Create a new todo with optimistic update
   * Requirement 12: Use crypto.randomUUID for client-generated ID
   */
  createTodo(title: string): { todo: Todo; operationId: string } {
    const id = generateUUID();
    const now = new Date();
    const operationId = generateUUID();

    const todo: Todo = {
      id,
      title,
      completed: false,
      position: this.getNextPosition(),
      vectorClock: createVectorClock(this.userId),
      createdAt: now,
      updatedAt: now,
      createdBy: this.userId,
      updatedBy: this.userId,
      deletedAt: null
    };

    // Apply optimistic update
    this.todos.set(id, todo);

    // Queue for offline sync
    this.offlineQueue.enqueue('create', id, todo, this.userId);

    this.notify();
    return { todo, operationId };
  }

  /**
   * Update a todo with optimistic update
   * Requirement 6: Store previous state before changes
   */
  updateTodo(
    id: string,
    changes: Partial<Pick<Todo, 'title' | 'completed'>>
  ): { todo: Todo | null; operationId: string } {
    const existing = this.todos.get(id);
    if (!existing || existing.deletedAt) {
      return { todo: null, operationId: '' };
    }

    const operationId = generateUUID();

    // Requirement 6: Store complete previous state
    this.optimisticManager.storePreviousState(operationId, existing);

    const now = new Date();
    const updated: Todo = {
      ...existing,
      ...changes,
      vectorClock: incrementVectorClock(existing.vectorClock, this.userId),
      updatedAt: now,
      updatedBy: this.userId
    };

    // Apply optimistic update
    this.todos.set(id, updated);

    // Queue for offline sync
    this.offlineQueue.enqueue('update', id, changes, this.userId);

    this.notify();
    return { todo: updated, operationId };
  }

  /**
   * Delete a todo (soft delete)
   * Requirement 7: Use soft delete with deleted_at timestamp
   */
  deleteTodo(id: string): { operationId: string } {
    const existing = this.todos.get(id);
    if (!existing) {
      return { operationId: '' };
    }

    const operationId = generateUUID();

    // Requirement 6: Store previous state
    this.optimisticManager.storePreviousState(operationId, existing);

    const now = new Date();
    const deleted: Todo = {
      ...existing,
      deletedAt: now, // Requirement 7: Soft delete
      vectorClock: incrementVectorClock(existing.vectorClock, this.userId),
      updatedAt: now,
      updatedBy: this.userId
    };

    // Apply soft delete
    this.todos.set(id, deleted);

    // Queue for offline sync
    this.offlineQueue.enqueue('delete', id, null, this.userId);

    this.notify();
    return { operationId };
  }

  /**
   * Reorder a todo
   * Requirement 10: Update vector clocks for ALL affected todos
   */
  reorderTodo(
    id: string,
    fromPosition: number,
    toPosition: number
  ): { operationId: string; affectedTodos: Todo[] } {
    const todo = this.todos.get(id);
    if (!todo || todo.deletedAt) {
      return { operationId: '', affectedTodos: [] };
    }

    // No movement needed if positions are the same
    if (fromPosition === toPosition) {
      return { operationId: '', affectedTodos: [] };
    }

    const operationId = generateUUID();
    const now = new Date();
    const affectedTodos: Todo[] = [];

    // Get all active todos sorted by position
    const activeTodos = this.getActiveTodos().sort((a, b) => a.position - b.position);

    // Requirement 10: Update vector clocks for ALL affected todos
    for (const t of activeTodos) {
      let newPosition = t.position;
      let affected = false;

      if (t.id === id) {
        newPosition = toPosition;
        affected = true;
      } else if (fromPosition < toPosition) {
        // Moving down: items between from and to shift up
        if (t.position > fromPosition && t.position <= toPosition) {
          newPosition = t.position - 1;
          affected = true;
        }
      } else if (fromPosition > toPosition) {
        // Moving up: items between to and from shift down
        if (t.position >= toPosition && t.position < fromPosition) {
          newPosition = t.position + 1;
          affected = true;
        }
      }

      if (affected) {
        // Store previous state for the moved item
        if (t.id === id) {
          this.optimisticManager.storePreviousState(operationId, t);
        }

        // Requirement 10: Update vector clock for affected todo
        const updated: Todo = {
          ...t,
          position: newPosition,
          vectorClock: incrementVectorClock(t.vectorClock, this.userId),
          updatedAt: now,
          updatedBy: this.userId
        };

        this.todos.set(t.id, updated);
        affectedTodos.push(updated);
      }
    }

    // Queue for offline sync
    this.offlineQueue.enqueue(
      'reorder',
      id,
      { fromPosition, toPosition },
      this.userId
    );

    this.notify();
    return { operationId, affectedTodos };
  }

  /**
   * Rollback an optimistic update
   * Requirement 6: Atomically revert to stored state, trigger exactly one re-render
   */
  rollbackOptimisticUpdate(operationId: string): boolean {
    const previousState = this.optimisticManager.rollback(operationId);
    if (!previousState) {
      return false;
    }

    // Atomically restore previous state
    this.todos.set(previousState.id, previousState);

    // Trigger exactly one re-render (Requirement 6)
    this.notify();
    return true;
  }

  /**
   * Confirm an optimistic update (server accepted it)
   */
  confirmOptimisticUpdate(operationId: string): void {
    this.optimisticManager.confirmOperation(operationId);
  }

  /**
   * Apply server state, merging with local changes
   */
  applyServerState(serverTodo: Todo): void {
    const local = this.todos.get(serverTodo.id);
    if (local) {
      const resolved = resolveConflict(local, serverTodo);
      this.todos.set(serverTodo.id, resolved);
    } else {
      this.todos.set(serverTodo.id, serverTodo);
    }
    this.notify();
  }

  /**
   * Get all active (non-deleted) todos
   */
  getActiveTodos(): Todo[] {
    return Array.from(this.todos.values()).filter(t => !t.deletedAt);
  }

  /**
   * Get all todos including soft-deleted
   */
  getAllTodos(): Todo[] {
    return Array.from(this.todos.values());
  }

  /**
   * Get a specific todo
   */
  getTodo(id: string): Todo | undefined {
    return this.todos.get(id);
  }

  /**
   * Get the next available position
   */
  private getNextPosition(): number {
    const positions = this.getActiveTodos().map(t => t.position);
    return positions.length > 0 ? Math.max(...positions) + 1 : 0;
  }

  /**
   * Get offline queue
   */
  getOfflineQueue(): OfflineQueue {
    return this.offlineQueue;
  }

  /**
   * Get optimistic state manager
   */
  getOptimisticManager(): OptimisticStateManager {
    return this.optimisticManager;
  }

  /**
   * Set sync status
   */
  setSyncStatus(status: SyncStatus): void {
    this.syncStatus = status;
    this.notify();
  }

  /**
   * Get sync status
   */
  getSyncStatus(): SyncStatus {
    return this.syncStatus;
  }

  /**
   * Set last sync timestamp
   */
  setLastSyncTimestamp(timestamp: Date): void {
    this.lastSyncTimestamp = timestamp;
  }

  /**
   * Get last sync timestamp
   */
  getLastSyncTimestamp(): Date | null {
    return this.lastSyncTimestamp;
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.todos.clear();
    this.presence.clear();
    this.optimisticManager.clear();
    this.offlineQueue.clear();
    this.lastSyncTimestamp = null;
    this.syncStatus = 'synced';
  }
}

/**
 * Create a new todo store
 */
export function createTodoStore(userId: string): TodoStore {
  return new TodoStore(userId);
}

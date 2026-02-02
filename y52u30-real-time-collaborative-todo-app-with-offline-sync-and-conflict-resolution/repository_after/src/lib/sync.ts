/**
 * Sync Manager
 *
 * Requirement 11: Only fetch changes since lastSyncTimestamp
 */

import { Todo, SyncStatus } from '../types';
import { compareVectorClocks, resolveConflict, mergeVectorClocks } from './vector-clock';

/**
 * Conflict information structure
 */
export interface ConflictInfo {
  todoId: string;
  type: 'concurrent' | 'divergent';
  localTodo: Todo;
  serverTodo: Todo;
  resolution: Todo;
}

/**
 * Sync statistics
 */
export interface SyncStats {
  lastSyncedCount: number;
  totalSyncs: number;
  conflictsResolved: number;
}

/**
 * Sync Manager
 *
 * Handles synchronization between client and server
 */
export class SyncManager {
  private lastSyncTimestamp: Date | null = null;
  private syncStatus: SyncStatus = 'synced';
  private onStatusChange?: (status: SyncStatus) => void;
  private stats: SyncStats = {
    lastSyncedCount: 0,
    totalSyncs: 0,
    conflictsResolved: 0
  };

  /**
   * Set callback for status changes
   */
  setOnStatusChange(callback: (status: SyncStatus) => void): void {
    this.onStatusChange = callback;
  }

  /**
   * Get the last sync timestamp
   */
  getLastSyncTimestamp(): Date | null {
    return this.lastSyncTimestamp;
  }

  /**
   * Set the last sync timestamp
   */
  setLastSyncTimestamp(timestamp: Date): void {
    this.lastSyncTimestamp = timestamp;
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): SyncStatus {
    return this.syncStatus;
  }

  /**
   * Set sync status and notify listeners
   */
  setSyncStatus(status: SyncStatus): void {
    this.syncStatus = status;
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  /**
   * Create sync request
   * Requirement 11: Only request changes since lastSyncTimestamp
   */
  createSyncRequest(): { lastSyncTimestamp: Date | null } {
    return {
      lastSyncTimestamp: this.lastSyncTimestamp
    };
  }

  /**
   * Build sync request parameters (alias for createSyncRequest)
   * Requirement 11: Only request changes since lastSyncTimestamp
   */
  buildSyncRequest(): { lastSyncTimestamp: Date | null } {
    return this.createSyncRequest();
  }

  /**
   * Apply sync response from server
   */
  applySyncResponse(
    localTodos: Map<string, Todo>,
    serverTodos: Todo[],
    syncTimestamp: Date
  ): { todos: Map<string, Todo>; conflicts: ConflictInfo[] } {
    const merged = mergeTodos(localTodos, serverTodos);
    const localArray = Array.from(localTodos.values());
    const conflicts = detectConflicts(localArray, serverTodos);

    this.lastSyncTimestamp = syncTimestamp;
    this.stats.lastSyncedCount = serverTodos.length;
    this.stats.totalSyncs++;
    this.stats.conflictsResolved += conflicts.length;

    return { todos: merged, conflicts };
  }

  /**
   * Get sync statistics
   */
  getSyncStats(): SyncStats {
    return { ...this.stats };
  }

  /**
   * Check if a full sync is needed (no previous sync)
   */
  needsFullSync(): boolean {
    return this.lastSyncTimestamp === null;
  }

  /**
   * Reset sync state
   */
  reset(): void {
    this.lastSyncTimestamp = null;
    this.setSyncStatus('synced');
    this.stats = {
      lastSyncedCount: 0,
      totalSyncs: 0,
      conflictsResolved: 0
    };
  }
}

/**
 * Filter todos that have been updated since a given timestamp
 * Requirement 11: Server-side query filter on updated_at
 */
export function filterTodosSinceTimestamp(todos: Todo[], since: Date | null): Todo[] {
  if (since === null) {
    return todos;
  }

  return todos.filter(todo => todo.updatedAt > since);
}

/**
 * Merge local and server todos, resolving conflicts
 *
 * Uses vector clocks to determine which version wins
 */
export function mergeTodos(localTodos: Map<string, Todo>, serverTodos: Todo[]): Map<string, Todo> {
  const mergedMap = new Map<string, Todo>(localTodos);

  // Merge server todos, resolving conflicts
  for (const serverTodo of serverTodos) {
    const localTodo = mergedMap.get(serverTodo.id);

    if (!localTodo) {
      // New todo from server
      mergedMap.set(serverTodo.id, serverTodo);
    } else {
      // Potential conflict - resolve using vector clocks
      const resolved = resolveConflict(localTodo, serverTodo);
      mergedMap.set(serverTodo.id, resolved);
    }
  }

  return mergedMap;
}

/**
 * Detect conflicts between local and server state
 */
export function detectConflicts(localTodos: Todo[], serverTodos: Todo[]): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];
  const serverMap = new Map(serverTodos.map(t => [t.id, t]));

  for (const localTodo of localTodos) {
    const serverTodo = serverMap.get(localTodo.id);
    if (serverTodo) {
      const comparison = compareVectorClocks(localTodo.vectorClock, serverTodo.vectorClock);
      if (comparison === 'concurrent') {
        conflicts.push({
          todoId: localTodo.id,
          type: 'concurrent',
          localTodo,
          serverTodo,
          resolution: resolveConflict(localTodo, serverTodo)
        });
      }
    }
  }

  return conflicts;
}

/**
 * Apply server state to local state, handling soft deletes
 * Requirement 7: Handle soft deletes with deleted_at
 */
export function applyServerState(
  localTodos: Map<string, Todo>,
  serverTodos: Todo[]
): Map<string, Todo> {
  const result = new Map<string, Todo>(localTodos);

  // Process server todos
  for (const serverTodo of serverTodos) {
    const localTodo = result.get(serverTodo.id);

    if (!localTodo) {
      // New from server
      result.set(serverTodo.id, serverTodo);
    } else {
      // Resolve conflict
      const resolved = resolveConflict(localTodo, serverTodo);
      result.set(serverTodo.id, resolved);
    }
  }

  return result;
}

/**
 * Create a sync manager instance
 */
export function createSyncManager(): SyncManager {
  return new SyncManager();
}

/**
 * Calculate bandwidth savings from incremental sync
 * Requirement 11: Fetching only changes saves bandwidth
 */
export function calculateSyncSavings(
  totalTodos: number,
  sentTodos: number
): {
  totalTodos: number;
  sentTodos: number;
  savedTodos: number;
  savingsPercentage: number;
} {
  const savedTodos = totalTodos - sentTodos;
  const savingsPercentage = totalTodos > 0
    ? Math.round((savedTodos / totalTodos) * 1000) / 10
    : 0;

  return {
    totalTodos,
    sentTodos,
    savedTodos,
    savingsPercentage
  };
}

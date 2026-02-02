/**
 * Type definitions for the Collaborative Todo Application
 */

// Vector clock type - maps user IDs to logical timestamps
export type VectorClock = Record<string, number>;

// Vector clock comparison results (Requirement 1)
export type VectorClockComparison = 'before' | 'after' | 'equal' | 'concurrent';

// Todo item interface
export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  position: number;
  vectorClock: VectorClock;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null; // Soft delete (Requirement 7)
}

// User presence interface (Requirement 5, 9)
export interface UserPresence {
  userId: string;
  currentTodoId: string | null;
  lastSeen: Date;
}

// Offline operation types (Requirement 4)
export type OperationType = 'create' | 'update' | 'delete' | 'reorder';

export interface OfflineOperation {
  sequenceNumber: number; // Monotonically increasing (Requirement 4)
  operationType: OperationType;
  todoId: string;
  payload: Partial<Todo> | ReorderPayload | null;
  timestamp: Date;
  userId: string;
}

export interface ReorderPayload {
  fromPosition: number;
  toPosition: number;
}

// Sync status for UI
export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'conflict' | 'pending' | 'error';

// WebSocket message types
export interface TodoCreateMessage {
  type: 'todo:create';
  todo: Omit<Todo, 'createdAt' | 'updatedAt'>;
  userId: string;
}

export interface TodoUpdateMessage {
  type: 'todo:update';
  todoId: string;
  changes: Partial<Todo>;
  vectorClock: VectorClock;
  userId: string;
}

export interface TodoDeleteMessage {
  type: 'todo:delete';
  todoId: string;
  userId: string;
}

export interface TodoReorderMessage {
  type: 'todo:reorder';
  todoId: string;
  fromPosition: number;
  toPosition: number;
  userId: string;
}

export interface PresenceUpdateMessage {
  type: 'presence:update';
  userId: string;
  todoId: string | null;
}

export interface SyncRequestMessage {
  type: 'sync:request';
  lastSyncTimestamp: Date;
  userId: string;
}

// Server to client messages
export interface TodoCreatedMessage {
  type: 'todo:created';
  todo: Todo;
}

export interface TodoUpdatedMessage {
  type: 'todo:updated';
  todo: Todo;
}

export interface TodoDeletedMessage {
  type: 'todo:deleted';
  todoId: string;
  deletedAt: Date;
}

export interface TodoConflictMessage {
  type: 'todo:conflict';
  todoId: string;
  serverTodo: Todo;
  reason: string;
}

export interface PresenceChangedMessage {
  type: 'presence:changed';
  presence: UserPresence[];
}

export interface SyncStateMessage {
  type: 'sync:state';
  todos: Todo[];
  syncTimestamp: Date;
}

export type ClientMessage =
  | TodoCreateMessage
  | TodoUpdateMessage
  | TodoDeleteMessage
  | TodoReorderMessage
  | PresenceUpdateMessage
  | SyncRequestMessage;

export type ServerMessage =
  | TodoCreatedMessage
  | TodoUpdatedMessage
  | TodoDeletedMessage
  | TodoConflictMessage
  | PresenceChangedMessage
  | SyncStateMessage;

// Store state interface
export interface TodoStoreState {
  todos: Todo[];
  presence: UserPresence[];
  syncStatus: SyncStatus;
  lastSyncTimestamp: Date | null;
  pendingOperations: OfflineOperation[];
  optimisticState: Map<string, Todo>; // Previous state for rollback (Requirement 6)
}

// Reconnection state is defined in lib/reconnection.ts

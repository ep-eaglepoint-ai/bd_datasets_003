/**
 * Zustand Store for Collaborative Todo App
 *
 * Implements state management with:
 * - Optimistic updates (Requirement 6)
 * - Offline queue (Requirement 4)
 * - Vector clocks for conflict resolution (Requirements 1, 2)
 * - Reconnection with backoff (Requirement 8)
 */

import { create } from 'zustand';
import { Todo, UserPresence, SyncStatus, VectorClock, OfflineOperation } from '../types';
import {
  createVectorClock,
  incrementVectorClock,
  resolveConflict
} from '../lib/vector-clock';
import { generateUUID } from '../lib/offline-queue';

interface TodoState {
  // State
  todos: Map<string, Todo>;
  presence: UserPresence[];
  syncStatus: SyncStatus;
  userId: string;
  lastSyncTimestamp: Date | null;

  // WebSocket
  ws: WebSocket | null;
  reconnectAttempt: number;
  reconnectTimer: NodeJS.Timeout | null;

  // Offline queue
  offlineQueue: OfflineOperation[];
  offlineSequenceNumber: number;

  // Optimistic updates (Requirement 6)
  previousStates: Map<string, Todo>;

  // Actions
  connect: () => void;
  disconnect: () => void;
  createTodo: (title: string) => void;
  updateTodo: (id: string, changes: Partial<Pick<Todo, 'title' | 'completed'>>) => void;
  deleteTodo: (id: string) => void;
  reorderTodo: (id: string, fromPosition: number, toPosition: number) => void;
  updatePresence: (todoId: string | null) => void;

  // Internal actions
  handleServerMessage: (message: unknown) => void;
  rollbackOptimisticUpdate: (todoId: string) => void;
  syncOfflineQueue: () => void;
  scheduleReconnect: () => void;
}

// Requirement 8: Exponential backoff configuration
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const BACKOFF_JITTER = 0.2;

function calculateBackoff(attempt: number): number {
  const baseDelay = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_MAX_MS);
  const jitter = baseDelay * BACKOFF_JITTER * (Math.random() * 2 - 1);
  return Math.round(baseDelay + jitter);
}

export const useTodoStore = create<TodoState>((set, get) => ({
  // Initial state
  todos: new Map(),
  presence: [],
  syncStatus: 'synced',
  userId: typeof window !== 'undefined' ? generateUUID() : 'server',
  lastSyncTimestamp: null,
  ws: null,
  reconnectAttempt: 0,
  reconnectTimer: null,
  offlineQueue: [],
  offlineSequenceNumber: 0,
  previousStates: new Map(),

  connect: () => {
    if (typeof window === 'undefined') return;

    const { userId, reconnectTimer } = get();

    // Clear any existing reconnect timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      set({ reconnectTimer: null });
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?userId=${userId}`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        set({
          ws,
          syncStatus: 'synced',
          reconnectAttempt: 0
        });

        // Sync offline queue
        get().syncOfflineQueue();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          get().handleServerMessage(message);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        set({ ws: null, syncStatus: 'offline' });
        get().scheduleReconnect();
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        set({ syncStatus: 'error' });
      };

      set({ ws });
    } catch (error) {
      console.error('Failed to connect:', error);
      set({ syncStatus: 'offline' });
      get().scheduleReconnect();
    }
  },

  disconnect: () => {
    const { ws, reconnectTimer } = get();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    if (ws) {
      ws.close();
    }
    set({ ws: null, reconnectTimer: null });
  },

  // Requirement 8: Exponential backoff reconnection
  scheduleReconnect: () => {
    const { reconnectAttempt } = get();
    const delay = calculateBackoff(reconnectAttempt);

    console.log(`Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempt + 1})`);

    const timer = setTimeout(() => {
      set({ reconnectAttempt: reconnectAttempt + 1 });
      get().connect();
    }, delay);

    set({ reconnectTimer: timer });
  },

  handleServerMessage: (message: unknown) => {
    const msg = message as { type: string; [key: string]: unknown };

    switch (msg.type) {
      case 'sync:state': {
        const { todos: serverTodos, syncTimestamp } = msg as {
          todos: Todo[];
          syncTimestamp: string;
        };

        set((state) => {
          const newTodos = new Map(state.todos);

          for (const serverTodo of serverTodos) {
            const local = newTodos.get(serverTodo.id);
            if (local) {
              // Resolve conflict using vector clocks (Requirements 1, 2)
              const resolved = resolveConflict(local, serverTodo);
              newTodos.set(serverTodo.id, resolved);
            } else {
              newTodos.set(serverTodo.id, serverTodo);
            }
          }

          return {
            todos: newTodos,
            lastSyncTimestamp: new Date(syncTimestamp),
            syncStatus: 'synced'
          };
        });
        break;
      }

      case 'todo:created': {
        const { todo } = msg as { todo: Todo };
        set((state) => {
          const newTodos = new Map(state.todos);
          newTodos.set(todo.id, todo);
          return { todos: newTodos };
        });
        break;
      }

      case 'todo:updated': {
        const { todo: serverTodo } = msg as { todo: Todo };
        set((state) => {
          const newTodos = new Map(state.todos);
          const local = newTodos.get(serverTodo.id);

          if (local) {
            const resolved = resolveConflict(local, serverTodo);
            newTodos.set(serverTodo.id, resolved);
          } else {
            newTodos.set(serverTodo.id, serverTodo);
          }

          return { todos: newTodos };
        });
        break;
      }

      case 'todo:deleted': {
        const { todoId, deletedAt } = msg as { todoId: string; deletedAt: string };
        set((state) => {
          const newTodos = new Map(state.todos);
          const todo = newTodos.get(todoId);
          if (todo) {
            newTodos.set(todoId, { ...todo, deletedAt: new Date(deletedAt) });
          }
          return { todos: newTodos };
        });
        break;
      }

      case 'presence:changed': {
        const { presence } = msg as { presence: UserPresence[] };
        set({ presence });
        break;
      }
    }
  },

  // Requirement 12: Use crypto.randomUUID for client-generated IDs
  createTodo: (title: string) => {
    const { userId, ws, offlineSequenceNumber, offlineQueue } = get();
    const id = generateUUID();
    const now = new Date();

    const todo: Todo = {
      id,
      title,
      completed: false,
      position: get().todos.size,
      vectorClock: createVectorClock(userId),
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
      deletedAt: null
    };

    // Optimistic update
    set((state) => {
      const newTodos = new Map(state.todos);
      newTodos.set(id, todo);
      return { todos: newTodos };
    });

    // Send to server or queue offline
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'todo:create',
        todo
      }));
    } else {
      // Requirement 4: Queue with sequence number
      const operation: OfflineOperation = {
        sequenceNumber: offlineSequenceNumber + 1,
        operationType: 'create',
        todoId: id,
        payload: todo,
        timestamp: now,
        userId
      };
      set({
        offlineQueue: [...offlineQueue, operation],
        offlineSequenceNumber: offlineSequenceNumber + 1,
        syncStatus: 'pending'
      });
    }
  },

  // Requirement 6: Store previous state for rollback
  updateTodo: (id: string, changes: Partial<Pick<Todo, 'title' | 'completed'>>) => {
    const { userId, ws, todos, previousStates, offlineSequenceNumber, offlineQueue } = get();
    const existing = todos.get(id);

    if (!existing || existing.deletedAt) return;

    // Store previous state for rollback (Requirement 6)
    const newPreviousStates = new Map(previousStates);
    newPreviousStates.set(id, { ...existing });

    const now = new Date();
    const newVectorClock = incrementVectorClock(existing.vectorClock, userId);

    const updated: Todo = {
      ...existing,
      ...changes,
      vectorClock: newVectorClock,
      updatedAt: now,
      updatedBy: userId
    };

    // Optimistic update
    set((state) => {
      const newTodos = new Map(state.todos);
      newTodos.set(id, updated);
      return {
        todos: newTodos,
        previousStates: newPreviousStates
      };
    });

    // Send to server or queue offline
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'todo:update',
        todoId: id,
        changes,
        vectorClock: newVectorClock
      }));
    } else {
      const operation: OfflineOperation = {
        sequenceNumber: offlineSequenceNumber + 1,
        operationType: 'update',
        todoId: id,
        payload: changes,
        timestamp: now,
        userId
      };
      set({
        offlineQueue: [...offlineQueue, operation],
        offlineSequenceNumber: offlineSequenceNumber + 1,
        syncStatus: 'pending'
      });
    }
  },

  // Requirement 7: Soft delete with deleted_at
  deleteTodo: (id: string) => {
    const { userId, ws, todos, previousStates, offlineSequenceNumber, offlineQueue } = get();
    const existing = todos.get(id);

    if (!existing) return;

    // Store previous state for rollback
    const newPreviousStates = new Map(previousStates);
    newPreviousStates.set(id, { ...existing });

    const now = new Date();
    const deleted: Todo = {
      ...existing,
      deletedAt: now, // Soft delete
      vectorClock: incrementVectorClock(existing.vectorClock, userId),
      updatedAt: now,
      updatedBy: userId
    };

    // Optimistic update
    set((state) => {
      const newTodos = new Map(state.todos);
      newTodos.set(id, deleted);
      return {
        todos: newTodos,
        previousStates: newPreviousStates
      };
    });

    // Send to server or queue offline
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'todo:delete',
        todoId: id
      }));
    } else {
      const operation: OfflineOperation = {
        sequenceNumber: offlineSequenceNumber + 1,
        operationType: 'delete',
        todoId: id,
        payload: null,
        timestamp: now,
        userId
      };
      set({
        offlineQueue: [...offlineQueue, operation],
        offlineSequenceNumber: offlineSequenceNumber + 1,
        syncStatus: 'pending'
      });
    }
  },

  // Requirement 10: Update vector clocks for ALL affected todos
  reorderTodo: (id: string, fromPosition: number, toPosition: number) => {
    const { userId, ws, todos, offlineSequenceNumber, offlineQueue } = get();
    const todo = todos.get(id);

    if (!todo || todo.deletedAt) return;

    const now = new Date();
    const activeTodos = Array.from(todos.values())
      .filter(t => !t.deletedAt)
      .sort((a, b) => a.position - b.position);

    // Update all affected todos (Requirement 10)
    set((state) => {
      const newTodos = new Map(state.todos);

      for (const t of activeTodos) {
        let newPosition = t.position;
        let affected = false;

        if (t.id === id) {
          newPosition = toPosition;
          affected = true;
        } else if (fromPosition < toPosition) {
          if (t.position > fromPosition && t.position <= toPosition) {
            newPosition = t.position - 1;
            affected = true;
          }
        } else if (fromPosition > toPosition) {
          if (t.position >= toPosition && t.position < fromPosition) {
            newPosition = t.position + 1;
            affected = true;
          }
        }

        if (affected) {
          const updated: Todo = {
            ...t,
            position: newPosition,
            vectorClock: incrementVectorClock(t.vectorClock, userId),
            updatedAt: now,
            updatedBy: userId
          };
          newTodos.set(t.id, updated);
        }
      }

      return { todos: newTodos };
    });

    // Send to server or queue offline
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'todo:reorder',
        todoId: id,
        fromPosition,
        toPosition
      }));
    } else {
      const operation: OfflineOperation = {
        sequenceNumber: offlineSequenceNumber + 1,
        operationType: 'reorder',
        todoId: id,
        payload: { fromPosition, toPosition },
        timestamp: now,
        userId
      };
      set({
        offlineQueue: [...offlineQueue, operation],
        offlineSequenceNumber: offlineSequenceNumber + 1,
        syncStatus: 'pending'
      });
    }
  },

  // Requirement 6: Atomic rollback
  rollbackOptimisticUpdate: (todoId: string) => {
    const { previousStates } = get();
    const previousState = previousStates.get(todoId);

    if (!previousState) return;

    set((state) => {
      const newTodos = new Map(state.todos);
      const newPreviousStates = new Map(state.previousStates);

      newTodos.set(todoId, previousState);
      newPreviousStates.delete(todoId);

      return {
        todos: newTodos,
        previousStates: newPreviousStates
      };
    });
  },

  updatePresence: (todoId: string | null) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'presence:update',
        todoId
      }));
    }
  },

  // Requirement 4: Replay operations in sequence order
  syncOfflineQueue: () => {
    const { ws, offlineQueue } = get();

    if (!ws || ws.readyState !== WebSocket.OPEN || offlineQueue.length === 0) {
      return;
    }

    // Sort by sequence number (Requirement 4)
    const sortedQueue = [...offlineQueue].sort(
      (a, b) => a.sequenceNumber - b.sequenceNumber
    );

    for (const operation of sortedQueue) {
      switch (operation.operationType) {
        case 'create':
          ws.send(JSON.stringify({
            type: 'todo:create',
            todo: operation.payload
          }));
          break;
        case 'update':
          ws.send(JSON.stringify({
            type: 'todo:update',
            todoId: operation.todoId,
            changes: operation.payload
          }));
          break;
        case 'delete':
          ws.send(JSON.stringify({
            type: 'todo:delete',
            todoId: operation.todoId
          }));
          break;
        case 'reorder':
          ws.send(JSON.stringify({
            type: 'todo:reorder',
            todoId: operation.todoId,
            ...operation.payload
          }));
          break;
      }
    }

    // Clear the queue after sync
    set({ offlineQueue: [], syncStatus: 'synced' });
  }
}));

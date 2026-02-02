/**
 * Collaborative Todo Application with Offline Sync and Conflict Resolution
 *
 * Main entry point - exports all public APIs
 */

// Types
export * from './types';

// Vector Clock utilities (Requirements 1, 2)
export {
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
  getVectorClockSum,
  cloneVectorClock
} from './lib/vector-clock';

// Offline Queue (Requirements 4, 12)
export {
  OfflineQueue,
  createOfflineQueue,
  generateUUID,
  isValidOperation,
  compareOperations
} from './lib/offline-queue';

// Presence Management (Requirements 5, 9)
export {
  PresenceManager,
  createPresenceManager,
  createThrottledEmitter
} from './lib/presence';

// Reconnection with Backoff (Requirement 8)
export {
  ReconnectionManager,
  createReconnectionManager,
  createReconnectionState,
  calculateNextDelay,
  addJitter,
  incrementAttempt,
  resetReconnectionState,
  isJitterValid,
  ReconnectionState
} from './lib/reconnection';

// Sync Manager (Requirement 11)
export {
  SyncManager,
  createSyncManager,
  filterTodosSinceTimestamp,
  mergeTodos,
  detectConflicts,
  applyServerState,
  calculateSyncSavings
} from './lib/sync';

// Todo Store (Requirements 6, 7, 10)
export {
  TodoStore,
  createTodoStore,
  OptimisticStateManager
} from './store/todoStore';

// WebSocket Server (Requirement 3)
export {
  CollaborativeTodoWebSocketServer,
  createWebSocketServer,
  validateWebSocketSupport,
  APP_ROUTER_WEBSOCKET_WARNING
} from './server/websocket-server';

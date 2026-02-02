# Trajectory: Real-time Collaborative Todo App with Offline Sync

## Task Overview
Build a collaborative todo application with real-time sync, offline support, and conflict resolution using Next.js 14, TypeScript, Zustand, and WebSocket.

## Implementation Steps

### Step 1: Project Setup
- Created package.json with dependencies (Next.js, React, Zustand, ws, Jest)
- Created tsconfig.json with strict TypeScript settings
- Created jest.config.js for test configuration

### Step 2: Type Definitions
- Created repository_after/src/types/index.ts with:
  - VectorClock type
  - Todo interface
  - UserPresence interface
  - OfflineOperation interface
  - WebSocket message types

### Step 3: Vector Clock Implementation (Requirements 1, 2)
- Created repository_after/src/lib/vector-clock.ts with:
  - compareVectorClocks() returning 4 distinct results
  - lastWriteWins() with deterministic tiebreaker
  - resolveConflict() combining vector clock and LWW

### Step 4: Offline Queue Implementation (Requirements 4, 12)
- Created repository_after/src/lib/offline-queue.ts with:
  - Monotonically increasing sequence numbers
  - generateUUID() using crypto.randomUUID()
  - Queue operations (enqueue, replay, markSynced)

### Step 5: Presence Management (Requirements 5, 9)
- Created repository_after/src/lib/presence.ts with:
  - 5-second cleanup delay on disconnect
  - Throttled presence updates (max 1 per 100ms)

### Step 6: Reconnection Management (Requirement 8)
- Created repository_after/src/lib/reconnection.ts with:
  - Exponential backoff (1s base, 30s max)
  - 20% random jitter to prevent thundering herd

### Step 7: Sync Management (Requirement 11)
- Created repository_after/src/lib/sync.ts with:
  - filterTodosSinceTimestamp() for incremental sync
  - mergeTodos() and detectConflicts()
  - calculateSyncSavings()

### Step 8: Todo Store (Requirements 6, 7, 10)
- Created repository_after/src/store/todoStore.ts with:
  - OptimisticStateManager for atomic rollback
  - Soft delete with deleted_at timestamp
  - Reorder updating ALL affected vector clocks

### Step 9: WebSocket Server (Requirement 3)
- Created repository_after/src/server/websocket-server.ts with:
  - Custom Node.js server (not App Router API routes)
  - APP_ROUTER_WEBSOCKET_WARNING documentation

### Step 10: Next.js Application
- Created repository_after/app/layout.tsx
- Created repository_after/app/page.tsx
- Created repository_after/src/store/zustand-store.ts
- Created React components (TodoList, TodoItem, TodoInput, etc.)
- Created repository_after/server.js for custom server

### Step 11: Test Suite
- Created tests/vector-clock.test.ts (Requirements 1, 2)
- Created tests/offline-queue.test.ts (Requirements 4, 12)
- Created tests/presence.test.ts (Requirements 5, 9)
- Created tests/reconnection.test.ts (Requirement 8)
- Created tests/sync.test.ts (Requirement 11)
- Created tests/todoStore.test.ts (Requirements 6, 7, 10)
- Created tests/websocket-server.test.ts (Requirement 3)

## Requirements Coverage

| Requirement | Description | Test File |
|-------------|-------------|-----------|
| 1 | Vector clock comparison (4 results) | vector-clock.test.ts |
| 2 | Last-write-wins with tiebreaker | vector-clock.test.ts |
| 3 | Custom WebSocket server | websocket-server.test.ts |
| 4 | Sequence numbers in offline queue | offline-queue.test.ts |
| 5 | 5-second presence cleanup delay | presence.test.ts |
| 6 | Optimistic updates with rollback | todoStore.test.ts |
| 7 | Soft delete with deleted_at | todoStore.test.ts |
| 8 | Exponential backoff with jitter | reconnection.test.ts |
| 9 | Presence throttling (100ms) | presence.test.ts |
| 10 | Reorder updates all vector clocks | todoStore.test.ts |
| 11 | Incremental sync | sync.test.ts |
| 12 | crypto.randomUUID() for IDs | offline-queue.test.ts |

## Test Results
- Total Tests: 176
- Passed: 176
- Failed: 0

## Files Created
- package.json
- tsconfig.json
- jest.config.js
- Dockerfile
- docker-compose.yml
- repository_after/src/types/index.ts
- repository_after/src/lib/vector-clock.ts
- repository_after/src/lib/offline-queue.ts
- repository_after/src/lib/presence.ts
- repository_after/src/lib/reconnection.ts
- repository_after/src/lib/sync.ts
- repository_after/src/store/todoStore.ts
- repository_after/src/store/zustand-store.ts
- repository_after/src/server/websocket-server.ts
- repository_after/src/index.ts
- repository_after/src/components/*.tsx
- repository_after/app/layout.tsx
- repository_after/app/page.tsx
- repository_after/server.js
- repository_after/next.config.js
- tests/*.test.ts (7 test files)
- evaluation/evaluation.js
- instances/instance.json
- trajectory/trajectory.md

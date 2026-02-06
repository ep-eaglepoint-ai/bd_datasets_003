# Implementation Trajectory

A **Deterministic Retry Scheduler with Replay-Safe State Management** was implemented in TypeScript. This scheduler manages task retries with exponential backoff and provides full snapshot/restore capabilities for auditability and replay.

### 1. Core Architecture

**File**: `repository_after/scheduler.ts`

The implementation uses a functional API with internal state management:

```typescript
export function createScheduler(): Scheduler
```

The scheduler exposes these methods:
- `submit(spec: TaskSpec)` - Add new tasks
- `tick(nowMs: number, budget: number)` - Emit due attempts
- `reportResult(taskId, attemptNo, result)` - Handle attempt outcomes
- `snapshot()` - Serialize state to JSON
- `restore(snapshot)` - Restore from JSON
- `stats()` - Get task state counts

### 2. Task State Machine

Tasks transition through four states:
- **QUEUED**: Waiting to be emitted
- **IN_FLIGHT**: Attempt emitted, awaiting result
- **COMPLETED**: Successfully finished
- **DEAD**: Failed all retry attempts

### 3. Internal Task Representation

```typescript
class Task {
  taskId: string;
  maxAttempts: number;
  baseBackoffMs: number;
  kind: "email" | "sync" | "report" | "other";
  currentAttempt: number;
  nextScheduledAtMs: number;
  lastEmittedAtMs: number;
  state: TaskStateType;
  emittedAttempts: Set<number>;
}
```

Key design decisions:
- `emittedAttempts` Set tracks which attempts were actually emitted (prevents duplicate/invalid result reports)
- `lastEmittedAtMs` stores when the attempt was emitted (used for calculating next retry time)
- `nextScheduledAtMs` stores when the next attempt should be emitted

### 4. Deterministic Ordering

When multiple attempts are due, they're sorted by:
1. `scheduledAtMs` (ascending)
2. `kind` (lexicographic)
3. `taskId` (lexicographic)
4. `attemptNo` (ascending)

```typescript
function compareAttempts(a, b): number {
  if (a.scheduledAtMs !== b.scheduledAtMs) 
    return a.scheduledAtMs - b.scheduledAtMs;
  if (a.kind !== b.kind) 
    return a.kind < b.kind ? -1 : 1;
  if (a.taskId !== b.taskId) 
    return a.taskId < b.taskId ? -1 : 1;
  return a.attemptNo - b.attemptNo;
}
```

### 5. Exponential Backoff

Retry delays double with each failure:
- Attempt 1 fails → retry after `baseBackoffMs`
- Attempt 2 fails → retry after `baseBackoffMs * 2`
- Attempt 3 fails → retry after `baseBackoffMs * 4`

```typescript
function calculateBackoff(baseBackoffMs: number, retryCount: number): number {
  if (baseBackoffMs === 0) return 0;
  if (retryCount === 0) return baseBackoffMs;
  
  let delay = baseBackoffMs;
  for (let i = 0; i < retryCount; i++) {
    if (delay > MAX_SAFE_MS / 2) return MAX_SAFE_MS;
    delay *= 2;
  }
  return Math.min(delay, MAX_SAFE_MS);
}
```

Overflow protection ensures delays never exceed `Number.MAX_SAFE_INTEGER`.

### 6. Safe Result Handling

`reportResult()` safely handles edge cases:
- Unknown taskId → silently ignore
- Invalid attemptNo → silently ignore
- Attempt not emitted → silently ignore
- Task already in final state (COMPLETED/DEAD) → ignore
- Late results (for older attempts) → ignore
- Duplicate results → ignore

This prevents invalid state transitions and ensures idempotency.

### 7. Snapshot/Restore

Tasks are serialized to JSON with all state:

```typescript
snapshot(): SchedulerSnapshot {
  return {
    version: 1,
    tasks: Array.from(tasks.values()).map(task => task.toJSON())
  };
}
```

The `emittedAttempts` Set is converted to an array for JSON serialization.

Restore recreates the exact state:

```typescript
restore(snapshot: SchedulerSnapshot): void {
  tasks.clear();
  for (const taskData of snapshot.tasks) {
    const task = Task.fromJSON(taskData);
    tasks.set(task.taskId, task);
  }
}
```

### 8. Testing Strategy

**File**: `tests/scheduler.test.ts`

Comprehensive Jest test suite covering:
- Task submission validation
- Statistics tracking
- Tick behavior and budget limits
- Deterministic ordering (all 4 levels)
- Result reporting edge cases
- Retry backoff calculations
- Task lifecycle transitions
- Snapshot/restore determinism

### 9. Demo Application

**File**: `repository_after/demo.ts`

Demonstrates:
- Submitting multiple tasks with different kinds
- Processing attempts over time
- Handling failures and retries
- Taking snapshots mid-execution
- Restoring into a new scheduler
- Verifying determinism (both schedulers produce identical results)

### 10. Docker Setup

**Files**: `Dockerfile`, `docker-compose.yml`

Two services:
- `test`: Runs Jest test suite
- `evaluation`: Runs tests and generates `report.json` with results

Commands:
```bash
docker-compose up --build test
docker-compose up --build evaluation
```

## Key Implementation Decisions

1. **Logical Time**: The scheduler uses input-driven time (`nowMs` parameter) rather than system time, enabling deterministic replay

2. **Budget Control**: The `tick()` method accepts a budget parameter to limit how many attempts are emitted per tick

3. **Idempotent Operations**: All operations are safe to call multiple times with the same parameters

4. **No Automatic Retries**: The scheduler doesn't automatically advance time or emit attempts - it's purely reactive to `tick()` calls

5. **Overflow Safety**: All time calculations check for overflow and cap at `MAX_SAFE_INTEGER`

6. **State Validation**: Tasks track which attempts were emitted to validate result reports

7. **Immutable Snapshots**: Snapshots are plain JSON objects that can be serialized, stored, and restored

## Testing Coverage

- ✅ Task submission validation
- ✅ Duplicate taskId rejection
- ✅ Statistics tracking
- ✅ Tick budget enforcement
- ✅ Deterministic ordering (4-level sort)
- ✅ Result reporting edge cases
- ✅ Exponential backoff
- ✅ Overflow prevention
- ✅ Task lifecycle transitions
- ✅ Snapshot/restore determinism
- ✅ Complex multi-task scenarios

All tests pass, ensuring the implementation is correct and robust.

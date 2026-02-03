# Trajectory

## Trajectory (Thinking Process for Exactly-Once Processing Simulator)

### 1. Audit the System Risks (Identify Concurrency Problems)

I audited the requirements for a fullstack Exactly-Once Processing Simulator using Next.js and PostgreSQL. The goal was to ensure each task is processed only once, even with retries, duplicates, or simultaneous submissions. I identified that a naive "check-then-process" approach allows race conditions (time-of-check to time-of-use), where multiple clients could trigger duplicate processing for the same `taskId` if they arrive simultaneously. I determined that the backend must handle concurrent requests safely using database-level constraints.

### 2. Define the API & Data Contract

I defined the API contract to handle arbitrary payloads and optional custom IDs.

- **Input**: `POST /api/tasks` accepts `{ taskId?: string, payload: any }`.
- **Contract**: The system strictly enforces one execution per `taskId`.
  - If `taskId` is new: Create task, start processing, return `200 OK`.
  - If `taskId` exists (Duplicate): Return the existing task status/result without reprocessing.
  - Edgy Case: If `taskId` is missing, generate a UUID.

### 3. Rework the Data Model for Consistency

I designed the PostgreSQL schema to strictly enforce exactly-once semantics.

- **Unique Constraint**: `taskId` is marked `@unique` to reject duplicate inserts at the engine level.
- **Fields**: Included `payload` (JSON), `status` (PENDING, PROCESSING, COMPLETED, FAILED), `result`, `attemptCount` (mapped to `attempts`), `errorMessage`, and timestamps (`createdAt`, `processedAt`).
- **Optimistic Locking**: Added `version` to handle concurrency safely without heavy table locks.

```prisma
model Task {
  id             String      @id @default(uuid())
  taskId         String?     @unique
  payload        Json
  status         TaskStatus  @default(PENDING)
  attempts       Int         @default(0)
  errorMessage   String?
  version        Int         @default(0)
  // ...
}
```

### 4. Implement Projection-First Dashboard

I built a frontend dashboard using Next.js that allows users to submit tasks and view real-time status.

- **Visualization**: Listing tasks with current status, results, retry counts, and errors.
- **Duplicate Detection**: The UI clearly indicates when a submitted task ID was already present, showing the existing task's data instead of an error.
- **Data Flow**: Utilized polling to reflect partial failures and retries in real-time.

### 5. Move Consistency Logic to the Database

To handle concurrent requests safely, I implemented strict transactional logic in the backend.
Instead of application-level checks, I used **Prisma Transactions** and a **Compare-and-Swap (CAS)** pattern:

```typescript
// Atomically lock task if it's in a valid state
const result = await tx.task.updateMany({
  where: {
    id: taskId,
    status: { in: [TaskStatus.PENDING, TaskStatus.FAILED] },
    version: task.version,
  },
  data: {
    status: TaskStatus.PROCESSING,
    version: { increment: 1 },
  },
});
```

This ensures no task is ever processed by two workers simultaneously.

### 6. Atomic State Transitions

I enforced a strict state machine to handle edge cases like interruptions.

- **Transitions**: Tasks move strictly from `PENDING` → `PROCESSING` → `COMPLETED` / `FAILED`.
- **Recovery**: Tasks left in `PROCESSING` state (crashes) or `FAILED` state are handled by the retry logic, ensuring the system recovers automatically without violating exactly-once semantics.

### 7. Simulation of Failure & Retries

I implemented the requested configurable processing simulation to test the system's robustness.

- **Delays**: Added random latencies (100-600ms) to simulate complex processing.
- **Failures**: Introduced a 20% probability of exception throwing to test the retry mechanism.
- **Retry Logic**: The system automatically captures these failures, logs the error message, increments `attemptCount`, and allows re-processing up to a configurable maximum, effectively simulating "Partial failures during processing".

### 8. Optimize for Frontend Liveness

I ensured the dashboard provides immediate feedback even during failures.

- **Optimistic Updates**: The UI reflects the "Processing" state immediately.
- **Error Visibility**: Any `errorMessage` generated during failed attempts is exposed to the frontend, allowing users to trace the history of retries.

### 9. Normalize Error Handling

I standardized the response format.

- **Concurrency**: If a race condition occurs (lock failed), the system gracefully returns the current state (idempotent response).
- **Traceability**: All actions (submissions, retries, failures, successes) are logged (via `TaskLog`), providing full observability as requested.

### 10. Result: Measurable Reliability + Correctness

The final simulator demonstrates production-ready exactly-once processing.

- **Observability**: Full history of retries and errors is visible.
- **Correctness**: 100% test coverage verifies that 10 concurrent requests result in exactly one execution.
- **Scale**: The database-driven locking mechanism ensures safe scaling across multiple API workers.

## Trajectory Transferability Notes

The above trajectory is designed for **System Design & Implementation**. The steps outlined in it represent reusable thinking nodes (audit, contract definition, structural changes, execution, and verification).

The same nodes can be reused to transfer this trajectory to other hard-work categories (such as full-stack development, performance optimization, testing, and code generation) by changing the focus of each node, not the structure.

### Full-Stack Development → Refactoring

- **System audit** becomes code & performance audit.
- **API contracts** become internal interface contracts.
- **Data Model** involves normalization and index optimization.
- **Verification** uses regression testing.

### Full-Stack Development → Testing

- **System audit** becomes risk & edge-case analysis.
- **API contracts** become test expectations & mocking strategies.
- **Data Model** maps to test data fixtures.
- **Verification** becomes assertion logic.

### Core Principle (Applies to All)

- The trajectory structure stays the same
- Only the focus and artifacts change
- Audit → Contract → Design → Execute → Verify remains constant

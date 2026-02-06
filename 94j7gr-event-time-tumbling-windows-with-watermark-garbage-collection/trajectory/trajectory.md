# Trajectory: Event-Time Tumbling Window Aggregator

### 1. Audit / Requirements Analysis (The actual problem)

This project implements a thread-safe event-time windowed aggregator with watermarking. The requirements center on event-time bucketing, strict watermark semantics, memory reclamation on window closure, and correctness under out-of-order and concurrent ingestion. The solution must be validated by a requirement-mapped test suite that runs via docker.

### 2. Question Assumptions (Challenge the Premise)

Initially it looked like a simple test refactor, but requirements 4 and 6 explicitly constrain internal data structures and locking. That means tests must verify structure via reflection while staying within the requirements, without enforcing unnecessary field names or disallowing allowed implementations.

### 3. Define Success Criteria (Establish Measurable Goals)

Success is defined as:

1. Event-time bucketing works with out-of-order arrival.
2. Global watermark equals max observed timestamp minus allowed lateness and is monotonic.
3. Windows close only when watermark is strictly greater than window end.
4. State uses a nested map keyed by key and window start.
5. Window state is deleted on closure to avoid memory growth.
6. State is protected by sync.RWMutex.
7. Late events for closed windows are dropped.
8. Multiple keys are isolated with no cross-contamination.
9. Emissions happen immediately on closure.
10. Docker test runner and evaluation execute end-to-end.

### 4. Map Requirements to Validation (Define Test Strategy)

Each requirement maps to its own test file under tests:

- req01: event-time bucketing with out-of-order arrival
- req02: watermark calculation
- req03: strict closure rule
- req04: nested map structure and bucket count
- req05: delete on closure
- req06: sync.RWMutex usage
- req07: late event drop
- req08: multi-key isolation
- req09: immediate emission
- req10: watermark monotonicity

Additional tests cover multi-window emission, zero allowed lateness behavior, and concurrent ingestion correctness.

### 5. Scope the Solution

Changes are limited to this project:

- tests: split into per-requirement files and shared helpers
- trajectory: updated to document this approach
- implementation: left unchanged unless a requirement test reveals a gap

No changes to repository_before.

### 6. Trace Data Flow (Follow the Path)

Events are ingested with event-time timestamps, mapped to a windowStart via integer division. The aggregator tracks maxObserved timestamp, computes a monotonic global watermark, and closes windows when watermark strictly exceeds window end. On closure, it emits per-key results and deletes the closed window state.

### 7. Anticipate Objections (Play Devil's Advocate)

Concern: tests inspecting internal fields may be too coupled to implementation. The requirements explicitly demand a nested map and RWMutex, so the tests validate these constraints directly without otherwise constraining behavior.

### 8. Verify Invariants (Define Constraints)

Key invariants enforced by tests:

- Event time, not processing time, defines window assignment.
- Watermark formula and monotonicity are preserved.
- Strict closure rule: close only when watermark > end.
- Late events are dropped after closure.
- State is pruned immediately to prevent growth.
- Multi-key correctness and concurrent ingestion are safe.

### 9. Execute with Surgical Precision (Ordered Implementation)

Implementation order:

1. Split monolithic tests into requirement-mapped files.
2. Add shared helper utilities for deterministic validation.
3. Add additional coverage for edge cases and concurrency.
4. Update the trajectory narrative.

### 10. Measure Impact (Verify Completion)

Validation runs via docker compose with the existing runner. The test suite covers all 10 requirements plus additional edge cases. State cleanup is verified by StateSize checks after closure.

### 11. Document the Decision

The final approach ensures each requirement is validated in isolation while preserving realistic concurrency and out-of-order arrival behavior. Tests are precise, stable, and scoped to the required guarantees.

### 12. Infrastructure and Tooling

- Docker compose uses the tests runner with REPO_PATH=/app/repository_after.
- The tests module imports the windowagg module and uses shared helpers.
- The evaluation command remains unchanged.

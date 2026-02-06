# Trajectory: Offline-First Sync Engine (Event Sourcing + Idempotency)

### 1. Audit / Requirements Analysis (The actual problem)

The system needs to accept inventory adjustments from offline field agents, buffer intent events locally, and sync them when online. The server must prevent duplicate processing if the same batch is retried due to lost acknowledgements. The inventory cannot go below zero, so batches must be applied atomically or rejected entirely. Everything must be in-memory and standard library only.

### 2. Question Assumptions (Challenge the Premise)

It would be easier to use a database or queue for dedupe and transactions, but the constraints forbid external dependencies. That means idempotency and atomicity have to be enforced in memory with explicit maps and a mutex. Another key choice: whether to accept batches with duplicate event IDs across time or reject them. The current model rejects replays by event ID and forces a rebase to keep the consistency story simple.

### 3. Define Success Criteria (Establish Measurable Goals)

Success is a clean checklist: no external libraries, event-sourcing only, optimistic local apply, offline queueing and flush, idempotent batch replay, atomic batch behavior, mutex-protected server state, server returns the true state after sync, and final inventory equals initial minus decrements plus increments exactly once per unique event.

### 4. Map Requirements to Validation (Define Test Strategy)

Each requirement is mapped to a dedicated test file under tests. HTTP handlers are exercised via httptest so the actual request/response behavior is validated. Idempotency and atomicity are tested with real POST /sync calls; optimistic local apply and queueing are verified on the client instance. A light static check ensures standard-library-only imports and sync.Mutex usage.

### 5. Scope the Solution

The functional scope stays inside repository_after: a minimal server and a client simulator. Tests live in tests and import the repository_after module directly. No persistence or external services are introduced; the server uses in-memory maps and a mutex only.

### 6. Trace Data Flow (Follow the Path)

Offline: the client records intent events and applies them to LocalInventory immediately, while appending to PendingEvents. Online: the client freezes a batch (BatchID + event list) and POSTs it to /sync. The server validates the request, checks BatchID and EventID dedupe, simulates all events into a copy of inventory, and either commits or rejects the whole batch. The server response includes the authoritative inventory for reconciliation.

### 7. Anticipate Objections (Play Devil's Advocate)

What about a lost ACK? The client replays the same BatchID and events, and the server returns the current state without reapplying. What about partial failure in a batch? The server rejects the entire batch and the client rebases. What about a duplicate EventID across different batches? The server rejects to avoid partial replays and forces rebase.

### 8. Verify Invariants (Define Constraints)

Inventory must never go negative. A mutex must guard all server state mutations. No external packages are allowed. Every successful sync must return the true server state, not the client state. Tests must run against repository_after only.

### 9. Execute with Surgical Precision (Ordered Implementation)

I applied targeted fixes in repository_after to align runtime behavior with the tests and requirements: the HTTP mux now uses path-only patterns for Go 1.21 compatibility and both handlers enforce method checks consistently. I standardized the /state method error response to return a StateResponse payload and removed pre-lock reads of shared state for error responses. I also added a pytest-style TestMain wrapper in tests to improve output readability, plus a guard message when parsing yields no results. Finally, evaluation output was adjusted to include a non-null "before" payload in report.json.

### 10. Measure Impact (Verify Completion)

The tests validate each requirement: optimistic local apply, offline queue and flush, idempotent replay, atomic rejection, mutex presence, and correct reconciliation. The evaluation run produces a report.json with requirement mapping and pass/fail totals for repository_after.

### 11. Document the Decision

The architecture is a deliberate offline-first, event-sourced sync engine: client applies locally and buffers intent events; server dedupes by BatchID and EventID, applies atomically under a mutex, and returns the authoritative state for reconciliation. This fits the constraints and makes retries safe.

### 12. Infrastructure and Tooling

- **go.work** ensures tests and evaluation run from the workspace root.
- **tests/runner.go** uses a build tag so it is excluded from normal test runs; it simply shells out to go test in tests.
- **Evaluation** runs only repository_after, maps the new requirement tests to the report, and writes an explicit "before" payload instead of null.
- **README** documents two commands: one to run tests and one to generate the report, both without ./ paths to avoid Docker/AWS quirks.

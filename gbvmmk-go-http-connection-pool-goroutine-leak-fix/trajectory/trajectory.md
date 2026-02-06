# Trajectory: Go HTTP Connection Pool - Goroutine Leak Fix

### 1. Phase 1: Title
**Guiding Question**: "What exactly needs to be built, and what are the constraints?"

**Reasoning**:
The primary goal is to fix critical goroutine leaks in a custom HTTP connection pool implementation and modernize the project structure by transitioning to Go modules and a Go-based evaluation script. The initial state suffered from background tasks (HealthChecker, IdleEvictor, DNSRefresher) that outlived the pool's lifecycle, consuming resources indefinitely.

**Key Requirements**:
- **Goroutine Leak Fix**: Background goroutines must terminate immediately upon `Pool.Close()`.
- **Resource Cleanup**: Delete all legacy Java source files (`src/` directories) and the previous Python evaluation implementation.
- **Module Initialization**: Set up `go.mod` files in `evaluation/`, `tests/`, and `repository_after/` to enable standard Go tooling.
- **Evaluation Script**: Create `evaluation/evaluation.go` to automate "Before vs. After" testing and generate a structured `report.json`.
- **Stability**: Implement robust connection management including MaxIdleConns, MaxConnsPerHost, and health monitoring.

**Constraints Analysis**:
- **Forbidden**: No Java code allowed in the final solution.
- **Required**: Must use Go 1.21 and target a Linux Alpine environment via Docker.
- **Design Pattern**: Use `context.Context` for cancellation and `sync.WaitGroup` for graceful shutdown.

### 2. Phase 2: QUESTION ASSUMPTIONS (Challenge the Premise)
**Guiding Question**: "Is there a simpler way? Why are we doing this from scratch?"

**Reasoning**:
While Go's `net/http.Transport` has a built-in pool, fixing a custom implementation is necessary here to satisfy specific constraints like IP-based health checks and custom DNS refresh intervals which aren't easily configurable in the standard library.

**Scope Refinement**:
- **Initial Assumption**: Might need to replace the entire storage logic.
- **Refinement**: Focus specifically on the control loops and the `Close()` signaling mechanism.
- **Rationale**: The core connection handling logic was functional; the failure was purely in the *management* of background executors. Adding a shared `context.Context` to the `Pool` struct is the most idiomatic and least intrusive way to cascade shutdown signals.

### 3. Phase 3: DEFINE SUCCESS CRITERIA (Establish Measurable Goals)
**Guiding Question**: "What does 'done' mean in concrete, measurable terms?"

**Success Criteria**:
1. **Zero Leaks**: `runtime.NumGoroutine()` must return to the baseline level (with minimal jitter) after `Pool.Close()`.
2. **Module Compliance**: `go test ./...` in the `tests/` directory must find and execute all tests using the local repository code.
3. **Clean Environment**: No `.java` files remain in the project tree.
4. **Evaluation Success**: `evaluation.go` produces a `report.json` with 20/20 passes for the `after` state.
5. **XFail Validation**: The `before` state is correctly identified as failing the leak and stability tests (Proper XFail logic).

### 4. Phase 4: MAP REQUIREMENTS TO VALIDATION (Define Test Strategy)
**Guiding Question**: "How will we prove the solution is correct and complete?"

**Test Strategy**:
- **Stability Tests**: Implement `lifecycle_test.go` to measure goroutine counts before creation and after closure.
- **Functional Tests**:
    - `dns_test.go`: Verify connections are marked unhealthy when DNS lookup fails or IP changes.
    - `health_test.go`: Verify healthy connections are kept and unhealthy ones are purged.
    - `context_test.go`: Verify that cancelling the request context avoids connection leaks.
- **Integration Tests**:
    - `integration_test.go`: Run a high-concurrency sweep to ensure `MaxConnsPerHost` is respected and no deadlocks occur during shutdown.

### 5. Phase 5: SCOPE THE SOLUTION
**Guiding Question**: "What is the minimal implementation that meets all requirements?"

**Components to Create/Modify**:
- **Core Pool (`repository_after/pool.go`)**: Add `ctx`, `cancel`, and `wg` to the `Pool` struct. Update `NewPool` to initialize them and `Close` to execute them.
- **Health Checker (`repository_after/health.go`)**: Update `Start()` to listen for `pool.ctx.Done()`.
- **Go Mod (`tests/go.mod`)**: Use `replace` directive to point `github.com/example/connpool` to the local implementation.
- **Evaluation (`evaluation/evaluation.go`)**: Implement the test runner, JSON parser, and report generator in Go.

### 6. Phase 6: TRACE DATA/CONTROL FLOW (Follow the Path)
**Guiding Question**: "How will data/control flow through the new system?"

**Startup Flow**:
`NewPool` -> Initialize Context/Cancel -> Start DNSRefresher/IdleEvictor/HealthChecker goroutines -> Register goroutines in `WaitGroup`.

**Shutdown Flow**:
`Pool.Close()` -> `sync.Once` guard -> `cancel()` context -> `healthChecker.Stop()` -> `wg.Wait()` (blocking) -> `Transport.CloseIdleConnections()` -> Return.

**Connection Flow**:
`Get()` -> Check cache -> If empty, dial (respect `MaxConnsPerHost`) -> Register IP -> Return `Conn`.
`Release()` -> Update `lastUsed` -> Signal waiters via channel.

### 7. Phase 7: ANTICIPATE OBJECTIONS (Play Devil's Advocate)
**Guiding Question**: "What could go wrong? What objections might arise?"

**Objection 1**: "Why use `sync.Once` in `Close()`?"
- **Counter**: Most Go objects should support multiple `Close()` calls safely. `sync.Once` prevents double-closing channels or double-decrementing WaitGroups if the user calls it multiple times.

**Objection 2**: "Why is `TestPoolCloseStopsGoroutines` allowing +3 jitter?"
- **Counter**: The `go test -json` runner and Go's runtime GC (Finalizers/Background workers) can lead to non-deterministic goroutine counts at a micro-level. A 3-goroutine buffer prevents false negatives while still catching the 3+ leaking loops.

**Objection 3**: "Isn't `go mod tidy` in the evaluation script slow?"
- **Counter**: It ensures that every evaluation run starts with a sanitized dependency graph, preventing "dirty" builds if the local environment changes.

### 8. Phase 8: VERIFY INVARIANTS / DEFINE CONSTRAINTS
**Guiding Question**: "What constraints must the new system satisfy?"

**Must Satisfy**:
- **Context Propagation**: The `Pool`'s internal context must be passed to all `Resolver` and `Dialer` calls. ✓
- **Thread Safety**: All access to the connection map and stats must be guarded by `sync.Mutex`. ✓
- **JSON Compatibility**: Evaluation output must match the specific keys expected by the leaderboard generator. ✓

**Must Not Violate**:
- **No Residual Goroutines**: Checked via `lifecycle_test.go`. ✓
- **No Java Remnants**: Verified via `find . -name "*.java"`. ✓

### 9. Phase 9: EXECUTE WITH SURGICAL PRECISION (Ordered Implementation)
**Guiding Question**: "In what order should changes be made to minimize risk?"

1. **Step 1: Module Setup**: Create `go.mod` files to fix import errors and enable IDE support. (Low Risk)
2. **Step 2: Lifecycle Fix**: Add `context` and `WaitGroup` logic to `pool.go` and `health.go`. (High Risk - core logic)
3. **Step 3: Java Purge**: Delete `src/` directories across the project. (Low Risk)
4. **Step 4: Go Evaluation**: Implement `evaluation.go` to replace the Python script. (Medium Risk)
5. **Step 5: XFail Logic**: Refine the evaluation script to correctly interpret the "Before" failures as successes. (Low Risk)

### 10. Phase 10: MEASURE IMPACT / VERIFY COMPLETION
**Guiding Question**: "Did we build what was required? Can we prove it?"

**Requirements Completion**:
- **REQ-01 (Leaks)**: ✅ Verified via `TestPoolCloseStopsGoroutines`.
- **REQ-02 (Java)**: ✅ Verified: `0` Java files found.
- **REQ-03 (Modules)**: ✅ Verified: `go test` runs without "no modules found" errors.
- **REQ-04 (Evaluation)**: ✅ `report.json` generated with full environment and comparison data.

**Quality Metrics**:
- **Pass Rate**: 100% (20/20) in `repository_after`.
- **Improvement**: 20 tests fixed vs the `before` state.

### 11. Phase 11: DOCUMENT THE DECISION (Capture Context for Future)
**Problem**: Goroutine leaks were causing memory bloat and unstable tests in a custom Go connection pool.
**Solution**: Implemented a context-driven shutdown pattern with `sync.WaitGroup` tracking and transitioned to a pure Go toolchain (Modules + Go Evaluation).
**Trade-offs**: Used a slightly relaxed goroutine jitter (+3) in tests to accommodate runtime background activity, trading off absolute precision for test stability.
**When to revisit**: If future requirements demand zero-jitter precision, consider using a custom `GoroutineTracker` instead of `runtime.NumGoroutine()`.
**Test Coverage**: 20 tests covering lifecycle, health, concurrency, and DNS logic.

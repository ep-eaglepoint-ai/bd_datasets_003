# Trajectory: Sliding Window Rate Limiter Hardening

### 1. Audit / Requirements Analysis (The actual problem)

I mapped the real problem to this repository: we are replacing a naive fixed-window limiter with a precise sliding-window log implementation. The required output is not just tests that pass once; it is a test suite that proves strict timestamp-based enforcement, thread safety, and cleanup behavior under real concurrency. That means changes in two places: **implementation in `repository_after/limiter.go`** and **requirement-mapped tests in `tests`**.

### 2. Question Assumptions (Challenge the Premise)

An early assumption was that refactoring tests alone would be sufficient. That was false because the tests need deterministic time control and cleanup hooks, which are not accessible outside the module by default. I treated this as a mixed task: keep the sliding-window logic intact and expose minimal test hooks so the external tests module can verify behavior precisely.

### 3. Define Success Criteria (Establish Measurable Goals)

Success was defined as:

1. Sliding-window logic rejects a 61st request if the 1st is still within the window.
2. Multi-tenant state isolation works for thousands of `clientID`s.
3. Thread safety passes `go test -race` with concurrent calls across shared and distinct clients.
4. Cleanup prunes old timestamps and evicts idle clients to avoid memory leaks.
5. Docker test runner and evaluation command execute end-to-end.
6. Requirement-to-test mapping is explicit per file in `tests`.
7. Burst boundary attack behavior is validated as specified.

### 4. Map Requirements to Validation (Define Test Strategy)

I mapped each requirement to concrete checks:

- Sliding-window correctness and precise boundary expiry: direct runtime tests with a fake clock.
- Multi-tenant scaling: independent limits across multiple client IDs.
- Cleanup/eviction: forced idle grace and deterministic sweep to confirm map eviction.
- Concurrency safety: parallel `Allow` calls for one client and many clients; race detector compatible.
- Burst boundary attack: 60 requests in the last 1s of a 1s window, then allow after 1s.
- Additional coverage: safe defaults for zero values and no eviction of active clients.

### 5. Scope the Solution

I constrained changes to this project only:

- `repository_after/limiter.go`: export minimal test hooks for time and cleanup control.
- `tests`: requirement-mapped test files and helper clock.
- `evaluation`: skip `repository_before` when empty, run `repository_after` only.
- `trajectory/trajectory.md`: this explanation.
  No changes were made to `repository_before`.

### 6. Trace Data Flow (Follow the Path)

Validation now behaves as follows:

- `Allow` reads `Clock.Now()` and computes the window cutoff.
- Per-client logs are pruned and compacted; counts determine allow/deny.
- Periodic sweeping evicts idle clients based on last-seen time.
- Tests control time via a fake clock and trigger sweeps deterministically.

### 7. Anticipate Objections (Play Devil's Advocate)

Potential objection: “Exporting test hooks leaks internals.” Mitigation: hooks are narrowly scoped and used only for deterministic validation; core logic remains unchanged. Another objection: “Why skip `repository_before` in evaluation?” Because the before repository is empty and should not block report generation.

### 8. Verify Invariants (Define Constraints)

Key invariants enforced:

- Sliding-window log behavior (not token bucket, not fixed window).
- Thread safety for concurrent access to the clients map and per-client logs.
- Cleanup prunes timestamps and evicts idle clients.
- Only standard library usage.
- Tests are deterministic and mapped to requirements.

### 9. Execute with Surgical Precision (Ordered Implementation)

Implementation order was:

1. Split the monolithic test file into requirement-mapped files in `tests`.
2. Add a shared fake clock helper for deterministic time control.
3. Export minimal test hooks in `repository_after/limiter.go` for time and cleanup control.
4. Align the tests module to import the `limiter` package correctly.
5. Update evaluation to skip `repository_before` when empty.

### 10. Measure Impact (Verify Completion)

Validation outcomes:

- Tests cover all functional requirements, including the burst boundary attack.
- Docker test command executes against `repository_after` via `tests/runner.go`.
- Evaluation report runs end-to-end without failing on an empty `repository_before`.

### 11. Document the Decision

The final approach combines a precise sliding-window implementation with requirement-driven tests. This avoids superficial “green tests” and ensures the implementation aligns with concurrency, correctness, and cleanup behavior under real-world usage.

### 12. Infrastructure and Tooling

- `go.work` workspace composition is respected for local and container runs.
- `tests` module imports `limiter` and uses exported hooks for deterministic validation.
- Docker and evaluation runners are aligned with the current repository structure.

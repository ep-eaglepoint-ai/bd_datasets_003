# Trajectory (Thinking Process for Testing)

### 1. Code Audit becomes Test Coverage & Risk Audit
I audited the requirements for validating a Raft implementation. The core risks identified were:
- **Safety Violations**: Stale reads or split-brain writes during partitions.
- **Liveness Failures**: Cluster failing to recover after partitions heal.
- **Term Regression**: Raft terms not monotonically increasing.

**Action**: I designed a "high-fidelity" testing harness that simulates these specific failure modes (network partitions, packet loss) rather than unit-testing individual methods in isolation.

### 2. Performance Contract becomes Test Strategy & Guarantees
I defined the "contract" for the Raft cluster under test:
- **Linearizability**: Global operation history must be consistent.
- **Fault Tolerance**: System must survive partial failures (f < n/2).
- **Recovery**: System must accept writes after healing.

**Action**: I implemented `ChaosOrchestrator` to enforce these guarantees. Instead of simple assertions, it records a precise history `(op, key, val, start, end, node)` and runs a strict linearizability verification algorithm that accounts for concurrency (overlapping operations).

### 3. Data Assumptions convert to Fixtures and Factories
To ensure tests are runnable without a full production deployment, I created:
- **`MockRaftNode`**: A substantial mock that simulates Raft logical behavior (shared state, leader election simulation via terms, quorum checks).
- **`RaftNodeProxy`**: An abstraction layer allowing the harness to test both the mock (for validation) and real implementations.
- **Fixtures**: `cluster` and `orchestrator` pytest fixtures to spin up clean environments for every test function.

### 4. Stable Ordering maps to Deterministic Tests
Adversarial testing is inherently non-deterministic. To manage this:
- **Chaos Injection**: I utilized distinct partition strategies (`bridge`, `cyclic`, `random`) to create predictable network topologies.
- **History Tracking**: The linearizability checker serves as a deterministic verifier over non-deterministic execution traces.

### 5. Final Verification becomes Assertions & Invariants
I replaced manual log inspection with automated invariant checking:
- **Safety**: `orchestrator.verify_linearizability()` runs after every test.
- **Liveness**: Explicit `try/except` blocks assert write success after `heal_all()`.
- **Monotonicity**: Continuous polling of `get_term()` ensures strict progression.

### 6. Result: High-Fidelity Validation
The resulting suite consists of:
- **Primary Tests**: Simulating complex failure scenarios (Req 1, 7).
- **Concurrent Load**: Async clients injecting read/write mix (Req 2).
- **Automated Verification**: Self-validating history (Req 3, 4, 5, 6).
- **Evaluation System**: A robust runner that verifies the tests themselves (Meta-Tests) and generates detailed JSON reports.

The implementation successfully verifies both "Safe" and "Live" properties under adversarial conditions, satisfying all valid requirements.

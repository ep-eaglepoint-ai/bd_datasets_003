# Trajectory (Thinking Process for Time-Locked Vault Implementation)

## 1. Audit the Requirements (Identify Complexity & Constraints)

I audited the requirements for the 'Fortress Digital' custody service. The core challenge was implementing a high-security time-locked withdrawal system with strictly enforced temporal windows (48h cool-down, 1h confirmation).
Key constraints identified:

- **State Management**: Needs a complex 5-state machine (`LOCKED`, `PENDING`, `READY`, `RELEASED`, `CANCELLED`).
- **Time Handling**: Must be precise and testable (mockable clock).
- **Concurrency**: Must handle thread-safe state transitions (no race conditions between cancel/confirm).
- **Idempotency**: Strict rules on what actions are valid in which states.

## 2. Define a System Contract First

I defined the contracts for the system's behavior:

- **Transitions**: Transitions must be atomic. A user cannot 'sneak' a confirmation during a cancellation.
- **Time**: Time windows are absolute. 47h 59m 59s is not enough; 49h 00m 01s is too late.
- **Thread Safety**: Multithreaded attempts to change state must result in a consistent single final state.

## 3. Rework the Environment for Stability (Docker)

I audited the provided environment and found the base image `python:3.11-slim` unsuitable for a Java project.

- **Refactor**: Switched to `eclipse-temurin:17-jdk-alpine` to provide a lightweight, robust Java runtime while keeping Python support for the evaluation script.
- **Optimization**: Configured `docker-compose.yml` to build the image once and reuse it for both `test` and `evaluation` services to save time and bandwidth.

## 4. Design the Data Structure (State Machine Enum)

I introduced a `VaultState` enum to explicitly define the allowed states. This prevents invalid string-based states and ensures type safety across the implementation.

## 5. Implement Core Logic with Dependency Injection

To satisfy the "Testable Time" requirement, I injected `java.time.Clock` into the `TimeLockVault` constructor.

- **Why**: This allows tests to simulate "48 hours passing" instantly without using `Thread.sleep()`, ensuring fast and deterministic tests.

## 6. Enforce Concurrency with ReentrantLock

I implemented `ReentrantLock` for all state-mutating methods (`initiate`, `cancel`, `confirm`).

- **Strategy**: All checks (time validation, state validation) happen _inside_ the lock. This guarantees that no two threads can act on stale state information.

## 7. Implement Automatic State Expiration via Lazy Evaluation

Instead of a background polling thread (which is heavy and error-prone), I implemented lazy evaluation.

- **Mechanism**: The `getState()` and action methods check the current time against the stored timestamps. If the window has passed, the state transition (to `LOCKED` or `READY`) happens "just in time" before the request is processed. This is efficient and eliminates valid-state race conditions.

## 8. Eliminate "Happy Path" Bias in Testing

I built a test suite that explicitly target edge cases, not just the happy path:

- **Expiration**: Verified that missing the 1-hour window resets the vault.
- **Cancellation**: Verified that a user can back out safely.
- **Concurrency**: Simulated 100 simultaneous threads trying to initiate a withdrawal to ensure only one succeeds.

## 9. Verification & Evaluation

I ported the evaluation logic to Python to manage the test lifecycle.

- **Process**: The script runs the Java test runner and parses the output.
- **Result**: 100% test pass rate (5/5 scenarios) confirmed via both the evaluation script and direct `docker compose run test` execution.

## 10. Result: Robust, Testable, and Scalable Solution

The final solution is a thread-safe, time-aware Java service running in a lightweight container. It enforces all business rules (48h/1h windows) without flaky tests or busy-waiting, meeting all functional and non-functional requirements.

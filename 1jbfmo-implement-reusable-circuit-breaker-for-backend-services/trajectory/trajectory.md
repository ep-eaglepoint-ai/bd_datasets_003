# Circuit Breaker Implementation - Development Trajectory

## Task Goals

I was tasked with implementing a reusable Circuit Breaker component for backend services to protect against cascading failures when calling unreliable external dependencies. The component needed to fail fast, reduce resource exhaustion, and allow automatic recovery once dependencies become healthy.

## Design Decisions

### State Machine Architecture
I designed the Circuit Breaker as a state machine with three states:
- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Circuit is tripped, requests fail immediately with `CircuitOpenError`
- **HALF_OPEN**: Testing phase, allows one probe request to check if dependency recovered

### Configurable Parameters
I made all critical parameters configurable:
- `failureThreshold`: Number of failures before opening (default: 5)
- `failureWindowMs`: Time window for tracking failures (default: 60s)
- `resetTimeoutMs`: Time before transitioning Open → Half-Open (default: 30s)
- `successThreshold`: Successful requests needed to close from Half-Open (default: 1)

### Concurrency Handling
For Half-Open state, I implemented a `halfOpenInProgress` flag to ensure only one probe request executes at a time. Concurrent requests during this state receive a `CircuitOpenError`.

### Memory Management
To prevent memory growth, I implemented automatic cleanup of expired failure records. The `cleanupOldFailures()` method removes records outside the time window.

## Implementation Steps

1. **Created TypeScript project structure** in `repository_after/`:
   - `package.json` with Jest, TypeScript, and ts-jest dependencies
   - `tsconfig.json` for TypeScript compilation
   - `jest.config.js` for test configuration

2. **Implemented core types** in `src/types.ts`:
   - `CircuitState` enum (CLOSED, OPEN, HALF_OPEN)
   - `CircuitBreakerOptions` interface
   - `CircuitOpenError` class
   - `FailureRecord` interface

3. **Implemented CircuitBreaker class** in `src/CircuitBreaker.ts`:
   - Constructor with configurable options and defaults
   - `execute<T>()` method wrapping async operations
   - `getState()` and `getFailureCount()` for introspection
   - `reset()` and `trip()` for manual control
   - Private methods for state transitions and failure tracking

4. **Created comprehensive test suite** in `tests/circuit-breaker.test.ts`:
   - 8 describe blocks matching the 8 requirements
   - Tests for state transitions, failure tracking, reset timeout
   - Tests for Half-Open concurrency protection
   - Tests for async operation wrapping
   - Tests for memory management and error preservation
   - Edge case tests for rapid requests, intermittent failures

5. **Created evaluation system** in `evaluation/evaluation.js`:
   - Runs Jest tests with JSON output
   - Parses results and generates structured report
   - Outputs formatted console summary
   - Saves JSON report with all test node IDs and statuses

6. **Configured Docker environment**:
   - Node.js 20 base image
   - Installs dependencies for both root and repository_after
   - Volume mounts for development

## Testing Strategy

I organized tests to match each requirement:
1. Support Closed, Open, and Half-Open states
2. Track failures within configurable time window
3. Open circuit after failure threshold exceeded
4. Transition correctly after reset timeout
5. Allow only one probe request in Half-Open
6. Wrap asynchronous operations transparently
7. Prevent memory growth from failure tracking
8. Preserve original errors on failure

## Validation Flow

1. Build Docker image: `docker compose build`
2. Run tests: `docker compose run --rm app npx jest --testPathPattern=tests/`
3. Run evaluation: `docker compose run --rm app node evaluation/evaluation.js`
4. Verify JSON report is generated with all test results
5. Confirm exit code 0 for successful runs

## Summary

The implementation satisfies all 8 requirements:
1. ✅ Three circuit states (CLOSED, OPEN, HALF_OPEN)
2. ✅ Configurable failure time window with expiration
3. ✅ Opens circuit when threshold exceeded
4. ✅ Correct transitions after reset timeout
5. ✅ Single probe request in Half-Open (concurrency safe)
6. ✅ Transparent async operation wrapping
7. ✅ Automatic cleanup prevents memory growth
8. ✅ Original errors preserved, CircuitOpenError when open

# Trajectory (Thinking Process for FlowGuard Implementation)

## 1. Audit the Requirements (Identify Scale & Bottlenecks)

I audited the requirements for the "Connected Fleet" firmware update. The objective was to implement `FlowGuard`, a high-perforamnce rate limiter.
Key constraints identified:

- **Scale**: 500,000 devices, thousands of concurrent sessions.
- **Bottlenecks**: Global locks (`sync.Mutex`) causing stop-the-world stalls; Unbounded maps causing OOM crashes.
- **Logic**: User consumption is a continuous fluid level (Leaky Bucket), not discrete counters.

## 2. Define a Performance Contract First

I defined the performance contracts:

- **Locking**: No single global lock. Use Sharding.
- **Memory**: No infinite growth. Use Lazy Eviction.
- **Precision**: No integer math. Use `float64` for milliliter-precise decay.

## 3. Rework the Environment for Go (Docker)

I audited the environment and switched to `golang:1.20-alpine`.

- **Reason**: The provided `python:3.11-slim` image was unsuitable for Go development.
- **Optimization**: Configured `test` and `evaluation` services to share the same Docker image to reduce build time.

## 4. Design the Data Structure (Sharded Map)

I implemented a `FlowGuard` struct containing a slice of `Shard` pointers.

- **Hashing**: Used FNV-1a to hash `userID` string to a `uint32` index, mapped to `[0..255]`.
- **Concurrency**: Each `Shard` has its own `sync.RWMutex`. This ensures that a pour request for User A (Shard 1) never blocks User B (Shard 2).

## 5. Implement Leaky Bucket with Float64

I implemented the bucket logic using `math.Max(0, old_level - elapsed * rate)`.

- **Why Float64**: Requirements specified "milliliter-precise pours". Integer truncation would allow "penny-shaving" attacks where users pour small amounts frequently to bypass the limit.

## 6. Implement Lazy Eviction (Inline Memory Management)

I implemented a passive cleanup strategy.

- **Mechanism**: If a pour request is rejected (or potentially during access) and the user's bucket is found to be effectively empty (level 0), the key is deleted from the map.
- **Result**: Stale users are removed without a heavy background GC thread, preventing memory leaks while maintaining deterministic latency.

## 7. Verification & Evaluation

I implemented a comprehensive test suite in `flowguard_test.go` and a Python evaluation hook.

- **Coverage**: Verified Shard Distribution, Leaky Bucket Arithmetic, Lazy Eviction, and Concurrency safety.
- **Result**: 100% test pass rate (4/4 scenarios) confirmed via `docker compose run evaluation`.

## 8. Result: High-Performance, Thread-Safe Library

The final `FlowGuard` implementation meets all "Principal Systems Engineer" requirements: sharded locking for concurrency, constant-time operations, and self-cleaning memory management.

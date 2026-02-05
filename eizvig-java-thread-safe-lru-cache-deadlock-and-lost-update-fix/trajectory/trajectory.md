# Trajectory: Thread-Safe LRU Cache Refactoring

> **Context**: Refactoring a buggy Java LRU Cache implementation to resolve deadlocks, race conditions, and state corruption.

## 1. Audit the Original Code (Identify Scaling Problems)
I audited the original code (`repository_before`) and found it used a flawed "split locking" strategy. It attempted to use separate locks for the `HashMap` and the `LinkedList` to improve concurrency, but this caused critical failures:
- **Deadlocks**: Threads acquired `mapLock` then `listLock` in some places, and `listLock` then `mapLock` in others.
- **Race Conditions**: `size` was updated non-atomically, leading to limits being exceeded.
- **Complexity**: The code was hard to reason about, with logic scattered across multiple synchronized blocks.

## 2. Define a Performance Contract First
I defined the correctness and performance conditions:
- **Strict Thread Safety**: The cache must support highly concurrent `get`, `put`, and `remove` operations without corruption.
- **Atomicity**: State transitions (e.g., "insert key" + "increment size" + "evict if full") must be atomic.
- **Deadlock Freedom**: Zero possibility of cycle waiting.
- **Latency Consistency**: Operations should be predictable (O(1)), bounded by the `synchronized` block contention.

## 3. Rework the Data Model for Efficiency
I simplified the concurrency model by introducing a **Single Coarse-Grained Lock**.
- Instead of managing state across two locks, all mutable state (`cache` map, `head`/`tail` pointers, `size`) is now protected by a single `Object lock`.
- This reflects the "Monitor Pattern", ensuring that at any point in time, the cache is in a valid state.

## 4. Rebuild the Method Pipeline
I rebuilt the primary methods (`get`, `put`) as fully synchronized pipelines.
- **Projection-First**: The `get` operation projects the value *and* updates the LRU position in one step.
- **Atomic Access**: Readers are treated as writers (because they mutate LRU order), preventing "check-then-act" races where a node might be evicted by another thread while being read.

## 5. Move Logic Inside the Critical Section
All logic related to capacity checking and eviction was moved inside the lock.
- **Before**: Capacity check and Eviction were loosely coupled.
- **After**: `put()` holds the lock for the entire duration of the transaction: `check capacity -> insert/update -> evict if needed`. This guarantees the `maxSize` is never exceeded.

## 6. Use Atomic Check-Then-Act
Replaced dispersed conditionals with atomic blocks.
- **Example**: `if (map.size() >= maxSize)` is now checked *while holding the lock*, ensuring that no other thread can insert an item in between the check and the insertion.

## 7. Stable Ordering (+ Thread Safety)
I implemented stable LRU ordering.
- Because `get()` requires mutating the linked list (moving node to head), strictly synchronizing it ensures the list structure never breaks (e.g., circular references or detached nodes) even under heavy load.

## 8. Eliminate Race Conditions (N+1 Issues)
I eliminated race conditions that acted like "N+1" bugs (where one operation spawned multiple inconsistent state updates).
- By unifying the lock, we ensure that a single `put` results in exactly one set of updates to the map, list, and size counter, preventing "lost updates".

## 9. Normalize Lock Acquisition
Standardized lock acquisition to a single `private final Object lock`.
- This normalization prevents external classes from locking on `this` (the LRU Cache instance itself), avoiding potential deadlocks with external code integration.

## 10. Result: Measurable Correctness + Predictable Signals
The solution passed rigorous stress testing:
- **Concurrency**: Handled 50 concurrent threads executing 2000 operations each.
- **Correctness**: Zero data corruption or size drift.
- **Stability**: Zero deadlocks detected in the dedicated deadlock verification test.

---

# Trajectory Transferability Notes

The above trajectory is designed for **Concurrency Refactoring**. The steps outlined represent reusable thinking nodes (Audit -> Contract -> Model -> Execution -> Verification).

### Refactoring → Concurrency Fix
- **Audit**: Detect race conditions, visibility issues, and deadlock potential.
- **Contract**: Define atomicity and ordering guarantees.
- **Model**: Simplify locking strategy (Coarse vs Fine-grained or Lock-free).
- **Pipeline**: Ensure all state mutations happens within the critical section.
- **Verification**: Stress tests with `CountDownLatch` and `ExecutorService`.

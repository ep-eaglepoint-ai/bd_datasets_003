# Trajectory: Verifying a Lock-Free Ring Buffer Under High Contention

## The Problem: “Lock-free, linearizable, allocation-free” claims

The Core Infrastructure team shipped a `LockFreeRingBuffer` intended to replace Go channels in a hot path. The stated expectations were:

- Thread safety in an MPMC (multi-producer, multi-consumer) setting
- Linearizable behavior and strong data integrity (no loss, no duplicates)
- Proper backpressure handling when the buffer saturates
- A harness that can actually detect subtle concurrency defects (race/memory ordering/ABA-style issues), without using `time.Sleep` for synchronization
- A meta-test that proves the test suite will fail for an intentionally buggy implementation

The test suite had to be strict enough that naïve or partial implementations cannot pass.

## The Approach: A balance-sheet + liveness harness

I designed the primary test suite around two complementary checks:

1. **Deterministic sequential correctness**
   - Establish a crisp baseline: FIFO, full/empty return values, no ambiguity.

2. **High-concurrency integrity with a “balance sheet”**
   - Producers push a deterministic set of integers.
   - Consumers pop until the total expected count is reached.
   - Every value is tracked using a thread-safe structure so we can assert:
     - Each pushed value is popped exactly once (no drops, no duplicates).
     - No out-of-range or corrupted values appear.
   - A saturation counter is maintained to prove the queue actually hits the “full” boundary under load.

To avoid test-induced races, all counters and per-value tracking are done with atomics.

## Implementation Steps

### 1) TestSequentialBasics
- Create a small ring buffer (size 4) and push values 1..4.
- Assert a 5th push returns `false` (full).
- Pop all values and assert FIFO ordering 1..4.
- Assert an extra pop returns `(0, false)` (empty).

This test validates the fundamental contract in a deterministic, single-threaded environment.

### 2) TestConcurrentIntegrity / runConcurrentIntegrity harness
- Use **N=10 producers** and **M=10 consumers**, meeting the `>= 10` requirement.
- Each producer pushes a unique contiguous range to create a deterministic universe:
  - `val = producerID*perProducerOps + i`
- Ensure at least **1,000,000** pushes total:
  - `perProducerOps = 100_000` → `10 * 100_000 = 1_000_000`
- Backpressure is handled by design:
  - If `Push` returns `false`, producers increment `saturationCount`, call `runtime.Gosched()`, and retry until success.
- Consumers are designed to be non-blocking and contention-heavy:
  - If `Pop` returns `false`, they yield and retry.
- Balance sheet:
  - `seen := make([]atomic.Uint32, total)`
  - Each popped value increments `seen[v]`
  - After the run, assert `seen[i] == 1` for all expected values.

Liveness/hang detection:
- The harness uses a timeout only as a deadlock/livelock detector (not as a synchronization primitive).

Saturation proof:
- Assert `saturationCount > 0` to confirm the full boundary condition was exercised.

### 3) Meta-test: prove the suite fails for a buggy implementation
A black-box meta-test (`TestHarness_Detects_DataLoss`) demonstrates that the integrity harness catches real defects by:

- Copying `repository_after` to a temporary directory
- Overwriting the ring buffer implementation in that temporary copy with an intentionally buggy “drop writes” implementation
- Running `go test` in that temporary directory
- Asserting the run fails

The buggy implementation is stored under `tests` as a `.go` file guarded by a build tag so it is not compiled during normal `go test ./tests` runs.

## Why these testing choices

### Why a balance-sheet (set equality) instead of checking “counts match”
Matching totals is too weak. A buggy implementation can:

- Drop some values and duplicate others while keeping the total counts equal.
- Reorder values or corrupt values without changing counts.

The per-value `seen[v] == 1` property is strict: it enforces “exactly once” for every element in the pushed universe.

### Why a timeout is still needed without `time.Sleep`
The specification disallows using `time.Sleep` for synchronization, which the suite avoids. However, a liveness detector is still necessary: if the SUT stalls, the test must fail rather than hang indefinitely. The timeout exists as a safety valve for deadlock/livelock detection, not as a coordination mechanism.

### Why atomics in the harness
To be compatible with `go test -race`, the harness itself must not contain races. All shared tracking (`pushedCount`, `poppedCount`, `saturationCount`, `seen[]`) uses atomic operations so any race warning is attributable to the SUT, not the tests.

### Why assert saturationCount > 0
A concurrency test that never fills the buffer can accidentally miss the most failure-prone state transitions. Forcing saturation (smallish buffer, high contention) and asserting it occurred ensures boundary conditions are tested.

## Result Observations (what the suite concludes)
Under the current implementation, `TestSequentialBasics` passes, while the high-contention liveness/integrity test can time out. Per the spec, that is a valid outcome: the suite is designed to *prove or disprove* the claimed properties, and a timeout indicates a liveness failure under load.

## Resources
- Go Memory Model:
  - https://go.dev/ref/mem
- `sync/atomic` package docs:
  - https://pkg.go.dev/sync/atomic
- Guidance on writing race-detector-friendly tests:
  - https://go.dev/doc/articles/race_detector
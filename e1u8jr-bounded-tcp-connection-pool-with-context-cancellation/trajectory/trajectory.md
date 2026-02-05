# Trajectory: Bounded TCP Connection Pool with Context Cancellation

## Initial Understanding & Analysis

When I first encountered the requirement to implement a generic, thread-safe TCP connection pool without relying on `database/sql` or external libraries, I immediately recognized the core constraints: strict resource management and robust concurrency control. The mention of "generic" meant relying on the `net.Conn` interface, while "MaxConn" established this as a classic semaphore/bounded-resource problem.

Reflecting on the specific challenge of "Context-Aware Blocking," I realized that a simple `sync.Mutex` or `sync.Cond` would be insufficient on its own. `sync.Cond` is notoriously difficult to combine with `context.Context` cancellation because `Wait()` cannot be interrupted. This led me to identify the primary explicit requirements:

1.  **Hard Resource Limit**: Never open more than `MaxConn` sockets.
2.  **Blocking with Timeout**: If the pool is full, callers wait, but must respect their context deadlines.
3.  **Idle Management**: Stale connections must be pruned (MaxIdleTime).

Then I looked for the implicit and nested requirements. The most critical one flagged in the prompt was the **"Ghost Grant" race condition**. I analyzed this scenario: if a goroutine waits for a connection, times out, and _then_ the pool releases a connection to it, that connection is effectively mistakenly assigned to a dead request. If the code simply ignores this, the connection leaks—it's counted as "active" but no one holds it. This meant my synchronization logic had to be tightly coupled with cleanup procedures.

### Reaching Implementation Decisions

I weighed two main approaches for synchronization:

- **Approach A: `sync.Cond`**. Pros: Efficient memory usage. Cons: Wakes all waiters (Thundering Herd) or requires complex signaling; hard to handle cancellation cleanly.
- **Approach B: Channels**. Pros: Built-in blocking and `select` support for Contexts. Cons: Channel management overhead.

I decided on **Approach B** but with a twist: I would maintain an explicit slice of waiting channels (`[]chan net.Conn`) protected by a mutex. This allows me to implement a FIFO queue (fairness) and, crucially, allows the `Put` operation to target a _specific_ waiter. Using a buffered channel for the handshake avoids blocking the `Put` operation if the receiver is slow or in the process of cancelling, solving the resource leak risk inherent in unbuffered communications during cancellation races.

## Implementation & Testing Strategy

### Deciding What to Test

My testing strategy was driven by risk analysis. The highest risk areas were:

1.  **Concurrency Safety**: Go's race detector covers memory access, but logical races (like exceeding MaxConn) requires atomic counting in high-stress tests.
2.  **The "Ghost Grant"**: This is a specific semantic race. I needed a test that forced timeouts while connections were cycling to ensure the pool didn't "lose" capacity.
3.  **Staleness**: Verifying `MaxIdleTime` required mocking time or using short durations.

### Translating Requirements to Tests

I started by establishing a baseline correctness test, `TestGetPutBasic`, to verify the happy path: getting a connection, using it, and returning it.

For the **MaxConn** requirement, I wrote `TestMaxConnBlocking`. The logic was simple: fill the pool to capacity (N), try to get N+1, and assert that it blocks. I used a separate goroutine and a `select` with a timeout to verify the "blocking" property.

The most challenging implementation detail was the **Ghost Grant**. To test this, I simulated a scenario in [TestGhostGrant](tests/pool_test.go) where multiple clients request connections with very short timeouts. The passing criteria was that even after many timeouts, the pool's internal state (`ActiveCount`) must return to zero (or the number of actual holding clients) once the dust settles. If a "Ghost Grant" occurred, the active count would remain permanently elevated, eventually starving the pool.

### Handling Edge Cases

I considered the case where a user manually creates a connection and calls `Put` when the pool is full. While the prompt mentioned we usually assume `Put` comes from `Get`, a robust system shouldn't panic or leak. I added `TestPutOverflow` to verify that the pool strictly rejects or closes extra connections rather than bloating its internal storage.

## Iterative Refinement

My understanding evolved significantly while writing the `Get` method in [repository_after/main.go](repository_after/main.go).

Initially, I thought about simply removing a waiter from the queue when `ctx.Done()` fires. However, I realized a race condition existed: what if `Put` grabs the waiter from the queue _just before_ the waiter grabs the lock to remove itself?

- _Assumption_: Provided `Put` removes the waiter, the waiter logic is safe.
- _Correction_: If `Put` sends on the channel, and the waiter has already entered the `case <-ctx.Done():` block, the token sits in the buffered channel. The waiter returns error, but the token is orphaned.

To fix this, I refined the cancellation logic: if the waiter successfully cancels (by removing itself), fine. But if it discovers it was _already_ removed, or if the token arrives after cancellation, it must perform a "cleanup receive" on the channel and `Put` the connection back immediately. This ensures that even if the handover crosses wires with the cancellation, the resource is recycled.

## Final Reflection

I evaluated the robustness of the solution by running the `TestHighConcurrency` suite. This test spawns 50 goroutines against a pool size of 5, mixing successful acquisitions with random timeouts. The use of `atomic` counters to verify that we never exceeded `MaxConn` gave me high confidence.

The tests proved that strict adherence to the buffer-size-1 channel pattern combined with the "check-and-return" cleanup strategy effectively nullified the Ghost Grant risk. The solution is strictly compliant with the constraint of using only standard libraries, relying on the composability of `sync.Mutex` and Go channels to solve a complex resource management problem.

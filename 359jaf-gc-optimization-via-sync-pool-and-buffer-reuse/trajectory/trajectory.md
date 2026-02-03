# Trajectory: Optimize RTB Serialization via Object Pooling with `sync.Pool`

## The Problem: "Stop-the-World" Latency

In a high-frequency AdTech exchange (100k QPS), functional correctness isn’t enough—**stability** is critical.

The original implementation of `SerializeBidResponse` was correct but memory-intensive. Every bid created a new `bytes.Buffer` and an internal byte slice. At 100k requests per second, this generates millions of short-lived heap objects.

When the Garbage Collector (GC) runs, it triggers **Stop-the-World** pauses. In an RTB environment with a 100ms SLA, a 50ms GC pause causes bid timeouts—and revenue loss.

## Analogy: Disposable Paper Plates

* **Creation:** Each bid gets a fresh plate (`new(bytes.Buffer)`).
* **Usage:** Data is put on it.
* **Disposal:** Plate is discarded immediately.

At high volume, the GC—the janitor—must stop the world to sort through millions of plates, scan which are still in use, and sweep the rest. This overhead directly impacts latency and throughput.

**The result**: CPU spends 25% of its time cleaning instead of bidding, and those "Stop-The-World" pauses create massive spikes in latency (the 50ms+ jitter you're seeing).

## The Solution: The `sync.Pool` Pattern

Instead of "Buy, Use, Throw Away," we move to a "Library" model using `sync.Pool`.

1. **The Reservoir:** We create a pool of pre-allocated `bytes.Buffers`.
2. **Borrowing:** When a request comes in, we `Get()` a buffer from the pool. If one is available, we use it. If not, the pool creates one for us.
3. **Returning:** Once the serialization is done, we `Reset()` the buffer (to clear the data but keep the memory capacity) and `Put()` it back into the pool for the next request.

## Implementation Steps

1. **Smart Initialization:** We initialize the pool with a `New` function that pre-allocates a capacity of 1024 bytes. This prevents the buffer from having to grow (re-allocate) during the first few writes.
2. **The Defer Safety Net:** We use `defer` to ensure that even if the JSON encoder fails, the buffer is always scrubbed and returned to the pool. This prevents memory leaks.
3. **Sanitization:** The call to `buf.Reset()` is critical. Without it, the next user might see the Ad Markup from a previous bid (Data Leakage).

## Why I did it this way (Refinement)

Initially, I considered pooling the `json.Encoder` as well to reach absolute zero allocations.

* **Correction:** I decided to focus on the `bytes.Buffer` first. In Go, the buffer is the "heavy" part of the allocation. Modern Go compilers are often able to optimize the `Encoder` struct onto the **Stack** (zero cost) if the buffer it uses is already provided. As seen in our benchmarks, pooling just the buffer was enough to reach **0- 1 allocs/op**.

## Testing & Validation

To prove this worked, we didn't just look at the code; we looked at the telemetry:

* **Benchmarkmem:** We ran benchmarks to confirm the drop from ~2–4 allocations per operation down to 0 to 1.
* **Race Detector:** Since `sync.Pool` is used across multiple threads (goroutines), we used the `-race` flag to ensure our "Borrow/Return" logic didn't have any thread-safety bugs that could corrupt bid data under load.

---

### Recommended Resources

**1. Watch: sync.Pool in Go Explained & Avoid The Heap Allocation Mistake**
A deep dive into how `sync.Pool` works under the hood to manage memory for high-load systems.

* [YouTube: sync.Pool in Go Explained & Avoid The Heap Allocation Mistake](https://www.youtube.com/watch?v=fwHok9ZhQaY)

**2. Watch: Advancing Go Garbage Collection with Green Tea**
A visual explanation of *why* allocations cause latency and how the GC handles heap pressure.

* [YouTube: Advancing Go Garbage Collection with Green Tea](https://www.youtube.com/watch?v=gPJkM95KpKo)

**3. Read: Go sync.Pool and the Mechanics Behind It**
A deep-dive into how sync.Pool operates in go

* [Article: Go sync.Pool and the Mechanics Behind It](https://victoriametrics.com/blog/go-sync-pool/)
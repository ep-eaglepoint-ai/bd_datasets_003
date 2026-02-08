Trajectory: Building a High-Performance Weather Cache Proxy
We need to create a robust, in-memory caching layer that sits between thousands of concurrent drones and an expensive, rate-limited Weather API. We have to optimize coordinate lookups (spatial binning), prevent redundant network calls during high traffic (request coalescing), and manage data freshness (TTL), all using standard Python asynchronous libraries.

**Precision:** How do we handle thousands of drones at slightly different coordinates (e.g., 10.12° vs 10.19°) effectively?
**Efficiency:** How do we ensure that 50 simultaneous requests for the same area result in only **one** API call?
**Resilience:** How do we propagate errors to all waiting drones if the upstream API fails?

### The Solution: Grid Snapping & The Singleflight Pattern

We will use `asyncio` to manage concurrency and standard math for spatial optimization.

* **Grid Snapping:** We will round raw coordinates to the nearest 0.1 degree. This "snaps" drones within ~11km of each other into the same logical bucket, increasing cache hit rates.
* **Request Coalescing:** We will use `asyncio.Future` to implement the "Singleflight" pattern. If a fetch is already in progress for a bucket, subsequent requests will "subscribe" to the pending result rather than triggering a new call.
* **TTL Management:** We will store a timestamp with every cache entry. If data is older than 60 seconds, we treat it as a miss and trigger a refresh.

### Implementation Steps

1. **Define the Schema:** Create a `CacheEntry` dataclass to hold the temperature value and the time it was fetched.
2. **The Bucket Logic:** Implement a helper method `_get_grid_key(lat, lon)` that rounds coordinates to 1 decimal place using `math` or built-in rounding.
3. **The Waiting Room:** Implement `get_temperature`. It first checks the cache. If missing, it checks `self._inflight` (a dictionary of pending Futures).
* If a Future exists, `await` it.
* If not, create a new Future, call the API, and populate the result for all waiters.


4. **Error Handling:** Ensure that if the API call fails, the exception is set on the Future so all waiting tasks raise the error appropriately.

### Why I did it this way (Refinement)

I initially considered using `asyncio.Lock` to handle the concurrency.

**Correction:** I chose `asyncio.Future` instead. A `Lock` is mutually exclusive—it would force the 49 other drones to wait until the first one finishes, and then they might try to fetch data themselves (serially). A `Future` acts as a broadcast mechanism: one task does the work, and the result is instantly available to all 50 waiting tasks simultaneously once it completes.

### Testing Strategy

We will use an `asyncio.run(main())` block to execute specific scenarios:

* **Grid Test:** Query (10.01, 10.01) and (10.04, 10.04). Verify the internal fetch counter is 1.
* **Concurrency Test:** Spawn 100 simultaneous tasks for the same bucket. Verify the upstream API is called exactly once.
* **Independence Test:** Spawn tasks for Bucket A and Bucket B. Verify the API is called twice.

### 📚 Recommended Resources

**1. Read: Asyncio Futures**
Understanding how to use Futures as a bridge between a producer (the API caller) and consumers (the waiting drones).
[Python Docs: Awaitables](https://www.google.com/search?q=https://docs.python.org/3/library/asyncio-task.html%23awaitables)

**2. Read: The Thundering Herd Problem**
A conceptual overview of why caching systems fail under high concurrency and how coalescing fixes it.
[Wikipedia: Thundering Herd](https://en.wikipedia.org/wiki/Thundering_herd_problem)

**3. Read: Geospatial Binning**
Simple techniques for discretizing continuous coordinate data into manageable buckets.

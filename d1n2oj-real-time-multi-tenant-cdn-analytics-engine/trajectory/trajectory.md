
# Trajectory: Real-Time Multi-Tenant CDN Analytics Engine

We need to build a high-performance, backend-only telemetry system in Go that ingests, enriches, aggregates, and persists CDN logs. The system must handle 8,000+ events per second on constrained hardware (2 CPUs, 4GB RAM) while ensuring data integrity and tenant isolation.

### Core Architecture: The "Funnel & Flush" Pattern

To meet the strict hardware constraints and high throughput requirements, we will architect a pipeline that decouples ingestion from processing using **buffered channels** and **worker pools**.

1. **Ingestion Layer (The Funnel):** A lightweight HTTP server (using `net/http` or `Gin`) that accepts JSON payloads. It performs immediate validation (Tenant ID check) and pushes valid logs into a buffered channel. If the channel is >90% full, it immediately returns `429 Too Many Requests` (Backpressure).
2. **Processing Layer (The Workers):** A fixed pool of Go routines (workers) reads from the ingestion channel.
* **Enrichment:** Each worker looks up the IP in a shared, thread-safe MaxMind MMDB reader to get City/Country.
* **Aggregation:** The worker updates an in-memory "Sliding Window" structure (using atomic counters or a sharded mutex map) to track stats per customer per minute.
* **Buffering:** The worker pushes the enriched log into a "Batch Accumulator."


3. **Persistence Layer (The Flusher):** A dedicated routine monitors the Batch Accumulator. It triggers a bulk insert to ClickHouse when:
* The buffer hits 5,000 records.
* **OR** 10 seconds have passed since the last flush.



### Data Structures & Schema

**1. ClickHouse Schema (`ReplacingMergeTree`)**
We will use `ReplacingMergeTree` to handle potential duplicate log entries (e.g., retries from the CDN edge).

* **Partition Key:** `toYYYYMMDD(timestamp)` (Daily partitions for easy data management).
* **Sorting Key:** `(customer_id, timestamp, url)` (Optimized for retrieving metrics by customer).
* **Columns:** `timestamp`, `customer_id`, `ip_address`, `city`, `country`, `status_code`, `bytes_sent`, `user_agent`.

**2. In-Memory Aggregator**
To track live metrics without querying the DB constantly, we will implement a **Sharded Map** or a **Ring Buffer** in memory.

* **Key:** `CustomerID + TimeBucket (minute)`
* **Value:** Struct containing `TotalRequests`, `BytesTotal`, `Status2xx`, `Status5xx`, etc.
* **Locking:** Use `sync.RWMutex` on shards to minimize contention on the 2 CPUs.

### Implementation Plan

**Phase 1: Foundation & Persistence**

* **Step 1:** Define the `LogEntry` struct and the ClickHouse table DDL.
* **Step 2:** Implement the ClickHouse client with the official driver (`clickhouse-go`). Tune connection settings (SetMaxOpenConns to ~10-20 to match CPU count).
* **Step 3:** Implement the `BatchFlusher`. It should accept logs, hold them, and flush on count/timer.

**Phase 2: The Processing Pipeline**

* **Step 4:** Implement the GeoIP Service. Load the `.mmdb` file once. Use a read-lock or a pool of readers if the library requires it (though `oschwald/geoip2-golang` is generally thread-safe).
* **Step 5:** Create the Worker Pool. Spawn `runtime.NumCPU() * 2` workers.
* **Step 6:** Wire up the channels. Connect the Ingestion API -> Channel -> Workers -> BatchFlusher.

**Phase 3: Aggregation & API**

* **Step 7:** Implement the Sliding Window Aggregator. Ensure old windows (older than 15 mins) are garbage collected to prevent memory leaks.
* **Step 8:** Build the `/api/v1/metrics/:customer_id` endpoint. It should query ClickHouse for historical data (or the in-memory aggregator for *live* data, depending on strictness). For the requirement "last 15 minutes," querying ClickHouse is safer for consistency if the batch flush rate is fast enough.

**Phase 4: Safety & Optimization**

* **Step 9:** Implement Backpressure. Check `len(channel)` vs `cap(channel)` at the HTTP handler level.
* **Step 10:** Add Tenant Validation. A simple mock map `map[string]bool` to reject invalid `Customer-ID` headers.

### Testing Strategy

**1. Unit Tests**

* **GeoIP:** Mock the DB reader to verify correct City/Country extraction.
* **Aggregator:** Feed known log sequences and assert the counters match (e.g., 50x 200 OKs results in `status_2xx: 50`).
* **Buffer Logic:** Push 4,999 logs and ensure no flush. Push 1 more and ensure flush happens. Wait 11 seconds and ensure flush happens.

**2. Integration / Performance Test (The 8k/sec Challenge)**

* **Generator:** A separate Go script that spawns multiple goroutines sending HTTP POST requests.
* **Validation:**
* Start the system.
* Blast 8,000 req/s for 5 minutes (Total ~2.4 million logs).
* Query ClickHouse: `SELECT count(*) FROM cdn_logs`. It must match the sent count exactly (or within 99.9%).
* **Monitor:** Use `pprof` to ensure RAM stays flat (< 512MB) and Goroutines don't leak.



### 📚 Recommended Resources

1. **Read: ClickHouse Schema Design**
* Understanding `ReplacingMergeTree` and primary keys for fast filtering.


2. **Read: Go Concurrency Patterns (Pipelines)**
* [Go Blog: Pipelines and cancellation](https://go.dev/blog/pipelines) - Essential for building the worker pool.


3. **Read: Buffered Channels & Backpressure**
* Understanding how to drop requests gracefully when the system is overloaded.
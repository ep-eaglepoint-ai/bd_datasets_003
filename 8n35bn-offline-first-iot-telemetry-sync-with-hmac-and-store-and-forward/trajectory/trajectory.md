# Trajectory: Offline-First IoT Telemetry Sync with HMAC and Store-and-Forward

## 1. Problem Statement

Based on the prompt, I identified the core engineering challenge as **reliable synchronization of continuous data streams over an unreliable transport layer without data loss or duplication**. 

The problem required me to build two Node.js components for AquaSmart's water refill stations:
- A **Headless Station Controller (Client)** running on IoT hardware
- A **Cloud Ingestion API (Server)**

The fundamental difficulties were:
- **Data Loss Prevention**: Events generated every 100ms must survive power failures (device restarts)
- **Network Reliability**: Intermittent connectivity in subway terminals and basements
- **Exactly-Once Delivery**: The "Two Generals' Problem" - server might process data but network drops the ACK, causing client to re-send and potentially double-count
- **Security**: Authenticating payloads in a hostile physical environment where someone could tamper with the device

I recognized that naive implementations using in-memory arrays (`const buffer = []`) would fail because:
1. Data is lost on power cycle
2. Memory exhaustion during extended network outages
3. No deduplication mechanism for re-sent batches

## 2. Requirements

Based on the prompt, I identified these mandatory requirements:

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | **Persistent Write-Ahead Log (WAL)** | Client must write events to disk/file/DB before sending - in-memory arrays only = automatic fail |
| 2 | **Batching** | Client must aggregate multiple events into single HTTP request - no 10 requests per second for 10 events |
| 3 | **HMAC Signing** | Client must generate X-Signature header using `crypto.createHmac`, Server must verify using `crypto.timingSafeEqual` |
| 4 | **Idempotency** | Server must track processed Event IDs (Set or DB) - same batch twice = success but zero inserts |
| 5 | **Non-blocking Sensor** | Sensor simulation must not be blocked by network synchronization loop |
| 6 | **Volume Accuracy** | Server total volume must match client generated volume even after network failures |
| 7 | **Replay Protection (Optional)** | HMAC should include timestamp to prevent replay attacks |
| 8 | **Graceful Error Handling** | Client must handle ECONNRESET or 500 errors without crashing |
| 9 | **Concurrent File Safety** | If using fs, must handle simultaneous reads/writes safely |

## 3. Constraints

Based on the prompt, I identified these constraints:

- **Forbidden Libraries**: Cannot use RabbitMQ, MQTT clients, or high-level message queue libraries
- **Standard Node.js Only**: Must implement buffering, batching, HTTP retry logic, and HMAC signing using standard libraries (`fs`, `crypto`, `http`, `sqlite3`)
- **Environment**: Intermittent network connectivity (subway terminals, basements)
- **Hardware**: IoT device with limited resources - must be lightweight

## 4. Research and Resources

### 4.1 Node.js SQLite for WAL Implementation
I researched using SQLite3 as the WAL solution because:
- **Persistence**: Survives power cycles unlike in-memory solutions
- **ACID Compliance**: Ensures data integrity during writes
- **Single File**: Simple deployment on embedded devices
- **Query Capability**: Can query unsent events efficiently with SQL

### 4.2 HMAC Implementation Patterns
I studied proper HMAC implementation patterns:
- **Timing-Safe Comparison**: Using `crypto.timingSafeEqual` to prevent timing attacks
- **Timestamp Inclusion**: Adding timestamp to payload to prevent replay attacks
- **Secret Key Management**: Storing HMAC secret in environment variables

### 4.3 Exponential Backoff Strategies
I researched retry strategies for unreliable networks:
- **Progressive Delay**: Doubling delay between retries (100ms → 200ms → 400ms...)
- **Maximum Cap**: Capping backoff to prevent indefinite waiting (e.g., 30 seconds max)
- **Jitter**: Adding randomness to prevent thundering herd (though not implemented here for simplicity)

### 4.4 Idempotency Patterns
I studied deduplication strategies:
- **Event UUIDs**: Each event has a unique ID
- **Server-Side Set**: Tracking processed IDs in a Set or DB
- **INSERT OR IGNORE**: SQL pattern to skip duplicates

## 5. Choosing Methods and Why

### 5.1 SQLite3 over Raw File System
I chose SQLite3 for the Write-Ahead Log because:
- **Requirement 9 (Concurrent Safety)**: SQLite handles simultaneous read/write operations internally, unlike raw file operations that would require implementing file locks manually
- **Query Flexibility**: Can efficiently query "unsent events ordered by timestamp LIMIT 50"
- **Data Integrity**: SQLite's ACID properties ensure no partial writes during power failure
- **Memory Efficiency**: Only loads needed data into memory, unlike in-memory arrays

### 5.2 Separate Sensor Loop and Sync Loop
I implemented two independent loops because:
- **Requirement 5 (Non-blocking)**: Sensor generates data every 100ms, sync might take seconds during network issues
- **Fire-and-Forget Append**: Sensor calls `wal.appendEvent()` asynchronously and continues immediately
- **Independent Timing**: Sensor interval is fixed at 100ms, sync interval varies based on backoff

### 5.3 HMAC with Timestamp for Replay Protection
I included timestamp in HMAC because:
- **Requirement 7 (Optional but Good Practice)**: Prevents replay attacks where someone captures and re-sending the same request
- **5-Minute Window**: Server rejects requests with timestamps older than 5 minutes
- **Time-Based Signing**: Signature is `HMAC(secret, timestamp + body)`, so even if intercepted, it expires

### 5.4 Exponential Backoff with Reset
I implemented exponential backoff with reset on success because:
- **Network Reliability**: Intermittent networks need progressive waiting
- **Recovery Detection**: Fast retry when network comes back (reset to base 500ms after success)
- **Maximum Cap**: 30-second cap prevents indefinite waiting during extended outages

### 5.5 Idempotency with INSERT OR IGNORE
I chose this approach because:
- **Requirement 4 (Idempotency)**: Handles re-sent batches gracefully
- **Atomic Operation**: SQL `INSERT OR IGNORE` is atomic, no race conditions
- **Efficient Deduplication**: Server checks existing IDs before inserting

## 6. Solution Implementation and Explanation

### 6.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Station Controller (Client)                   │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Sensor     │───▶│     WAL      │───▶│    Sync      │      │
│  │   (100ms)    │    │  (SQLite)    │    │   (Async)    │      │
│  └──────────────┘    └──────────────┘    └──────┬───────┘      │
│                                                  │              │
└──────────────────────────────────────────────────┼──────────────┘
                                                   │ HTTP POST
                                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cloud Ingestion API (Server)                 │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  HMAC Verify │───▶│  Deduplicate │───▶│   Store to   │      │
│  │   (Timing)   │    │  (Set/DB)    │    │    DB/SQL    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Client Implementation

#### 6.2.1 Write-Ahead Log (wal.js)
I implemented the WAL with these functions:
- **`appendEvent(event)`**: Inserts new event with `sent=0` flag
- **`getNextBatch(limit)`**: Queries unsent events ordered by timestamp
- **`markEventsSent(ids)`**: Updates `sent=1` for successfully transmitted events
- **`getTotalGeneratedVolume()`**: Helper for testing to verify totals match

#### 6.2.2 Sensor Loop (sensor.js)
I implemented the sensor with:
- **100ms Interval**: Generates volume events using `setInterval`
- **UUID Generation**: Each event gets a unique `id` using `uuid` package
- **Fire-and-Forget**: `wal.appendEvent()` is called without await, so sensor is never blocked
- **Error Handling**: Errors during append are logged but don't crash the sensor

#### 6.2.3 Sync Loop (sync.js)
I implemented the sync loop with:
- **Batch Size (50)**: Fetches 50 events at a time from WAL
- **HMAC Signing**: Creates `timestamp:body` signature using `crypto.createHmac`
- **Exponential Backoff**: Starts at 500ms, doubles on failure, caps at 30 seconds
- **Graceful Errors**: Catches all errors (ECONNRESET, 500, etc.) without crashing
- **Success Reset**: After successful transmission, resets backoff to base interval

### 6.3 Server Implementation

#### 6.3.1 HMAC Verification Middleware (app.js)
I implemented verification with:
- **Timestamp Check**: Rejects requests older than 5 minutes (replay protection)
- **Signature Recalculation**: Computes expected HMAC and compares using `timingSafeEqual`
- **Secure Comparison**: `timingSafeEqual` prevents timing attacks on signature verification

#### 6.3.2 Event Recording (db.js)
I implemented idempotent recording with:
- **Transaction**: All inserts happen in a single transaction
- **Deduplication Check**: Queries existing IDs before inserting
- **INSERT OR IGNORE**: SQL pattern that skips duplicates
- **Volume Aggregation**: Updates total volume only for new events

## 7. How Solution Handles Constraints, Requirements, and Edge Cases

### 7.1 Handling Requirements

| Requirement | How Handled |
|-------------|-------------|
| **R1: Persistent WAL** | SQLite3 stores events on disk, survives power cycles |
| **R2: Batching** | `getNextBatch(limit)` fetches 50 events, sends in single HTTP POST |
| **R3: HMAC Signing** | Client: `crypto.createHmac('sha256', secret)`, Server: `crypto.timingSafeEqual` |
| **R4: Idempotency** | Server checks `processed_events` table, uses `INSERT OR IGNORE` |
| **R5: Non-blocking Sensor** | Sensor uses fire-and-forget append, never awaits WAL operations |
| **R6: Volume Accuracy** | Both client and server track volumes; duplicate events don't increment volume |
| **R7: Replay Protection** | Timestamp included in HMAC, 5-minute expiry window |
| **R8: Graceful Errors** | All sync errors caught, logged, and retried with backoff |
| **R9: Concurrent Safety** | SQLite handles concurrent reads/writes internally |

### 7.2 Handling Edge Cases

#### 7.2.1 Network Failure During Transmission
- **What happens**: Sync loop catches error, doubles backoff delay
- **Data safety**: Events remain in WAL with `sent=0`
- **Recovery**: When network returns, sync resumes from where it left off

#### 7.2.2 Device Power Cycle
- **What happens**: SQLite WAL persists on disk
- **Data safety**: All events with `sent=0` survive restart
- **Recovery**: After reboot, sync resumes automatically

#### 7.2.3 Server Receives Duplicate Batch
- **What happens**: Server checks `processed_events` for existing IDs
- **Data safety**: `INSERT OR IGNORE` skips duplicates
- **Response**: Returns 200 OK with `insertedCount: 0` for duplicates
- **Volume**: No volume added for duplicate events

#### 7.2.4 ACK Lost but Batch Processed (Two Generals Problem)
- **What happens**: Server processed events, but network dropped response
- **Client behavior**: Client thinks failed, re-sends same batch
- **Server behavior**: Detects duplicate IDs, returns success without double-counting
- **Result**: Data integrity maintained, volume not inflated

#### 7.2.5 Very Large Volume of Events (Extended Outage)
- **What happens**: Events accumulate in SQLite
- **Resource management**: SQLite grows file size, but client memory stays low
- **Batching**: Sync sends 50 at a time, never loads all into memory

#### 7.2.6 Malformed HMAC or Tampered Data
- **What happens**: Server rejects in HMAC middleware
- **Security**: Invalid signature returns 401 Unauthorized
- **Timing attack protection**: Uses `timingSafeEqual` for comparison

### 7.3 Security Considerations

1. **HMAC Secret**: Stored in environment variable (`process.env.HMAC_SECRET`), never logged
2. **Timing-Safe Comparison**: Prevents timing attacks on signature verification
3. **Replay Protection**: 5-minute timestamp window prevents captured requests from being replayed
4. **Input Validation**: Server validates payload structure before processing

### 7.4 Testing Verification Points

The solution ensures:
- Client-generated volume = Server recorded volume
- Duplicate batches don't increase volume
- Events survive power cycles
- Network failures don't cause data loss
- HMAC verification rejects invalid signatures
- Non-2xx responses trigger retry with backoff

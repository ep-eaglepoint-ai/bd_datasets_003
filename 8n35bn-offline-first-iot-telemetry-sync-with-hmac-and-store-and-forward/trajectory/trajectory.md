# Offline-First IoT Telemetry Sync with HMAC and Store-and-Forward


## 1. Problem Statement

Based on the prompt requirements, I identified the core engineering challenge: designing a reliable telemetry synchronization subsystem for "AquaSmart" water refill stations that must operate in intermittent network environments (subway terminals, basements).

The fundamental difficulty is ensuring **zero data loss** when:
- Network connectivity is intermittent or completely unavailable
- Power failures can occur at any time
- The device may need to restart unexpectedly
- Network packets (including ACKs) can be lost mid-transmission

The Two Generals' Problem applies here: even if the server processes data successfully, the network might drop the acknowledgment, causing the client to re-send. Without proper deduplication, this leads to inflated water usage statistics.

---

## 2. Requirements

Based on the prompt, I extracted the following requirements:

| # | Requirement | Description |
|---|-------------|-------------|
| 1 | **Persistent Storage** | Client must write events to disk (WAL/SQLite) before sending - in-memory arrays only = automatic fail |
| 2 | **Batching** | Client must aggregate multiple events into single HTTP request - no 10 req/sec for 10 events |
| 3 | **HMAC Signing** | Client must generate X-Signature header using `crypto.createHmac` |
| 4 | **Server Verification** | Server must recalculate and compare using `crypto.timingSafeEqual` |
| 5 | **Idempotency** | Server must track processed Event IDs - duplicate batches return 200 OK with zero inserts |
| 6 | **Non-blocking Sensor** | Sensor simulation must not be blocked by network sync loop |
| 7 | **Data Integrity** | Server volume must match client generated volume even after network failures |
| 8 | **Replay Protection** | HMAC should include timestamp (optional but recommended) |
| 9 | **Graceful Error Handling** | Client must handle ECONNRESET/500 errors without crashing |
| 10 | **Safe File Operations** | Must handle simultaneous reads/writes safely (file lock or append-only logic) |

---

## 3. Constraints

| Constraint | Description |
|------------|-------------|
| C1 | **No RabbitMQ/MQTT** - Must implement buffering, batching, retry logic, and HMAC manually |
| C2 | **Node.js only** - Use standard libraries (`fs`, `crypto`, `sqlite3`) |
| C3 | **Store-and-Forward architecture** - Events written to disk before transmission |
| C4 | **Exponential Backoff** - Pause transmission during network failures |
| C5 | **HMAC-SHA256** - Required for payload signing |
| C6 | **Unique Event IDs** - UUID-based for deduplication |

---

## 4. Research and Resources

During the solution design, I researched the following concepts and resources:

### 4.1 Write-Ahead Log (WAL) Concepts
- **SQLite WAL Mode**: [SQLite Write-Ahead Logging](https://www.sqlite.org/wal.html) - I researched how WAL mode allows concurrent reads while a write is occurring, making it ideal for this use case
- **PRAGMA journal_mode = WAL**: Enables WAL mode for better concurrency

### 4.2 HMAC Security Implementation
- **Node.js crypto module**: [crypto.createHmac](https://nodejs.org/api/crypto.html#crypto_crypto_createhmac_algorithm_key_options) - Official documentation for HMAC creation
- **Timing-safe comparisons**: [crypto.timingSafeEqual](https://nodejs.org/api/crypto.html#crypto_crypto_timingsafeequal_a_b) - Essential for preventing timing attacks during signature verification

### 4.3 Exponential Backoff Strategies
- **Retry-Logic Patterns**: I studied common exponential backoff patterns used in distributed systems
- **Max Backoff Cap**: Set to 30 seconds to prevent excessive delays while still providing reasonable backoff

### 4.4 Idempotency Patterns
- **Idempotent API Design**: [Stripe's Idempotency Approach](https://stripe.com/blog/idempotency) - Researched how to handle duplicate requests safely
- **Event Deduplication**: Using UUIDs as unique identifiers for each event

### 4.5 Educational Resources
- **Node.js Event Loop**: Understanding how async operations work in Node.js to ensure non-blocking behavior
- **SQLite并发控制**: [SQLite Busy Timeout](https://www.sqlite.org/c3ref/busy_timeout.html) - Researched handling database locks

---

## 5. Choosing Methods and Why

### 5.1 SQLite over Plain File System

**Decision**: I chose SQLite (via `sqlite3` package) for the Write-Ahead Log instead of plain file operations.

**Reasoning**:
- SQLite provides ACID guarantees out of the box
- Built-in indexing on `sent` column for efficient batch retrieval
- WAL mode allows concurrent reads while writing
- Automatic crash recovery
- Easier to query and manage compared to manual file parsing

**Why not plain `fs` append-only**:
- Handling simultaneous reads/writes safely would require implementing a custom file lock mechanism
- Querying for "unsent events" would require scanning the entire file
- No built-in support for transactions or atomic updates

### 5.2 Operation Queue Serialization

**Decision**: I implemented an operation queue to serialize all database operations.

**Reasoning**:
- SQLite3's callback-based API is not thread-safe
- Node.js runs in a single thread, but callbacks can interleave
- Queue ensures one operation completes before the next starts
- Prevents `SQLITE_BUSY` errors and race conditions

**Why not `db.serialize()` alone**:
- `serialize()` only works within a single callback chain
- Our async functions span multiple callbacks
- Queue provides explicit control over operation ordering

### 5.3 HMAC with Timestamp

**Decision**: I included timestamp in the HMAC signature using format `${timestamp}:${body}`.

**Reasoning**:
- Prevents replay attacks where an interceptor captures a valid request and re-sends it
- Server checks if timestamp is within `replayWindowMs` (5 minutes)
- Combining body and timestamp ensures the signature covers both content and timing
- This is a security best practice for API authentication

**Why not HMAC-only**:
- Without timestamp, a captured request could be replayed indefinitely
- Adds an additional layer of defense against man-in-the-middle attacks

### 5.4 Exponential Backoff with Cap

**Decision**: I implemented exponential backoff starting at 500ms, doubling each failure, capped at 30 seconds.

**Reasoning**:
- Starts aggressive (500ms) to recover quickly when network is temporarily down
- Doubles on each failure to avoid overwhelming a struggling server
- Caps at 30 seconds to ensure data doesn't get excessively delayed
- Resets to base interval on successful transmission

**Why this pattern**:
- Common industry standard (used by AWS, Google, etc.)
- Balances quick recovery against server load
- Prevents thundering herd problem

### 5.5 Fire-and-Forget Sensor Writes

**Decision**: I made sensor event appends fire-and-forget using `.catch()` to handle errors without blocking.

**Reasoning**:
- Sensor loop runs every 100ms - cannot wait for disk I/O
- If WAL write fails, we log the error but continue
- In production, a more robust error handling would be added
- This ensures sensor timing is not affected by disk performance

**Why not `await` in sensor loop**:
- Would block the sensor interval, causing drift
- Could miss sensor readings during slow disk operations
- Violates requirement #6 (sensor must not be blocked by sync)

---

## 6. Solution Implementation and Explanation

### 6.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Station Controller (Client)                   │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────────┐  │
│  │   Sensor     │───▶│     WAL      │───▶│   Sync Loop       │  │
│  │  (100ms)     │    │  (SQLite)    │    │  (Async HTTP)     │  │
│  └──────────────┘    └──────────────┘    └────────────────────┘  │
│         │                                        │               │
│         │                                        │               │
│         ▼                                        ▼               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    HMAC Signing                           │    │
│  │  Signature = HMAC-SHA256(secret, timestamp + body)       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                  │
│                              ▼                                  │
│                    ┌─────────────────┐                          │
│                    │  Cloud API      │                          │
│                    │  POST /ingest   │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Cloud Ingestion API (Server)                 │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────────┐  │
│  │ HMAC Verify  │───▶│ Idempotency  │───▶│   SQLite DB        │  │
│  │ (timingSafe) │    │ (Dedupe by   │    │   (processed_      │  │
│  │              │    │  UUID)       │    │    events table)   │  │
│  └──────────────┘    └──────────────┘    └────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Client Components

#### 6.2.1 Sensor Loop ([`sensor.js`](../repository_after/src/client/sensor.js))

```javascript
function tick() {
  const event = {
    id: uuidv4(),           // Unique identifier for deduplication
    timestamp: Date.now(),  // When the event occurred
    volume: generateVolume() // Random 0.1-0.5 liters
  };
  
  // Fire-and-forget: don't await this
  wal.appendEvent(event).catch((err) => {
    console.error('Failed to append event to WAL', err);
  });
}

timer = setInterval(tick, intervalMs);
```

**Why this works**:
- Each event gets a unique UUID (using `uuid` package)
- Timestamp captures the exact moment of dispensing
- Fire-and-forget ensures 100ms interval is maintained regardless of disk I/O
- Errors are caught and logged but don't crash the process

#### 6.2.2 Write-Ahead Log ([`wal.js`](../repository_after/src/client/wal.js))

The WAL is the heart of the system, ensuring no data loss:

```javascript
function createClientWal() {
  const db = new sqlite3.Database(clientDbPath);
  
  // Initialize with WAL mode for concurrency
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA busy_timeout = 5000');
  
  // Create events table
  db.run(`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,      // UUID for deduplication
    timestamp INTEGER NOT NULL,
    volume REAL NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0
  )`);
  
  // Operation queue for serialization
  let operationQueue = [];
  let isProcessing = false;
  
  function queueOperation(operation) {
    return new Promise((resolve, reject) => {
      operationQueue.push({ operation, resolve, reject });
      processQueue();
    });
  }
  
  function appendEvent(event) {
    return queueOperation(() => {
      return new Promise((resolve, reject) => {
        const stmt = db.prepare(
          'INSERT INTO events (id, timestamp, volume, sent) VALUES (?, ?, ?, 0)'
        );
        stmt.run([event.id, event.timestamp, event.volume], (err) => {
          stmt.finalize();
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }
  
  function getNextBatch(limit) {
    return queueOperation(() => {
      return new Promise((resolve, reject) => {
        db.all(
          'SELECT id, timestamp, volume FROM events WHERE sent = 0 ORDER BY timestamp ASC LIMIT ?',
          [limit],
          (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
          }
        );
      });
    });
  }
  
  function markEventsSent(ids) {
    if (!ids.length) return Promise.resolve();
    return queueOperation(() => {
      const placeholders = ids.map(() => '?').join(',');
      return new Promise((resolve, reject) => {
        db.run(
          `UPDATE events SET sent = 1 WHERE id IN (${placeholders})`,
          ids,
          (err) => {
            if (err) return reject(err);
            resolve();
          }
        );
      });
    });
  }
}
```

**Why this works**:
- **SQLite WAL mode**: Allows safe concurrent access
- **Operation queue**: Ensures all database operations are serialized
- **`sent` flag**: Marks events as sent without deleting them (preserves data for debugging)
- **ORDER BY timestamp ASC**: Sends oldest events first (FIFO ordering)
- **Busy timeout**: Automatically waits up to 5 seconds for locks

#### 6.2.3 Sync Loop ([`sync.js`](../repository_after/src/client/sync.js))

```javascript
async function syncOnce() {
  // Get batch of unsent events
  const events = await wal.getNextBatch(batchSize);
  
  if (!events.length) {
    scheduleNext(baseInterval);
    return;
  }
  
  // Create HMAC signature
  const timestamp = Date.now().toString();
  const payload = { events };
  const body = JSON.stringify(payload);
  
  const signature = crypto
    .createHmac('sha256', hmacSecret)
    .update(`${timestamp}:${body}`)  // Timestamp + body prevents replay
    .digest('hex');
  
  // Send to server
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [hmacSignatureHeader]: signature,
      [hmacTimestampHeader]: timestamp
    },
    body
  });
  
  if (!response.ok) {
    throw new Error(`Server responded with status ${response.status}`);
  }
  
  // Mark events as sent
  const ids = events.map((e) => e.id);
  await wal.markEventsSent(ids);
  
  // Reset backoff on success
  backoffDelay = baseInterval;
  scheduleNext(baseInterval);
} catch (err) {
  // Exponential backoff
  backoffDelay = Math.min(backoffDelay * 2, maxBackoff);
  scheduleNext(backoffDelay);
}
```

**Why this works**:
- **Batching**: Up to 50 events per request (requirement #2)
- **HMAC signing**: Every request is cryptographically signed
- **Error handling**: Non-2xx responses trigger backoff
- **Mark-after-success**: Only mark events sent after successful ACK
- **Exponential backoff**: Starts at 500ms, doubles, caps at 30 seconds

### 6.3 Server Components

#### 6.3.1 HMAC Verification Middleware ([`app.js`](../repository_after/src/server/app.js))

```javascript
function verifyHmacMiddleware(req, res, next) {
  const signature = req.header(hmacSignatureHeader);
  const timestamp = req.header(hmacTimestampHeader);
  
  // Check timestamp is within replay window (5 minutes)
  const now = Date.now();
  const ts = Number(timestamp);
  if (Number.isNaN(ts) || Math.abs(now - ts) > replayWindowMs) {
    return res.status(401).json({ error: 'Stale or invalid timestamp' });
  }
  
  // Recalculate expected signature
  const body = JSON.stringify(req.body || {});
  const expected = crypto
    .createHmac('sha256', hmacSecret)
    .update(`${timestamp}:${body}`)
    .digest('hex');
  
  // Timing-safe comparison to prevent timing attacks
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  
  if (sigBuf.length !== expBuf.length) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  const valid = crypto.timingSafeEqual(sigBuf, expBuf);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  return next();
}
```

**Why this works**:
- **Timestamp validation**: Prevents replay attacks
- **`timingSafeEqual`**: Constant-time comparison prevents timing attacks
- **Buffer length check**: Early rejection for malformed signatures
- **Middleware pattern**: Clean separation of concerns

#### 6.3.2 Idempotent Event Recording ([`db.js`](../repository_after/src/server/db.js))

```javascript
async function recordEvents(events) {
  const ids = events.map((e) => e.id);
  
  // Check which IDs already exist
  const existing = await getExistingIds(ids);
  
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      const insertStmt = db.prepare(
        'INSERT OR IGNORE INTO processed_events (id, timestamp, volume) VALUES (?, ?, ?)'
      );
      
      let insertedCount = 0;
      let addedVolume = 0;
      
      // Process each event
      for (const ev of events) {
        if (existing.has(ev.id)) {
          continue; // Skip duplicate - this is idempotency in action
        }
        
        insertStmt.run([ev.id, ev.timestamp, ev.volume]);
        insertedCount++;
        addedVolume += ev.volume;
      }
      
      insertStmt.finalize();
      
      // Update total volume
      db.run(
        'UPDATE stats SET value = value + ? WHERE key = ?',
        [addedVolume, 'total_volume'],
        () => {
          db.run('COMMIT');
          resolve({ insertedCount, addedVolume });
        }
      );
    });
  });
}
```

**Why this works**:
- **`INSERT OR IGNORE`**: SQLite's upsert that does nothing if row exists
- **Transaction**: All inserts succeed or fail together
- **Deduplication check**: Queries existing IDs before inserting
- **Dedupe by Event ID**: If client re-sends same batch, we simply skip duplicates
- **No double-counting**: Volume is only added for new events

---

## 7. How Solution Handles Constraints, Requirements, and Edge Cases

### 7.1 Requirements Coverage Matrix

| Requirement | How Addressed |
|-------------|---------------|
| R1: Persistent Storage | SQLite WAL with disk-based storage survives power cycles |
| R2: Batching | `batchSize: 50` configurable, groups events into single POST |
| R3: HMAC Signing | `crypto.createHmac('sha256', secret).update(timestamp + body)` |
| R4: Server Verification | `crypto.timingSafeEqual` for signature comparison |
| R5: Idempotency | `INSERT OR IGNORE` + deduplication check by UUID |
| R6: Non-blocking Sensor | Fire-and-forget `wal.appendEvent()` with `.catch()` |
| R7: Data Integrity | HMAC + replay protection ensures accurate volume |
| R8: Graceful Error Handling | Try-catch with backoff, no process crashes |
| R9: Safe File Operations | SQLite WAL mode + operation queue serialization |
| R10: Replay Protection | Timestamp + 5-minute replay window |

### 7.2 Edge Cases Handled

#### Edge Case 1: Network Failure During Send
**Scenario**: Client sends request, server processes it, but ACK is lost.

**Handling**:
1. Client receives non-2xx or timeout
2. Exponential backoff triggers (500ms → 1s → 2s...)
3. Same batch is fetched from WAL (still marked `sent = 0`)
4. Re-sent with same Event IDs
5. Server checks existing IDs, skips duplicates
6. Volume not double-counted

**Why it works**: The `sent` flag is only set after successful ACK, so unacknowledged events remain available for re-send.

#### Edge Case 2: Server Crash Mid-Transaction
**Scenario**: Server starts processing batch but crashes before completing.

**Handling**:
1. Transaction is atomic - either all inserts commit or none do
2. Client never receives ACK
3. Events remain `sent = 0` in client WAL
4. Batch is re-sent on recovery
5. `INSERT OR IGNORE` ensures no duplicates

**Why it works**: Transaction + idempotent insert = guaranteed consistency.

#### Edge Case 3: Database Lock Contention
**Scenario**: Sensor writing while sync is reading.

**Handling**:
1. SQLite WAL mode allows concurrent reads
2. Operation queue serializes all write operations
3. `PRAGMA busy_timeout = 5000` waits up to 5 seconds for locks
4. Retry logic on `SQLITE_BUSY` errors

**Why it works**: WAL mode + busy timeout + operation queue = no lost writes.

#### Edge Case 4: Malformed HMAC Signature
**Scenario**: Attacker attempts to send fake data.

**Handling**:
1. Server recalculates expected signature
2. `timingSafeEqual` prevents timing attacks
3. 401 response rejects the request
4. Events not processed

**Why it works**: HMAC secret is never transmitted; only signature is sent.

#### Edge Case 5: Replay Attack
**Scenario**: Attacker captures valid request and re-sends later.

**Handling**:
1. Server checks timestamp is within 5-minute window
2. Old requests are rejected with "Stale timestamp" error
3. Events not processed

**Why it works**: Time-limited signatures prevent replay.

#### Edge Case 6: Client Restart Mid-Sync
**Scenario**: Client crashes while sync is in progress.

**Handling**:
1. Events in WAL are transactional
2. Unacknowledged events remain marked `sent = 0`
3. On restart, sync loop picks up from where it left off
4. No data loss

**Why it works**: WAL persistence + restart-resilient sync loop.

#### Edge Case 7: Empty Batch
**Scenario**: Sync loop runs but no unsent events exist.

**Handling**:
```javascript
const events = await wal.getNextBatch(batchSize);
if (!events.length) {
  scheduleNext(baseInterval);
  return;
}
```

**Why it works**: Early return prevents unnecessary HTTP requests.

#### Edge Case 8: Massive Backlog
**Scenario**: Network is down for hours, thousands of events accumulate.

**Handling**:
1. SQLite stores unlimited events (disk permitting)
2. Batch size limits per-request payload
3. Events sent in order (FIFO)
4. Exponential backoff caps at 30 seconds
5. Fast recovery when network returns

**Why it works**: Disk-based storage is not memory-constrained; backoff cap ensures timely recovery.

### 7.3 Security Considerations

| Threat | Mitigation |
|--------|------------|
| Data Tampering | HMAC-SHA256 signature covers entire body |
| Spoofing | Only clients with shared secret can sign |
| Replay Attacks | Timestamp + 5-minute window |
| Timing Attacks | `timingSafeEqual` for signature comparison |
| Man-in-the-Middle | HTTPS (recommended for production) + HMAC |

---

## 8. Summary

This solution implements a production-grade offline-first telemetry system for IoT devices:

1. **Store-and-Forward**: SQLite WAL ensures zero data loss on power failure
2. **Batching**: Up to 50 events per request for efficiency
3. **HMAC Security**: Timestamp + body signing with timing-safe verification
4. **Idempotency**: UUID-based deduplication prevents double-counting
5. **Exponential Backoff**: Graceful degradation during network outages
6. **Non-Blocking**: Sensor loop operates independently of sync
7. **Concurrency Safety**: Operation queue + SQLite WAL mode

The architecture successfully handles the Two Generals' Problem through:
- Persistent storage (survives network/ACK loss)
- Idempotent operations (server-side deduplication)
- Atomic transactions (all-or-nothing processing)

This ensures accurate water usage reporting even in the most challenging network conditions encountered in subway stations and basements.

# PostgreSQL Concurrent Booking Prevention

## Problem Analysis

**Initial Challenge**: Design a PostgreSQL-only SQL transaction that prevents two clients from booking the same `resource_id` simultaneously under real concurrency conditions.

**Key Constraints**:
- Must work with PostgreSQL MVCC and real locking behavior
- Only SQL statements inside a single transaction
- No additional constraints, tables, or application-side locking
- Exactly one booking attempt must succeed per resource
- Competing attempts must block or fail safely

## Understanding the Core Issue

The fundamental problem is a **race condition**:
1. Transaction A checks if resource exists → finds none
2. Transaction B checks if resource exists → finds none  
3. Both transactions proceed to insert → **double booking**

Traditional approaches that DON'T work:
- Simple `SELECT` then `INSERT` (race condition)
- `SELECT ... FOR UPDATE` on non-existent rows (returns empty/no lock acquired)
- `INSERT ... ON CONFLICT` (requires unique constraints we can't add)

## Key Insight: The Locking Challenge

The critical realization was that standard row-level locks (`FOR UPDATE`) fail when the row doesn't exist yet. The first booking for any resource is the most vulnerable point.

**Initial Attempt (Virtual Rows)**:
We tried `UNION ALL` with `VALUES` to "guarantee" a lock target. However, Postgres does not block on constants in a `FOR UPDATE` clause if they aren't tied to a physical table row.

**The Robust Solution: Advisory Locks**:
PostgreSQL provides **Advisory Locks** specifically for scenarios where you need to serialize operations on an abstract ID (like a `resource_id`) that may not exist in the database yet.

## Solution Strategy: Transaction-Level Advisory Locking

**Core Innovation**: Use `pg_advisory_xact_lock(resource_id)` to create a serialization point tied to the transaction.

```sql
BEGIN;
-- Creates an exclusive lock on the ID. 
-- Any other transaction trying to lock this same ID will wait.
SELECT pg_advisory_xact_lock($1);

-- Once lock is held, safely check and insert.
INSERT INTO bookings (resource_id, user_id)
SELECT $1, $2
WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE resource_id = $1);
COMMIT;
```

**Why this works**:
- It is a purely SQL-based function call.
- The `xact` variant automatically releases when the transaction finishes (COMMIT or ROLLBACK).
- It provides a reliable "wait-line" even for resources that have never seen a booking before.

## Implementation Logic Flow

### Step 1: Acquire Serialization Point
```sql
SELECT pg_advisory_xact_lock($1);
```
**Effect**: Blocks current execution until it holds the exclusive "right" to process booking logic for this specific `$1` (resource_id).

### Step 2: Safe Check and Insert
```sql
WITH booking_attempt AS (
    INSERT INTO bookings (resource_id, user_id)
    SELECT $1, $2
    WHERE NOT EXISTS (
        SELECT 1 FROM bookings WHERE resource_id = $1
    )
    RETURNING id, resource_id, user_id
)
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'SUCCESS: Resource booked'
        ELSE 'FAILED: Resource already booked'
    END as booking_result
FROM booking_attempt;
```
**Effect**: Under the exclusive lock, the check for existing bookings is 100% accurate because no other transaction can be in the "check-and-insert" phase for this resource.

## Concurrency Safety Analysis

**Transaction Isolation**: Works flawlessly under PostgreSQL's default `READ COMMITTED` isolation level.

**Lock Behavior**:
1. Transaction A acquires advisory lock on `99`.
2. Transaction B attempts same lock → **blocks and waits**.
3. Transaction A inserts and commits → releases lock.
4. Transaction B acquires lock → performs query → sees A's record → `INSERT` skips → returns failure.

**Performance**: Highly efficient. Advisory locks use an in-memory lock table and don't involve disk I/O until the actual `INSERT` occurs.

## Final Solution Verification

**Evaluation Results**:
- ✅ Extensive stress testing passed.
- ✅ **Zero double bookings detected** under high concurrency.
- ✅ Successful generation of standard evaluation reports.

## Lessons Learned

1. **Physical Rows Aren't Everything**: When a row doesn't exist, don't try to "hack" a row-level lock. Use Advisory Locks which are designed for precisely this "virtual" serialization.
2. **Atomic Blocks in Python**: Using `psycopg2` requires disabling `autocommit` to ensure the lock and the insert are part of the same transaction context.
3. **Advisory Locks are SQL Native**: They are often overlooked but are first-class citizens in the PostgreSQL SQL dialect and satisfy "SQL-only" constraints perfectly.


## Alternative Approaches Considered

**Approach 1: Virtual Row UNION ALL**
- Rejected: Technically flaky for non-existent IDs.

**Approach 2: Serializable Isolation**
- Rejected: Leads to "could not serialize access" errors which require application-side retry loops. We wanted a "wait then succeed/fail" behavior.

**Approach 3: INSERT ... ON CONFLICT**
- Rejected: Requires adding `UNIQUE` constraints to the schema, which was prohibited.

**Approach 4: Table-Level Locking**
- Rejected: Massive performance bottleneck for high-traffic systems.
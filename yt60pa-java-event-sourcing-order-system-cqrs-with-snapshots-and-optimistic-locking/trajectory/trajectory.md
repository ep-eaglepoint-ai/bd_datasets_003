# Trajectory (Thinking Process for Event Sourcing Implementation)

## 1. Audit the Requirements (Identify Concurrency & Auditability Needs)

I audited the requirements for the Order Management System. The core challenges were ensuring a complete, immutable audit log of all state changes, handling concurrent updates safely, and providing fast read access despite the complex write model.

- **Problem**: Standard CRUD loses history (creating "Lost Updates" or overwriting state) and coupling writes to reads kills performance.
- **Solution**: Event Sourcing to persist every state change as an immutable event.
- **Reference**: [Martin Fowler on Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- **Reference**: [Why CRUD is not enough](https://www.youtube.com/watch?v=STKCRSUsyP0)

## 2. Define a Performance & Consistency Contract First

I defined the contracts for the system:

- **Write Side**: Must be strongly consistent using Optimistic Locking.
- **Read Side**: Can be eventually consistent via asynchronous projections.
- **Performance**: Aggregate loading time must not degrade linearly with history size (addressed via Snapshotting).
- **Reference**: [Event Consistency Patterns](https://docs.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)

## 3. Rework the Data Model for Efficiency (Event Store + Snapshots)

I designed a specialized schema optimized for writes and sequential reads:

- **`events` table**: The single source of truth, storing JSON payloads keyed by `aggregate_id` and `version`.
- **`snapshots` table**: Stores the computed state of an aggregate at a specific version to prevent expensive full replays.
- **`processed_commands` table**: Ensures idempotency by tracking request keys.
- **Optimization**: Used `JSONB` (or text with Jackson) for flexible payload storage without complex joining tables.
- **Reference**: [PostgreSQL for Event Sourcing](https://event-driven.io/en/postgres_event_sourcing/)

## 4. Rebuild the Query Side as a Projection-First Pipeline (CQRS)

To avoid the "Event Replay" cost on every read, I implemented a `ProjectionHandler`. This asynchronously consumes events and updates a flattened `order_projections` table.

- **Optimized Read**: Queries like "Get Order Status" hit the projection table directly (O(1)) instead of recalculating from events (O(N)).
- **Changes**: `ProjectionHandler` uses `@Async` but is orchestrated to run sequentially per-aggregate to avoid race conditions.
- **Reference**: [Microservices.io - CQRS Pattern](https://microservices.io/patterns/data/cqrs.html)

## 5. Move Logic to the Domain (Aggregate Design)

All business logic (validation, state transitions) was encapsulated within the `Order` aggregate.

- **`apply()` methods**: ensure state mutations are deterministic based on events, acting as the "Left Fold" of the event stream.
- **`replay()` logic**: reconstructs state memory-efficiently.
- **Reference**: [Domain Driven Design - Aggregates](https://martinfowler.com/bliki/DDD_Aggregate.html)

## 6. Efficient Snapshotting Strategy

Instead of replaying 1000+ events for long-lived orders, I implemented a snapshot strategy.

- **Threshold**: Every 100 events, a snapshot is saved.
- **Recovery**: `loadAggregate` first fetches the latest snapshot, then only plays events _after_ that version.
- **Implementation Detail**: Used `@JsonIgnore` on the `newEvents` list in the Aggregate to prevent transient data from polluting the snapshot serialization.
- **Reference**: [Snapshotting in Event Sourcing](https://domaincentric.net/blog/event-sourcing-snapshots)

## 7. Stable Ordering & Optimistic Locking

I implemented stable ordering using a strict versioning sequence.

- **Locking**: The `events` table has a unique constraint on `(aggregate_id, aggregate_version)`. Inserting an event with an existing version throws a `DuplicateKeyException`.
- **Concurrency Control**: verified that concurrent commands on the same aggregate fail fast if they try to write to the same version.
- **Reference**: [Optimistic Locking with JPA/JDBC](https://vladmihalcea.com/optimistic-locking-version-property/)

## 8. Eliminate Race Conditions in Projections

- **Async Execution**: Configured a `ThreadPoolTaskExecutor` with a `corePoolSize(1)` in `AsyncConfig`.
- **Why**: Standard async pools might process Event A (Version 1) and Event B (Version 2) in parallel or out of order. Restricting to a single thread (or partitioning by ID in a real distributed system) guarantees FIFO processing.
- **Reference**: [Spring @Async Guide](https://www.baeldung.com/spring-async)

## 9. Guarantee Idempotency

Implemented a check at the start of command processing. If a `commandId` exists in `processed_commands`, the request is rejected immediately.

- **Benefit**: Retries from the client/broker don't corrupt the state or trigger duplicate side effects.
- **Reference**: [Idempotency Key Pattern](https://stripe.com/blog/idempotency)

## 10. Result: Measurable Performance Gains + Predictable Signals

The solution successfully handles:

- **High Concurrency**: Verified via Optimistic Locking tests (Test 1).
- **Performance**: Verified via Snapshotting tests (Test 4), ensuring O(1) load time relative to history > threshold.
- **Correctness**: Verified via comprehensive Event Sourcing & CQRS flow tests (Test 9, 7).

---

# Trajectory Transferability Notes

The above trajectory is designed for **Event Sourcing Implementation**. The steps outlined in it represent reusable thinking nodes (audit requirements, contract definition, schema design, execution, and verification).

The same nodes can be reused to transfer this trajectory to other hard-work categories (such as CRUD migration, Microservices decomposition, etc.) by changing the focus of each node, not the structure.

Below are the nodes extracted from this trajectory. These nodes act as a template that can be mapped to other categories by adapting the inputs, constraints, and validation signals specific to each task type.

### Event Sourcing → CRUD Migration

- **Audit Requirement** becomes **Data Consistency Audit**
- **Performance Contract** becomes **Migration Downtime Limits**
- **Data Model** changes from **Events** to **Normalized Tables**
- **Projections** map to **Materialized Views**

### Event Sourcing → Microservices Decomposition

- **Audit Requirement** becomes **Domain Boundary Analysis**
- **Performance Contract** becomes **Network Latency Budgets**
- **Data Model** becomes **Database partitioning**
- **Projections** map to **Data Replication/Aggregation service**

### Event Sourcing → Real-time Analytics

- **Audit Requirement** becomes **Stream Volume Analysis**
- **Performance Contract** becomes **Throughput & Lag Constraints**
- **Data Model** becomes **Time-Series Storage**
- **Projections** map to **Stream Windows/Aggregations**

## Core Principle (Applies to All)

- The trajectory structure stays the same
- Only the focus and artifacts change
- Audit → Contract → Design → Execute → Verify remains constant

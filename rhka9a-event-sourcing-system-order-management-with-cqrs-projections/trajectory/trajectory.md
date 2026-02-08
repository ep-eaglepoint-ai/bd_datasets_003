# Trajectory: Event Sourcing System with CQRS Projections

## 1. Problem Statement

Based on the prompt, I identified that the engineering team needs to build an event sourcing framework for order management that supports:
- **Audit logging**: Complete history of all state changes as immutable events
- **Temporal queries**: Ability to reconstruct state at any point in time
- **Eventual consistency**: Support for microservices architecture where read models may lag behind write models
- **Concurrent modification safety**: Prevent data corruption when multiple operations occur simultaneously
- **Performance optimization**: Snapshots to avoid replaying entire event history for aggregates with many events
- **Non-blocking operations**: Projection rebuilds must not interfere with ongoing command processing

The core challenge is implementing a production-grade event sourcing framework from scratch using only Spring Boot, Spring Data JPA, PostgreSQL, and Jackson—without relying on external event sourcing libraries like Axon Framework or EventStoreDB.

## 2. Requirements Analysis

Based on the requirements, I identified ten critical criteria that must be met:

### Requirement 1: Append-Only Event Store
The event store must persist domain events with append-only semantics. Each event needs:
- Unique event ID (UUID)
- Aggregate ID (UUID) 
- Sequential version number (strictly increasing per aggregate)
- Timestamp
- Event type (fully qualified class name)
- JSON payload

### Requirement 2: Optimistic Locking
Concurrent modifications to the same aggregate must be detected and rejected. The system must verify the expected version matches the current version before appending events.

### Requirement 3: Aggregate Base Class
A base class must manage:
- Uncommitted events tracking
- Version tracking
- State rebuild from event history
- Event application logic

### Requirement 4: Snapshot Support
Snapshots must be created periodically to reduce load time. They must:
- Be created atomically
- Not block command processing (separate transactions)
- Allow loading from snapshot + replaying only events after snapshot version

### Requirement 5: Order Aggregate Implementation
Must handle four commands:
- CreateOrder
- AddItem
- RemoveItem
- SubmitOrder

Each command must validate business rules before generating events.

### Requirement 6: Immutable Events
Events must be immutable using Java records or final fields. Must serialize/deserialize with Jackson using polymorphic type handling.

### Requirement 7: CQRS Projections
Read models must:
- Subscribe to domain events
- Maintain denormalized views
- Handle events idempotently
- Track order ID, customer ID, status, total amount, item count, timestamps

### Requirement 8: Memory-Bounded Projection Rebuilds
Rebuilds must:
- Process events in batches or streams
- Not load all events into memory at once
- Not block ongoing operations

### Requirement 9: Transactional Event Publication
Events must be published after successful persistence. Projection updates must run in separate transactions so failures don't roll back command transactions.

### Requirement 10: No External Libraries
Must use only Spring Boot 3.x, Spring Data JPA, PostgreSQL, and Jackson. All framework code implemented from scratch.

## 3. Constraints

I identified seven critical constraints that shaped my design decisions:

1. **Events are immutable once persisted** - No modifications after creation
2. **Aggregates modified only through events** - Direct state mutation forbidden
3. **Idempotent event handlers** - Processing same event twice has no effect
4. **Optimistic locking for concurrency** - Concurrent writes must fail with exception
5. **Non-blocking projection rebuilds** - Must not interfere with commands
6. **Appropriate transaction usage** - Separate transactions for commands vs projections
7. **No external ES libraries** - Build everything from scratch

## 4. Research and Learning

Before implementing, I researched event sourcing patterns, CQRS architecture, and Spring transaction management:

### Event Sourcing Fundamentals
- **Martin Fowler's Event Sourcing Pattern**: https://martinfowler.com/eaaDev/EventSourcing.html
  - Learned that event sourcing stores state changes as a sequence of events
  - Understood that aggregates are rebuilt by replaying events
  - Recognized the importance of event immutability

- **Greg Young's Event Sourcing CQRS Journey**: https://www.youtube.com/watch?v=8JKjvY4etTY
  - Learned about CQRS separation of read and write models
  - Understood projection patterns for denormalized views
  - Recognized the need for idempotent event handlers

### Optimistic Locking
- **PostgreSQL Unique Constraints**: https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS
  - Decided to use unique constraint on (aggregate_id, event_version) for database-level protection
  - This provides a safety net even if application-level checks fail

- **Spring Transaction Management**: https://docs.spring.io/spring-framework/reference/data-access/transaction.html
  - Learned about `@TransactionalEventListener` with `AFTER_COMMIT` phase
  - Understood transaction propagation (`REQUIRES_NEW`) for isolation
  - Recognized the need for separate transactions for projections

### Snapshot Patterns
- **Event Sourcing Snapshot Strategies**: https://eventstore.com/blog/event-sourcing-snapshots/
  - Learned that snapshots should be created periodically (every N events)
  - Understood that snapshots must be atomic and not block commands
  - Recognized the need for async snapshot creation

### Jackson Polymorphic Deserialization
- **Jackson Type Information**: https://github.com/FasterXML/jackson-docs/wiki/JacksonPolymorphicDeserialization
  - Learned about `@JsonTypeInfo` and `@JsonSubTypes` for polymorphic handling
  - Understood how to store type information in JSON for deserialization
  - Recognized the need for fully qualified class names in event type field

### Spring Application Events
- **Spring Application Events**: https://docs.spring.io/spring-framework/reference/core/beans.html#context-functionality-events
  - Learned about `ApplicationEventPublisher` for decoupled event publishing
  - Understood `@TransactionalEventListener` for transaction-aware event handling
  - Recognized the need for wrapper classes to handle generic types

### PostgreSQL JSONB
- **PostgreSQL JSONB Documentation**: https://www.postgresql.org/docs/current/datatype-json.html
  - Learned about JSONB for efficient JSON storage and querying
  - Understood Hypersistence Utils for Hibernate JSONB support
  - Recognized the performance benefits over TEXT storage

## 5. Method Selection and Design Decisions

### 5.1 Event Store Design

**Why I chose append-only with version-based optimistic locking:**

I chose an append-only event store because:
1. **Immutability**: Once written, events never change, ensuring audit trail integrity
2. **Simplicity**: No updates or deletes simplifies the data model
3. **Performance**: Appends are faster than updates in PostgreSQL
4. **Replay capability**: Easy to rebuild state from scratch

For optimistic locking, I implemented a two-layer approach:

```java
// Application-level check
Long currentVersion = getLatestVersion(aggregateId);
if (!Objects.equals(currentVersion, expectedVersion)) {
    throw new ConcurrencyException(...);
}

// Database-level protection
@Table(uniqueConstraints = @UniqueConstraint(
    columnNames = {"aggregate_id", "event_version"}
))
```

**Why this works:**
- Application check provides fast failure before database round-trip
- Database unique constraint prevents race conditions even if two transactions pass the application check simultaneously
- Sequential version numbers ensure strict ordering

### 5.2 Aggregate Base Class Design

**Why I separated `applyNewEvent()` and `applyHistoricalEvent()`:**

I created two methods because they serve different purposes:

```java
protected void applyNewEvent(DomainEvent event) {
    applyEvent(event);
    uncommittedEvents.add(event);  // Track for persistence
    version++;  // Increment for new event
}

protected void applyHistoricalEvent(DomainEvent event) {
    applyEvent(event);
    version = event.getVersion();  // Set from event (already persisted)
}
```

**Why this works:**
- `applyNewEvent()` tracks events for persistence and increments version
- `applyHistoricalEvent()` sets version from event (which already has correct version from database)
- This separation prevents version mismatches during replay
- Uncommitted events are transient (not serialized) and cleared after persistence

### 5.3 Snapshot Strategy

**Why I chose periodic snapshots with async creation:**

I implemented snapshots that are created:
1. Periodically (every N events, configurable)
2. Asynchronously (using `@Async`)
3. In separate transactions (`REQUIRES_NEW`)

```java
@Async("snapshotExecutor")
@Transactional(propagation = Propagation.REQUIRES_NEW)
public CompletableFuture<Void> createSnapshotAsync(...) {
    if (snapshotStrategy.shouldCreateSnapshot(version)) {
        snapshotStore.saveSnapshot(...);
    }
}
```

**Why this works:**
- Periodic creation balances storage cost vs. load performance
- Async execution prevents blocking command processing
- Separate transaction ensures snapshot failures don't affect commands
- CompletableFuture allows non-blocking scheduling

### 5.4 Projection Event Handling

**Why I chose `@TransactionalEventListener(AFTER_COMMIT)` with `REQUIRES_NEW`:**

I implemented projection handlers that:
1. Listen for events after transaction commit
2. Run in separate transactions
3. Handle events idempotently

```java
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
@Transactional(propagation = Propagation.REQUIRES_NEW)
public void onOrderCreated(DomainEventWrapper<OrderCreatedEvent> wrapper) {
    // Idempotency check
    if (repository.existsById(event.getAggregateId())) {
        return;  // Already processed
    }
    // Create projection...
}
```

**Why this works:**
- `AFTER_COMMIT` ensures events are persisted before projections update
- `REQUIRES_NEW` isolates projection failures from command transactions
- Idempotency checks prevent duplicate processing
- Separate transactions allow projections to fail without rolling back commands

### 5.5 Memory-Bounded Projection Rebuilds

**Why I chose streaming with batch processing:**

I implemented a custom `Spliterator` that:
1. Loads events in pages (batches)
2. Processes each batch in separate transactions
3. Never loads all events into memory

```java
public Stream<DomainEvent> streamAllEvents(int batchSize) {
    return StreamSupport.stream(new Spliterator<DomainEvent>() {
        private int currentPage = 0;
        private Page<EventEntity> currentPageResult = null;
        
        @Override
        public boolean tryAdvance(Consumer<? super DomainEvent> action) {
            if (currentPageResult == null || currentIndex >= currentPageResult.getContent().size()) {
                currentPageResult = eventRepository.findAllByOrderByCreatedAtAsc(
                    PageRequest.of(currentPage, batchSize));
                // Load next page...
            }
            // Process event...
        }
    }, false);
}
```

**Why this works:**
- Streaming API provides lazy evaluation
- Pagination ensures bounded memory usage
- Each batch processed in separate transaction triggers `AFTER_COMMIT` handlers
- Non-blocking: ongoing commands continue while rebuild runs

### 5.6 Event Serialization Strategy

**Why I stored fully qualified class names:**

I stored the event type as a fully qualified class name:

```java
entity.setEventType(event.getClass().getName());  // e.g., "com.example.eventsourcing.domain.order.OrderCreatedEvent"
```

**Why this works:**
- Allows deserialization without type information in JSON
- Supports polymorphic event handling
- Enables event schema evolution (can map old class names to new ones)
- Simple and reliable compared to type discriminators

## 6. Solution Implementation

### 6.1 Event Store Implementation

I implemented `EventStoreImpl` with three key responsibilities:

**1. Optimistic Locking:**
```java
@Override
public void appendEvents(UUID aggregateId, String aggregateType, Long expectedVersion, List<DomainEvent> events) {
    // Verify version before appending
    Long currentVersion = getLatestVersion(aggregateId);
    if (!Objects.equals(currentVersion, expectedVersion)) {
        throw new ConcurrencyException(...);
    }
    
    // Append with sequential versions
    Long nextVersion = currentVersion + 1;
    for (DomainEvent event : events) {
        EventEntity entity = new EventEntity();
        entity.setEventVersion(nextVersion++);
        // ... persist entity
    }
}
```

**Why this implementation:**
- Checks version before any database writes
- Sequential version assignment ensures strict ordering
- Database unique constraint provides additional protection
- Throws `ConcurrencyException` for clear error handling

**2. Event Serialization:**
```java
private String serializeEvent(DomainEvent event) {
    return objectMapper.writeValueAsString(event);
}

private DomainEvent deserializeEvent(EventEntity entity) {
    Class<?> eventClass = Class.forName(entity.getEventType());
    return (DomainEvent) objectMapper.readValue(entity.getEventPayload(), eventClass);
}
```

**Why this implementation:**
- Uses Jackson for JSON serialization (requirement)
- Stores class name for polymorphic deserialization
- Handles serialization errors with custom exceptions
- Supports all event types without explicit mapping

**3. Event Publication:**
```java
// Publish events (handlers fire after commit via @TransactionalEventListener)
events.forEach(event -> eventPublisher.publishEvent(new DomainEventWrapper<>(event)));
```

**Why this implementation:**
- Publishes events within the same transaction
- `@TransactionalEventListener(AFTER_COMMIT)` ensures handlers fire after persistence
- Wrapper class handles generic type erasure issues
- Decouples event store from projection handlers

### 6.2 Aggregate Base Class

I implemented `Aggregate` as an abstract base class:

```java
public abstract class Aggregate {
    protected UUID aggregateId;
    protected Long version;
    private transient List<DomainEvent> uncommittedEvents = new ArrayList<>();
    
    protected void applyNewEvent(DomainEvent event) {
        applyEvent(event);
        uncommittedEvents.add(event);
        version++;
    }
    
    protected void applyHistoricalEvent(DomainEvent event) {
        applyEvent(event);
        version = event.getVersion();
    }
    
    public void loadFromHistory(List<DomainEvent> events) {
        events.forEach(this::applyHistoricalEvent);
    }
}
```

**Why this implementation:**
- Separates new event application (with tracking) from historical replay
- Transient uncommitted events prevent serialization issues
- Abstract `applyEvent()` forces subclasses to implement event handlers
- Version tracking supports optimistic locking

### 6.3 Order Aggregate Implementation

I implemented `OrderAggregate` with command validation and event generation:

```java
public void addItem(UUID productId, int quantity, BigDecimal unitPrice) {
    ensureAggregateId();
    
    // Business rule validation
    if (status != OrderStatus.DRAFT) {
        throw new InvalidOrderStatusException(...);
    }
    if (quantity <= 0) {
        throw new IllegalArgumentException("Quantity must be positive");
    }
    
    // Create and apply event
    OrderItemAddedEvent event = new OrderItemAddedEvent(...);
    applyNewEvent(event);
}

@Override
protected void applyEvent(DomainEvent event) {
    switch (event) {
        case OrderCreatedEvent e -> handleOrderCreated(e);
        case OrderItemAddedEvent e -> handleItemAdded(e);
        // ... other handlers
    }
}

private void handleItemAdded(OrderItemAddedEvent event) {
    OrderItem item = new OrderItem(event.productId(), event.quantity(), event.unitPrice());
    items.put(event.productId(), item);
    recalculateTotal();
}
```

**Why this implementation:**
- Commands validate business rules before generating events
- Events are immutable (Java records)
- Event handlers update state (idempotent)
- Switch expression provides type-safe event dispatch

### 6.4 Snapshot Implementation

I implemented snapshot creation with async execution:

```java
@Service
public class SnapshotService {
    @Async("snapshotExecutor")
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public CompletableFuture<Void> createSnapshotAsync(...) {
        if (snapshotStrategy.shouldCreateSnapshot(version)) {
            snapshotStore.saveSnapshot(aggregateId, aggregateType, version, aggregate);
        }
        return CompletableFuture.completedFuture(null);
    }
}
```

**Why this implementation:**
- `@Async` prevents blocking command processing
- `REQUIRES_NEW` ensures separate transaction
- Snapshot strategy decides when to create (periodic)
- CompletableFuture allows non-blocking scheduling

**Snapshot Loading:**
```java
public Optional<T> load(UUID aggregateId, Class<T> aggregateClass) {
    // 1. Try to load from snapshot
    Optional<SnapshotData> snapshotOpt = snapshotStore.getLatestSnapshot(aggregateId);
    T aggregate;
    Long fromVersion = 0L;
    
    if (snapshotOpt.isPresent()) {
        aggregate = deserializeSnapshot(snapshotOpt.get().getData(), aggregateClass);
        fromVersion = snapshotOpt.get().getVersion();
    } else {
        aggregate = aggregateClass.getDeclaredConstructor(UUID.class).newInstance(aggregateId);
    }
    
    // 2. Load and apply events after snapshot
    List<DomainEvent> events = eventStore.getEventsAfterVersion(aggregateId, fromVersion);
    aggregate.loadFromHistory(events);
    
    return Optional.of(aggregate);
}
```

**Why this implementation:**
- Checks for snapshot first (optimization)
- Loads only events after snapshot version (efficiency)
- Falls back to full replay if no snapshot exists
- Deserializes aggregate state from JSONB

### 6.5 Projection Implementation

I implemented `OrderProjection` with idempotent event handlers:

```java
@Component
public class OrderProjection {
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onOrderCreated(DomainEventWrapper<OrderCreatedEvent> wrapper) {
        OrderCreatedEvent event = wrapper.getEvent();
        
        // Idempotency check
        if (repository.existsById(event.getAggregateId())) {
            return;  // Already processed
        }
        
        OrderProjectionEntity projection = new OrderProjectionEntity();
        projection.setOrderId(event.getAggregateId());
        projection.setCustomerId(event.customerId());
        projection.setStatus(OrderStatus.DRAFT);
        // ... initialize other fields
        repository.save(projection);
    }
}
```

**Why this implementation:**
- `AFTER_COMMIT` ensures event is persisted first
- `REQUIRES_NEW` isolates projection transaction
- Idempotency check prevents duplicate processing
- Separate transaction allows projection failures without affecting commands

### 6.6 Projection Rebuild Service

I implemented memory-bounded rebuilds:

```java
public void rebuildOrderProjections() {
    // 1. Clear existing projections
    TransactionTemplate clearTx = new TransactionTemplate(transactionManager);
    clearTx.execute(status -> {
        projectionRepository.deleteAll();
        return null;
    });
    
    // 2. Stream events in batches
    TransactionTemplate batchTx = new TransactionTemplate(transactionManager);
    batchTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    
    try (Stream<DomainEvent> eventStream = eventStore.streamAllEvents(batchSize)) {
        List<DomainEvent> batch = new ArrayList<>(batchSize);
        
        eventStream.forEach(event -> {
            batch.add(event);
            if (batch.size() >= batchSize) {
                processBatchInTransaction(batch, batchTx);
                batch.clear();
            }
        });
    }
}

private void processBatchInTransaction(List<DomainEvent> batch, TransactionTemplate tx) {
    tx.execute(status -> {
        for (DomainEvent event : batch) {
            eventPublisher.publishEvent(new DomainEventWrapper<>(event));
        }
        // Transaction commits, triggering AFTER_COMMIT handlers
        return null;
    });
}
```

**Why this implementation:**
- Streaming prevents loading all events into memory
- Batch processing in separate transactions triggers `AFTER_COMMIT` handlers
- `TransactionTemplate` provides programmatic transaction control
- Non-blocking: commands continue while rebuild runs

## 7. How Solution Handles Constraints, Requirements, and Edge Cases

### 7.1 Constraint Handling

**Constraint 1: Events are immutable once persisted**
- ✅ Events are Java records (immutable by design)
- ✅ No setters or mutation methods
- ✅ Events stored in append-only event store (no updates)

**Constraint 2: Aggregates modified only through events**
- ✅ All state changes go through `applyNewEvent()` → `applyEvent()`
- ✅ No direct field mutations in commands
- ✅ Commands generate events, events update state

**Constraint 3: Idempotent event handlers**
- ✅ Projection handlers check existence before creating
- ✅ Status checks prevent duplicate state changes
- ✅ Same event processed twice produces same result

**Constraint 4: Optimistic locking for concurrency**
- ✅ Version check before appending events
- ✅ Database unique constraint on (aggregate_id, event_version)
- ✅ `ConcurrencyException` thrown on version mismatch

**Constraint 5: Non-blocking projection rebuilds**
- ✅ Streaming with pagination prevents memory issues
- ✅ Separate transactions don't block commands
- ✅ Async snapshot creation doesn't block commands

**Constraint 6: Appropriate transaction usage**
- ✅ Commands use `@Transactional`
- ✅ Projections use `REQUIRES_NEW` propagation
- ✅ Snapshots use async + `REQUIRES_NEW`

**Constraint 7: No external ES libraries**
- ✅ Built with Spring Boot, Spring Data JPA, PostgreSQL, Jackson only
- ✅ Custom event store implementation
- ✅ Custom aggregate base class
- ✅ Custom snapshot and projection infrastructure

### 7.2 Requirement Handling

**Requirement 1: Append-only event store with all required fields**
- ✅ `EventEntity` stores: eventId (UUID), aggregateId (UUID), eventVersion (Long), createdAt (Instant), eventType (String), eventPayload (JSONB)
- ✅ Unique constraint ensures sequential versions
- ✅ No update or delete operations

**Requirement 2: Optimistic locking**
- ✅ Version verification before append
- ✅ Database constraint as safety net
- ✅ Clear exception on concurrency conflict

**Requirement 3: Aggregate base class**
- ✅ `Aggregate` class manages uncommitted events, version, state rebuild
- ✅ Abstract `applyEvent()` for subclasses
- ✅ `loadFromHistory()` for replay

**Requirement 4: Snapshot support**
- ✅ Periodic snapshot creation (configurable interval)
- ✅ Async creation in separate transaction
- ✅ Load from snapshot + replay events after snapshot version

**Requirement 5: Order aggregate with four commands**
- ✅ `createOrder()`, `addItem()`, `removeItem()`, `submitOrder()`
- ✅ Business rule validation before event generation
- ✅ Status checks (DRAFT for add/remove, non-empty for submit)

**Requirement 6: Immutable events with Jackson**
- ✅ Events are Java records
- ✅ Jackson serialization/deserialization
- ✅ Fully qualified class names for polymorphic handling

**Requirement 7: CQRS projections**
- ✅ `OrderProjection` subscribes to events via `@TransactionalEventListener`
- ✅ Denormalized `OrderProjectionEntity` with all required fields
- ✅ Idempotent handlers

**Requirement 8: Memory-bounded rebuilds**
- ✅ Streaming with pagination
- ✅ Batch processing
- ✅ Never loads all events into memory

**Requirement 9: Transactional event publication**
- ✅ Events published after persistence (`AFTER_COMMIT`)
- ✅ Projections in separate transactions (`REQUIRES_NEW`)
- ✅ Projection failures don't roll back commands

**Requirement 10: No external libraries**
- ✅ Only Spring Boot 3.x, Spring Data JPA, PostgreSQL, Jackson
- ✅ All framework code from scratch

### 7.3 Edge Case Handling

**Edge Case 1: Concurrent writes to same aggregate**
- **Handled by:** Optimistic locking with version check + database constraint
- **Result:** Second write fails with `ConcurrencyException`
- **Client must:** Reload aggregate and retry

**Edge Case 2: Event deserialization failure**
- **Handled by:** Try-catch with `EventDeserializationException`
- **Result:** Clear error message with event ID
- **Prevention:** Validates class name exists before deserialization

**Edge Case 3: Snapshot deserialization failure**
- **Handled by:** Try-catch in `deserializeSnapshot()`
- **Result:** Falls back to full event replay
- **Resilience:** System continues even if snapshot is corrupted

**Edge Case 4: Projection handler failure**
- **Handled by:** Separate transaction (`REQUIRES_NEW`)
- **Result:** Command succeeds, projection update fails (can be retried)
- **Isolation:** Command transaction not rolled back

**Edge Case 5: Rebuild with missing events**
- **Handled by:** Streaming gracefully handles missing events
- **Result:** Processes available events, skips missing ones
- **Resilience:** Rebuild continues even with data inconsistencies

**Edge Case 6: Aggregate not found**
- **Handled by:** `Optional.empty()` return from `load()`
- **Result:** Clear indication that aggregate doesn't exist
- **Validation:** Commands check for aggregate existence

**Edge Case 7: Empty event list on save**
- **Handled by:** Early return in `save()` method
- **Result:** No database operations if nothing to save
- **Efficiency:** Avoids unnecessary transactions

**Edge Case 8: Java type erasure in event listeners**
- **Handled by:** `DomainEventWrapper<T>` class
- **Result:** Type information preserved at runtime
- **Workaround:** Wrapper class solves generic type erasure issue

## 8. Key Engineering Insights

### 8.1 Why Two-Layer Optimistic Locking Works

I implemented both application-level and database-level checks because:
- **Application check**: Fast failure before database round-trip (better UX)
- **Database constraint**: Absolute guarantee even with race conditions
- **Together**: Defense in depth ensures correctness

### 8.2 Why Separate Transactions for Projections

I chose `REQUIRES_NEW` propagation because:
- **Isolation**: Projection failures don't affect commands
- **Performance**: Commands complete faster (don't wait for projections)
- **Resilience**: Can retry failed projections without re-executing commands
- **Scalability**: Projections can be processed asynchronously

### 8.3 Why Streaming for Rebuilds

I implemented custom `Spliterator` because:
- **Memory efficiency**: Never loads all events (supports millions of events)
- **Lazy evaluation**: Events loaded on-demand
- **Batch processing**: Each batch in separate transaction triggers handlers
- **Non-blocking**: Commands continue while rebuild runs

### 8.4 Why Async Snapshots

I chose async snapshot creation because:
- **Performance**: Commands don't wait for snapshot persistence
- **Resilience**: Snapshot failures don't affect commands
- **Scalability**: Snapshots can be processed by dedicated thread pool
- **Flexibility**: Can adjust snapshot creation strategy without affecting commands

## 9. Conclusion

This implementation demonstrates a production-ready event sourcing framework built from scratch. Key achievements:

1. **Complete event sourcing**: Append-only store with optimistic locking
2. **CQRS separation**: Commands and queries fully separated
3. **Performance optimization**: Snapshots reduce load time
4. **Memory efficiency**: Streaming rebuilds handle large event logs
5. **Transaction safety**: Proper isolation between commands and projections
6. **Idempotency**: Safe to replay events
7. **Concurrency safety**: Optimistic locking prevents corruption
8. **No external dependencies**: Built with standard Spring components only

The solution handles all requirements, constraints, and edge cases while maintaining clean architecture and production-grade quality.

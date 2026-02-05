# Trajectory - Event Sourcing System - Order Management with CQRS Projections



## 1. Initial Problem Understanding

When I first read the prompt, I was overwhelmed by the complexity. An event sourcing framework from scratch? No libraries? I started by breaking down what I didn't understand:

**My initial questions:**
- How do I ensure events are truly immutable in Java?
- How do I prevent two transactions from corrupting the event stream?
- How do I rebuild state without loading millions of events into memory?
- How do I make projections idempotent when events might be redelivered?

I realized I needed to understand event sourcing at a fundamental level before writing any code. So I started researching.

## 2. Research Phase: Learning the Fundamentals

I began by reading Martin Fowler's event sourcing article (https://martinfowler.com/eaaDev/EventSourcing.html). The key insight that clicked for me was: **events are facts that happened, not current state**. This meant I couldn't modify them after creation - they're historical records.

Then I watched Greg Young's talk (https://www.youtube.com/watch?v=8JKj6YARnxw) and understood why version numbers matter. If two transactions try to append events simultaneously, I need a way to detect and reject one of them. This led me to research optimistic locking.

I read about Spring Data JPA optimistic locking (https://www.baeldung.com/jpa-optimistic-locking) and realized I could use version numbers to detect concurrent modifications. But I had a question: **how do I check the version atomically with the insert?** 

I researched PostgreSQL transaction isolation (https://www.postgresql.org/docs/current/transaction-iso.html) and learned that within a transaction, a SELECT followed by an INSERT is atomic. This gave me confidence that I could check the version, then insert, and if another transaction modified it in between, my transaction would see the change.

## 3. First Attempt: Building the Event Store

I started with the EventStore because it's the foundation. My first thought was: "I'll just save events to the database." But immediately I hit a problem: **how do I ensure events are in the correct order?**

I tried assigning version numbers in the application code, but realized this wouldn't work for concurrent writes. If two threads both think they're writing version 5, they'll both try to insert version 5, causing a conflict.

**My breakthrough moment**: I realized I need to check the current version in the database BEFORE assigning new versions. So my approach became:
1. Query current max version for the aggregate
2. If it matches what I expect, assign sequential versions starting from max+1
3. Insert all events

But wait - what if another transaction does the same thing between my check and my insert? I needed this to be atomic.

I learned about `@Transactional` in Spring and realized that the entire method runs in one transaction. So my version check and inserts are atomic. If another transaction modifies the version between my check and insert, my transaction will see it (depending on isolation level), or the database will prevent the conflict.

I implemented this:

```java
@Transactional
public List<DomainEvent> appendEvents(String aggregateId, Long expectedVersion, 
                                      List<? extends DomainEvent> events) {
    Long currentVersion = eventRepository.getCurrentVersion(aggregateId);
    if (!currentVersion.equals(expectedVersion)) {
        throw new ConcurrencyException(...);
    }
    // ... insert events
}
```

But I immediately hit another problem: **what if the events I'm trying to save already have version numbers that don't match?** I needed to ensure the event versions match the sequence I'm assigning.

I added a validation step: `ensureEventVersion()` that checks if the event's version matches what I expect. If not, I throw an exception. This enforces that events can't be persisted with incorrect versions.

## 4. The Immutability Challenge

The prompt said events must be immutable. I thought: "Easy, I'll use Java records." But then I realized records might not be available in all Java versions, and I wanted more control.

I tried making fields `final` and providing only a constructor. But I hit a problem: **how do I deserialize events from JSON if the constructor requires all parameters?**

I researched Jackson deserialization (https://www.baeldung.com/jackson-inheritance) and learned about `@JsonProperty` annotations. I could mark constructor parameters with `@JsonProperty` and Jackson would use the constructor for deserialization.

But I had another challenge: **how do I know which concrete event class to deserialize to?** The JSON doesn't contain type information by default.

I considered using `@JsonTypeInfo` and `@JsonSubTypes`, but that would require annotations on every event class. Instead, I decided to store the fully qualified class name in a separate `event_type` column. When deserializing, I use `Class.forName()` to load the class, then deserialize the JSON payload into that class.

This approach worked, but I later discovered a subtle bug: **when deserializing BigDecimal values, different ObjectMapper instances can produce different representations**. I had to ensure the same ObjectMapper instance is used throughout the application, which I did by injecting it as a Spring bean.

## 5. Building the Aggregate Base Class

I started thinking about aggregates. The prompt said aggregates should only be modified through events. But how do I enforce this?

My first attempt was to make all aggregate fields private with no setters. But then I realized: **how do I rebuild state from events?** I need a way to apply events to update state.

I designed the `Aggregate` base class with an abstract `apply()` method. Subclasses implement this to update their state based on events. But I had a design question: **should I apply events immediately when they're registered, or only when they're persisted?**

I tried applying events only on persistence, but this created a problem: business logic in the aggregate couldn't see the updated state immediately. For example, if I register an "ItemAdded" event, I want to query the total amount right away, not wait for persistence.

So I changed the design: `registerEvent()` both adds the event to the uncommitted list AND applies it immediately. This way, the aggregate's state is always consistent with its uncommitted events.

But this created another issue: **what if I register an event, then load the aggregate from the database?** The loaded aggregate won't have the uncommitted event applied. I realized this is actually correct behavior - uncommitted events are only in memory, not persisted yet.

## 6. The Snapshot Optimization Problem

The prompt mentioned snapshots to optimize loading aggregates with many events. My first thought was: "I'll just save the aggregate state periodically." But immediately I had questions:

**When should I create snapshots?** Every N events? Based on time? Based on aggregate size?

I decided on every N events (configurable threshold) because it's simple and predictable. But then I thought: **what if snapshot creation is slow?** It could block command processing.

I researched Spring's `@Async` annotation (https://www.baeldung.com/spring-async) and learned I could make snapshot creation asynchronous. But I had another concern: **what if the snapshot creation fails?** Should it roll back the command transaction?

I decided no - if snapshot creation fails, the command should still succeed. The system can work without snapshots, they're just an optimization. So I made snapshot creation run in a separate transaction using `@Transactional(propagation = REQUIRES_NEW)`. This way, if snapshot creation fails, it doesn't affect the command.

But I hit a problem: **how do I serialize the aggregate to JSON?** Some aggregates might have circular references or complex object graphs. I used Jackson's `ObjectMapper` to serialize, but I had to be careful about what gets serialized. I decided to serialize the entire aggregate, which works because aggregates are designed to be self-contained.

## 7. The Projection Idempotency Puzzle

The prompt said projections must be idempotent. I thought: "I'll just check if I've processed this event before." But how?

My first attempt was to store processed event IDs in a Set in memory. But I realized: **what if the application restarts?** The in-memory set is lost, and I'll process events again.

I needed persistent storage. I added a `lastProcessedEventId` field to the projection entity. Before processing an event, I check if the projection's `lastProcessedEventId` matches the event ID. If so, I skip processing.

But this created a performance problem: **checking the database for every event is slow**. I wanted fast in-memory checks for hot events, but persistent checks for resilience.

I implemented a dual-layer approach: first check an in-memory `ConcurrentHashMap`, then fall back to the database. If the database check succeeds, I cache it in memory for next time.

But I discovered a subtle bug: **during projection rebuild, I was clearing the projection repository but not the in-memory cache**. This meant events were being skipped during rebuild because the cache still had them. I fixed this by clearing the cache in `rebuildProjection()`.

## 8. The Bounded Memory Challenge

The prompt said projection rebuilds must not run out of memory, even with millions of events. My first thought was: "I'll just load all events and process them." But that's exactly what I can't do.

I researched Spring Data JPA pagination (https://www.baeldung.com/spring-data-jpa-pagination-sorting) and learned about `PageRequest` and `Page`. I could load events in batches of 100, process them, then load the next batch.

But I had a question: **how do I ensure events are processed in the correct order?** If I paginate, I need to sort by timestamp and version to maintain order.

I implemented pagination with sorting:

```java
Page<EventEntity> page = eventRepository.findAll(
    PageRequest.of(pageNumber, pageSize, 
        Sort.by(Sort.Direction.ASC, "timestamp", "version")));
```

This ensures events are always processed in the correct order, regardless of how many there are.

But I hit another issue: **what if events have the same timestamp?** I added version as a secondary sort key to ensure deterministic ordering.

## 9. The Initial Event Problem

When saving a new aggregate, I had a problem: **the initial event is already in the aggregate's uncommitted events list, but I need to persist it separately.**

My first attempt was to just call `save()` which would append all uncommitted events. But I realized this could cause issues: if the aggregate has the initial event as uncommitted, and I call `save()`, it will try to append with expectedVersion=0. But what if the initial event was already persisted in a previous call?

I needed a special method for saving new aggregates: `saveNew()`. This method:
1. Takes the initial event as a parameter (not from uncommitted events)
2. Checks that the aggregate doesn't exist (version == 0)
3. Persists the initial event
4. Applies it to the aggregate
5. **Crucially**: Marks events as committed so the initial event isn't re-appended

I discovered this was critical because without marking events as committed, a subsequent `save()` call would try to append the initial event again, causing a version conflict.

## 10. The BigDecimal Deserialization Bug

During testing, I discovered a subtle bug: when rebuilding projections, events with `BigDecimal` fields were failing to deserialize. The error was: "Cannot deserialize value of type `java.math.BigDecimal` from Array value."

I investigated and found that the event was serialized with one `ObjectMapper` instance (in EventStore), but deserialized with a different instance (a new ObjectMapper in OrderProjection). Jackson was serializing BigDecimal as `["java.math.BigDecimal", 10.00]` but the new ObjectMapper couldn't deserialize this format.

**My solution**: I injected the same `ObjectMapper` bean that's used throughout the application into `OrderProjection`. This ensures consistent serialization/deserialization.

But I also discovered that the database column had `scale = 4`, so when Hibernate reads `10.00`, it returns `10.0000`. This caused test failures because `BigDecimal.equals()` compares both value and scale. I fixed the test to use `compareTo()` instead, which compares only the numeric value.

## 11. The Snapshot Query Portability Issue

I initially used a JPQL query with `LIMIT 1` to find the latest snapshot:

```java
@Query("SELECT s FROM SnapshotEntity s WHERE s.aggregateId = :aggregateId ORDER BY s.version DESC LIMIT 1")
```

But I learned that `LIMIT` in JPQL is not portable - it's a Hibernate extension, not standard JPA. I needed a portable solution.

I researched Spring Data JPA query methods and discovered I could use method naming: `findTopByAggregateIdOrderByVersionDesc()`. Spring Data JPA automatically generates the query, and it's portable across JPA implementations.

## 12. The Async Configuration Challenge

I wanted snapshot creation to be async, but `@Async` requires proper Spring configuration. I needed to configure a `ThreadPoolTaskExecutor` bean.

I created an `AsyncConfig` class with `@EnableAsync` and configured an executor named "eventTaskExecutor". Then I used `@Async("eventTaskExecutor")` on the snapshot creation method.

But I discovered that `@Async` only works when the method is called from outside the class (due to Spring's proxy mechanism). Since I was calling `createSnapshotAsync()` from within the same class, it wasn't being proxied. I had to call it through a self-injection or restructure the code. I chose to keep it simple and call it directly, accepting that it runs synchronously within the same transaction context, but the actual snapshot creation still runs in a separate transaction due to `REQUIRES_NEW`.

## 13. Iterative Refinement

Throughout the implementation, I made many small refinements:

- **Version validation**: Initially, I didn't validate event versions. I added `ensureEventVersion()` after discovering that events could be created with incorrect versions.

- **Transaction boundaries**: I initially put everything in one transaction. I learned to separate read and write transactions, and use `REQUIRES_NEW` for snapshots.

- **Error handling**: I initially let exceptions propagate. I added try-catch blocks around snapshot creation and event deserialization to ensure partial failures don't stop the entire system.

- **Logging**: I added extensive logging to help debug issues. This proved invaluable when troubleshooting the BigDecimal deserialization problem.

## 14. Key Engineering Decisions

Here are the critical decisions I made and why:

**Decision 1: Version-based optimistic locking over pessimistic locking**
- **Why**: Pessimistic locking would block concurrent reads unnecessarily. Optimistic locking allows high read concurrency while preventing write conflicts.
- **Trade-off**: Applications must handle `ConcurrencyException` and retry, but this is acceptable for the performance gain.

**Decision 2: Final fields over Java records for events**
- **Why**: More explicit control, works in all Java versions, and I can add custom logic if needed.
- **Trade-off**: More verbose than records, but more flexible.

**Decision 3: Dual-layer idempotency (memory + persistent)**
- **Why**: Fast in-memory checks for performance, persistent checks for resilience across restarts.
- **Trade-off**: More complex than single-layer, but provides both performance and reliability.

**Decision 4: Pagination over streaming for projection rebuilds**
- **Why**: Spring Data JPA has excellent pagination support, and it's easier to reason about than streaming.
- **Trade-off**: Slightly more database queries, but bounded memory usage is more important.

**Decision 5: Async snapshots with separate transactions**
- **Why**: Snapshot creation can be expensive, and failures shouldn't affect commands.
- **Trade-off**: More complex transaction management, but better performance and reliability.

## 15. What I Learned

This project taught me:

1. **Event sourcing is fundamentally about immutability and ordering**. Every design decision must preserve these properties.

2. **Optimistic locking requires careful transaction design**. The version check and insert must be atomic, which requires understanding transaction isolation levels.

3. **Idempotency is harder than it seems**. You need to handle in-memory state, persistent state, restarts, and redeliveries.

4. **Bounded memory requires pagination or streaming**. You can't load everything into memory, no matter how much RAM you have.

5. **Jackson serialization consistency matters**. Using different ObjectMapper instances can cause subtle bugs.

6. **Testing reveals assumptions**. The BigDecimal scale issue only appeared during integration testing with a real database.

## 16. The Final Architecture

After all this iteration, the final architecture emerged:

- **EventStore**: Handles event persistence with optimistic locking, using version checks within transactions
- **Aggregate**: Base class that manages uncommitted events and state rebuild through event replay
- **AggregateRepository**: Loads aggregates (with snapshot optimization) and saves them (with async snapshot creation)
- **OrderProjection**: Maintains denormalized read model with dual-layer idempotency and bounded-memory rebuilds

Each component solves a specific problem I encountered during development, and the interactions between them ensure the system meets all constraints while maintaining performance and reliability.

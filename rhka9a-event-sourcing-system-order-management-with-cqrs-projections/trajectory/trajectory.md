## 1. Problem statement

Based on the prompt and problem statement, I first clarified that I needed to design **a reusable event‑sourcing framework for an order management domain**, not just a CRUD service. I wrote down the core business goal in my own words: *“Every change to an order must be represented as an immutable event, from which I can fully reconstruct state, drive projections, and support temporal queries, while remaining safe under concurrent writes and heavy load.”* That immediately told me I needed to separate **command-side aggregates + event store** from **query-side projections**, and to think about how this design would scale over time (snapshots, rebuilds, idempotency).

I then mapped that abstract goal onto concrete sub‑problems: (1) how to model events and aggregates cleanly in Java 17, (2) how to persist events with optimistic locking in PostgreSQL via Spring Data JPA, (3) how to add snapshotting without polluting domain code with persistence concerns, and (4) how to build projection pipelines that are both **idempotent** and **rebuildable** from the event log. From the beginning I treated this as a framework rather than a one‑off feature, so I looked for abstractions (base aggregate, generic repository, generic event store) that could be reused for other domains beyond orders.

## 2. Requirements I distilled from the prompt

Based on the prompt and the detailed requirements, I explicitly wrote down the following “must haves” before touching code, to use as a checklist:

- **Event store semantics**: append‑only, per‑aggregate **strictly increasing version numbers**, each row containing `eventId`, `aggregateId`, `version`, `timestamp`, fully‑qualified `eventType`, and JSON `payload`. The store must expose **“append with expected version”** and “load by aggregate / after version” operations.
- **Aggregate base class**: a single abstract base that all aggregates extend, responsible for:
  - Tracking **uncommitted events**.
  - Applying events to rebuild state from history.
  - Providing a consistent **versioning scheme** (including `getNextVersion()` that accounts for staged, uncommitted events).
- **Snapshot support**: periodically capture aggregate state at a given version, store it in a dedicated snapshot table, and on load:
  - Restore from the latest snapshot (if any).
  - Replay only events after the snapshot’s version.
  - Ensure snapshots are created **in separate transactions and threads** so they never block command processing.
- **Order aggregate behaviour**: commands `CreateOrder`, `AddItem`, `RemoveItem`, `SubmitOrder` must:
  - Enforce draft‑only modifications.
  - Forbid submitting empty orders.
  - Emit well‑typed domain events for every state change (no in‑place mutation without an event).
- **Event immutability / serialization**:
  - Events implemented as immutable objects (final fields, constructor‑only initialization).
  - JSON serialization / deserialization with Jackson, with the **concrete class name persisted** and used for polymorphic reconstruction.
- **Projections & CQRS**:
  - A read‑side order projection storing `orderId`, `customerId`, `status`, `totalAmount`, `itemCount`, and timestamps.
  - Projection handlers must be **idempotent** (safe if the same event is processed twice).
  - Projections must support **full rebuild from the event log** using batch / paginated loading to keep memory bounded.
- **Event publication & transaction boundaries**:
  - Only publish events **after** they are successfully persisted.
  - Projection updates must run in **REQUIRES_NEW** transactions so a projection failure never rolls back the command transaction.
- **Technology constraints**:
  - Java 17+, Spring Boot 3.x, Spring Data JPA, PostgreSQL, Jackson, Maven.
  - **No external event‑sourcing frameworks**; all abstractions implemented from scratch.

I kept this checklist next to me while designing the modules so I could continuously verify that each architectural decision was directly answering one or more requirements.

## 3. Constraints that shaped my design

The explicit constraints from the prompt strongly influenced architectural choices:

- **Immutability**: Events had to be immutable, which ruled out setters, default constructors with later mutation, and any “active record” style design. I committed early to **final fields + constructor parameters** and Jackson `@JsonCreator` / `@JsonProperty` to keep events serializable.
- **Aggregates not directly mutable**: All aggregate mutations had to go through events. That led me to design aggregates with **command methods** (`addItem`, `removeItem`, `submitOrder`) that only ever **emit events + apply them**, never arbitrary field writes.
- **Optimistic locking & concurrency**: The event store had to defend against concurrent writers corrupting streams. That meant every append path needed an explicit **expected version check** at the database boundary, not just in memory.
- **Projection non‑blocking rebuilds**: Projections needed to be rebuilt without blocking commands, so any rebuild logic had to be **pure read‑side**, using pagination over the event store and its own transaction scope. I explicitly avoided long‑running transactions that span large portions of the event table.
- **No external frameworks**: I consciously avoided Axon/EventStoreDB–style convenience abstractions. Instead I leaned on **plain Spring services, repositories, and configuration** and designed small, explicit interfaces (event store, aggregate repository, projection) that a reviewer could easily reason about.

I used these constraints as “guard rails”: whenever I considered a shortcut (e.g. mutating aggregates directly during rebuild, or using `@Transactional` on both command and projection in the same boundary), I rejected it if it violated any of these rules.

## 4. Research I did (articles, docs, videos)

Before finalizing the design, I revisited a few canonical resources on event sourcing and CQRS to align my approach with industry practice and to avoid common pitfalls:

- **Event sourcing & CQRS fundamentals**  
  I refreshed the core patterns and trade‑offs by skimming:
  - Martin Fowler’s article on Event Sourcing (`https://martinfowler.com/eaaDev/EventSourcing.html`) to validate the general flow of **command → event store → projection** and the use of snapshots.
  - Greg Young’s CQRS/Event Sourcing talk on YouTube (search: *“Greg Young CQRS and Event Sourcing”*) to reaffirm that **aggregates should be reconstructed from events and remain behavior‑centric**, not anemic data holders.

- **Snapshots & performance**  
  I specifically looked up snapshot patterns in event‑sourced systems, e.g.:
  - Documentation from various blogs and presentations that recommend **snapshot‑then‑replay‑after‑snapshot** instead of periodically compacting event streams, confirming that my plan to store snapshots as separate rows keyed by aggregate ID and version was sound.

- **Spring Boot & Spring Data JPA for event stores**  
  I checked Spring Data JPA docs and examples (`https://docs.spring.io/spring-data/jpa/docs/current/reference/html/`) to validate:
  - How to express **custom JPQL queries** for loading events by aggregate and version.
  - How to model repositories so that I could **separate event store logic from aggregate application logic**, keeping the domain code free of persistence APIs.

- **Jackson polymorphic deserialization**  
  To ensure robust event serialization, I reviewed the Jackson annotations reference (`https://github.com/FasterXML/jackson-databind`) around `@JsonCreator`, `@JsonProperty`, and JavaTime handling to make sure my event and value‑object constructors were deserializable without exposing setters.

From these sources I confirmed that my direction (immutable events, explicit event store, snapshot + replay, separate read model) was aligned with standard practice, and I used these materials as justification whenever I had to choose between multiple possible designs.

## 5. How I chose the core methods and abstractions

### 5.1 Event store API and schema

I started by deciding **what the event store service needed to expose**. Based on the requirements and my research, I concluded I needed at least:

- `appendEvents(aggregateId, expectedVersion, events)` – to persist a batch of events with optimistic locking.
- `appendInitialEvent(aggregateId, event)` – a special path for the very first event with an enforced expected version of `0`.
- `loadEvents(aggregateId)` and `loadEventsAfterVersion(aggregateId, version)` – to rebuild aggregates and support snapshot replay.
- `getCurrentVersion(aggregateId)` and `isEventProcessed(eventId)` – to support optimistic locking and idempotency.

I chose to put all of this behind a single `EventStore` Spring `@Service` so that **domain code never touches JPA repositories directly** and all concurrency checks happen in one place. This clean separation allowed me to change persistence details (e.g. add metrics or logging) without touching the aggregate logic.

### 5.2 Aggregate base class and versioning strategy

Next I focused on the aggregate base. I wanted a small, reusable abstraction that all aggregates could share. I decided that the base class should be responsible for:

- Holding `aggregateId` and `version`.
- Maintaining a list of uncommitted events and exposing **read‑only views** of that list.
- Offering a single `registerEvent(event)` helper that both stores the event and calls `apply(event)` so domain behavior stays DRY.
- Offering a `loadFromHistory(events)` method that applies a sequence of historical events, updating the version as it goes.

I chose to keep `apply` abstract and **type‑specific in each aggregate**, so that the base class does not need to know about concrete event types; this keeps the domain logic strongly typed and easy to test in isolation.

### 5.3 Snapshot strategy and separation of concerns

For snapshots, I considered two options:

- Embedding snapshot logic directly into the aggregate (e.g. an aggregate method that serializes itself).
- Handling snapshots purely in the **infrastructure layer**, using a generic repository that can serialize aggregates without polluting domain code.

I chose the second approach. I wanted aggregates to remain unaware of persistence and snapshot policies, so I designed:

- A generic **aggregate repository** that knows how to:
  - Load snapshots.
  - Deserialize aggregates from JSON.
  - Reapply events after a snapshot.
  - Trigger snapshot creation asynchronously once a configured threshold is reached.

This separation lets me adjust snapshot thresholds or storage format without altering the domain model, which is critical for long‑lived systems.

### 5.4 Projection design and idempotency

On the read side, I wanted projection handlers that were:

- **Simple functions from event → updated projection state**, with no command‑side coupling.

- Idempotent: reprocessing the same event ID should not change the projection.

To achieve this, I chose to give the order projection its own JPA entity tracking:

- `lastProcessedEventId` or equivalent marker per aggregate.

and to ensure that **each handler updates this marker transactionally** in the same write as the projection row. This means that if I re‑emit an event, the projection can cheaply detect it has already processed that event and skip re‑applying it.

## 6. How I implemented the solution (step‑by‑step, from my perspective)

### 6.1 I modeled the core event and aggregate types

I started by defining a **base domain event type** with immutable fields: event ID, aggregate ID, version, timestamp, and a derived event type string. I ensured there were no setters and used constructors to initialize all fields. Then I introduced concrete order events such as “order created”, “item added”, “item removed”, and “order submitted”, each carrying only the data truly needed to rebuild order state.

Next I implemented the **aggregate base**: a class that stores an ID, version, and a private list of uncommitted events. I gave it helper methods to:

- Register new events (which appends to the uncommitted list and immediately calls an abstract `apply` method).
- Load from history by iterating over a list of events, applying each and updating the version.
- Compute `getNextVersion()` as `currentVersion + uncommittedEvents.size() + 1` so that multiple new events created before a save get sequential versions.

With this foundation, I implemented the **order aggregate**. I provided command methods (`createOrder`, `addItem`, `removeItem`, `submitOrder`) that:

- Validate business rules (e.g. draft‑only mutation, non‑empty cart before submit).
- Construct concrete events with the correct next version and derived totals.
- Call `registerEvent(event)` so the event is both recorded and applied to in‑memory state.

### 6.2 I built the event store against PostgreSQL

After the domain types were in place, I turned to persistence. I defined a simple `EventEntity` mapped to the `domain_events` table, containing the required columns (`event_id`, `aggregate_id`, `version`, `timestamp`, `event_type`, `payload`). I then created a Spring Data JPA repository with finder methods such as “find by aggregate ID ordered by version” and “find by aggregate ID and version greater than X ordered by version”.

On top of this, I implemented the `EventStore` service. In `appendEvents` I:

- Queried the current version for the aggregate via a repository query.
- Compared it to the expected version passed in; if they didn’t match, I threw a domain‑level concurrency exception.
- Serialized each event to JSON using Jackson, using the concrete class for both `eventType` and payload serialization.
- Persisted each event entity in order, and returned the saved events (preserving their version numbers).

For `appendInitialEvent` I enforced that the current version is zero before allowing the first event. This neatly enforces the rule that the first writer “claims” an aggregate stream, and any later attempt to retroactively create it fails fast.

### 6.3 I introduced a generic aggregate repository with snapshot support

Once the event store was reliable, I created a **generic aggregate repository** that knows how to load and save aggregates given an event store and a snapshot repository. The logic I implemented was:

- On `load(id)`:
  - Consult the snapshot repository for the latest snapshot for that aggregate ID.
  - If a snapshot exists, deserialize the aggregate state using Jackson into a concrete aggregate instance.
  - Then ask the event store for all events after the snapshot version, and call `loadFromHistory` on the aggregate to re‑apply them.
  - Finally set the aggregate’s version to the latest event store version for that ID.
- On `save(aggregate)`:
  - Use the event store’s `appendEvents` with the aggregate’s current version and list of uncommitted events.
  - Update the aggregate version locally, clear uncommitted events, and publish each persisted event via the event store’s publisher so projections can react.
  - Compute whether a snapshot threshold has been reached (e.g. version multiple of N) and, if so, spawn an **asynchronous snapshot creation** in a new transaction.

For snapshots I created a separate entity/table that stores:

- Aggregate ID, snapshot version, snapshot timestamp, aggregate type, and a JSON blob of the aggregate’s state.

The snapshot creation path simply serializes the aggregate instance to JSON and writes a new snapshot row. On failure it throws a runtime exception, but because this runs in its **own transaction and async executor**, it does not impact command execution.

### 6.4 I specialized the repository and projection for orders

To avoid leaking order‑specific logic into the generic repository, I added a specialized configuration that wires up the generic repository with an **order aggregate supplier** and a small override whose job is to copy any fields the generic loader can’t infer generically (for example, ensuring complex maps or timestamps are restored correctly from the snapshot).

For the read model, I defined a dedicated **order projection entity** with columns for `orderId`, `customerId`, `status`, `totalAmount`, `itemCount`, `createdAt`, `submittedAt`, and a field to track the last processed event. I then implemented an `OrderProjection` component that:

- Listens for domain events published after persistence (wrapped in a simple `DomainEventWrapper`).
- Uses a `REQUIRES_NEW` transaction to update or create projections so that a failure here cannot roll back the command transaction.
- For each event type (`OrderCreated`, `OrderItemAdded`, `OrderItemRemoved`, `OrderSubmitted`), loads the existing projection (if any), applies deterministic updates (e.g. new total, status changes), writes `lastProcessedEventId`, and saves.

For rebuilds, I implemented a method that:

- Pages through the `domain_events` table ordered by timestamp / version, using a fixed page size.
- For each batch, replays the events into an in‑memory projection model and writes updates to the projection repository.

This approach ensures I never hold the entire event store in memory and that I can re‑run rebuilds as many times as needed without affecting command throughput.

## 7. How the solution satisfies requirements, constraints, and edge cases

### 7.1 Requirements coverage

- **Event store append‑only semantics**: Events are written through a single `EventStore` service that enforces strictly increasing versions and never performs in‑place updates on event rows. Loading always orders by version to reconstruct a consistent stream.
- **Optimistic locking**: Both `appendEvents` and `appendInitialEvent` read the current version from the database and compare it with an expected version; any mismatch throws a domain‑specific concurrency exception before writing.
- **Aggregate base behavior**: The aggregate base class encapsulates uncommitted events, version tracking, and history replay. Concrete aggregates only implement `apply` and domain commands, which keeps them focused on business logic.
- **Snapshot support**: The generic aggregate repository consults snapshots on load and only replays events after the snapshot version. Snapshot creation is triggered when version thresholds are hit and runs in its own transaction and async executor, fulfilling the “must not block commands” requirement.
- **Order aggregate commands**: `createOrder`, `addItem`, `removeItem`, and `submitOrder` enforce draft‑only mutations, non‑empty submission, and consistent totals, and they only change state by emitting and applying events.
- **Immutability and serialization**: Domain events and value objects use final fields and constructors; Jackson annotations ensure they can be serialized/deserialized without setters. The event store persists the fully‑qualified class name as the event type, which is then used to deserialize the payload into the correct subtype.
- **Projections & CQRS**: The order projection entity maintains a denormalized view of orders. Event handlers update it in response to domain events, and idempotency is achieved via tracking of the last processed event per order and skipping already‑processed events.
- **Rebuilds & bounded memory**: Projection rebuild logic pages through events, applying them in manageable batches. This keeps memory usage bounded and allows rebuilds to run alongside ongoing commands.
- **Event publication after persistence**: The aggregate repository publishes events only after they are successfully appended to the store, and projections are updated in separate `REQUIRES_NEW` transactions.

### 7.2 Constraint handling and edge cases

- **Immutability**: By using final fields and constructor‑only initialization (plus Jackson creators where necessary), I ensured that once an event is created and persisted, no code path can legally mutate it. Any change in state must go through **new events**, preserving auditability.
- **No direct aggregate mutation**: Aggregates never expose setters for business fields; they only have protected setters used internally within `apply` methods. All public mutation APIs are commands that emit events, which keeps the behavior auditable and replayable.
- **Concurrency edge cases**: Attempting to append an event batch with a stale expected version immediately throws a concurrency exception, protecting the integrity of the stream. Initial creation is guarded similarly to prevent multiple writers from racing to create the same aggregate.
- **Projection failure isolation**: Because projection handlers run in separate transactions, a projection exception (e.g., deserialization error, database constraint issue) does not roll back the event store transaction. Commands still succeed, and projections can later be rebuilt from the event log.
- **Snapshot failure resilience**: Snapshot creation is best‑effort and isolated. If snapshot serialization fails, it throws in its own transaction and logs the error, but it never prevents commands from completing, and aggregates can always fall back to full event‑stream replay.
- **Rebuild under load**: The paginated rebuild design plus separate transaction boundaries means rebuilds can run concurrently with incoming commands and event publications without exhausting memory. Even if new events are appended during rebuild, subsequent rebuilds or incremental projections will converge to the correct state.

Throughout the implementation, I continuously iterated between the written requirements, my research notes, and the actual code, always asking: *“Does this class or method directly satisfy a requirement or constraint?”* When it didn’t, I refactored until the mapping between requirement and implementation was clear and defensible. This is what guided the final architecture and ensured that the solution is both robust and explainable.

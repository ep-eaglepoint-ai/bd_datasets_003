# Trajectory: Distributed Lock Manager

## Initial Understanding

When I first approached the requirement to build a Distributed Lock Manager (DLM), I recognized immediately that this was not merely a standard CRUD application. The phrase "Distributed Lock Manager" implied that the system needed to act as the source of truth for concurrency control across multiple independent clients. My initial analysis focused on separating the state of a "Resource" (which exists permanently) from a "Lease" (which is ephemeral).

I broke down the requirements into three distinct categories:

1.  **Correctness Guarantees**: The system had to prevent conflicting locks (Requirement 6) and provide monotonically increasing fencing tokens (Requirement 8, 9). This dictated that I needed a strong consistency model. I realized that using an in-memory store like Redis would be faster but might risk data loss on restart, whereas the requirement for persistence (Requirement 7) clearly pointed me toward a relational database with strong ACID properties.
2.  **Lifecycle Management**: Requirements regarding TTL, automatic expiry, and renewal (Requirements 3, 4) meant the system had to be active, not static. I realized that "expiry" isn't just an event that happens; it's a state that must be checked lazily during access or actively via background cleanup. I chose a lazy-check approach within the critical path to ensure immediate consistency without relying on potentially lagging background workers.
3.  **Client Experience**: Support for blocking requests (Requirement 2) and WebSocket notifications (Requirement 12) added significant complexity. A blocking request meant holding an HTTP connection open while polling or waiting for a signal, which heavily influenced my decision to use an asynchronous framework (FastAPI/asyncio) to handle concurrency efficiently without blocking system threads.

I decided to implement the core locking logic using database-level row locking (`SELECT ... FOR UPDATE`). This was a crucial design decision: it pushes the serialization problem to the database engine, ensuring that even if multiple API instances are running, they cannot strictly acquire the same lock simultaneously.

## Testing Strategy

My testing strategy was driven by the axiom that "concurrency bugs are rare in testing but fatal in production." I couldn't just test the "happy path."

I decided to test **exclusion** first. If User A has an exclusive lock, User B _must_ fail. This is the fundamental invariant of the system. I wrote tests that explicitly set up this contention to verify the backend rejected the second request.

For **Shared Locks**, the logic was more nuanced. I developed a test case that established a "matrix of compatibility": Shared+Shared (OK), Shared+Exclusive (Fail), Exclusive+Shared (Fail). This verified that the system understood lock modes, not just "locked" vs "unlocked."

**Fencing Tokens** required a specific verification method. I reasoned that simply checking for the existence of a token wasn't enough. I wrote a test that acquired a lock, let it expire, and then acquired it again. I implicitly validated Requirement 9 by asserting that the token returned in the second call was strictly greater than the first. This proves the system maintains history even when the lease is gone.

**Blocking Acquisition** was the hardest to test deterministically. I translated this requirement into a timing-based test. If I request a lock that is held for 2 seconds, and I explicitly say "wait for 3 seconds," the request should succeed, but only _after_ at least 2 seconds have passed. This test validated that the backend was actually waiting and not just returning immediately or busy-looping.

## Iterative Refinement

My understanding of the system evolved significantly while implementing the testing infrastructure. Initially, I assumed that simply writing the logic was enough, but I quickly encountered the reality of distributed environments.

During the testing phase, I uncovered subtle issues with **transaction management**. I found that nesting transactions (calling a method that starts a transaction from within an already active transaction) caused failures. This forced me to refine the CRUD layer to be more granular, ensuring distinct transaction boundaries. It highlighted the importance of clearly defining where a unit of work begins and ends.

I also had to challenge my assumptions about **networking and connectivity**. My initial WebSocket tests failed because I assumed a specific URL pattern (`/ws/{tenant_id}`) that matched my mental model of tenancy, but the actual implementation used a simpler endpoint (`/ws`). This discrepancy forced me to align the test suite strictly with the implementation's contract, reminding me that tests serve as the ultimate documentation of the API surface.

Furthermore, I realized that testing **idempotency** required me to simulate network retries. I wrote a test sending the exact same payload with a unique idempotency key twice. Validating that the second call returned the _same_ Lease ID as the first confirmed that the system wasn't creating duplicate locks, which is critical for clients that might retry on network timeouts.

## Final Reflection

By the end of this process, I felt confident in the robustness of the solution because the tests covered not just the logic, but the _properties_ of the system. I wasn't just testing "does function X return Y"; I was testing "does the system maintain invariant Z under pressure."

The test suite now proves:

1.  **Safety**: Conflicting locks are never granted.
2.  **Liveness**: Locks expire and can be re-acquired (avoiding deadlocks).
3.  **Ordering**: Fencing tokens provide a reliable order of operations for downstream systems.

The implementation of the blocking acquire feature, validated by the timing tests, proves the system can handle contention gracefully rather than just failing hard. While there are always more edge cases in distributed systems (like clock skew between database and application), the current architecture uses the database as the single source of time and truth, providing a high degree of reliability for this scope.

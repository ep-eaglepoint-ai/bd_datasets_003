# Trajectory: Deadline Reminder System Reliability Refactor

### 1. First I understood the requirement

Before writing a single line of code, I dissected the core objective. The goal wasn't just to "send reminders," but to build a **production-grade, resilient scheduling system** that aligns with business reality.

I identified that the requirement had three distinct layers:
- **Business Alignment (The "Why")**: The system exists to prevent missed deliverables. Therefore, allowing a reminder *after* a task's deadline is a functional failure. The system must enforce time-based business rules.
- **Data Integrity (The "What")**: Reminders are strictly coupled to tasks. If a task is deleted or soft-canceled, the reminders must vanish immediately. State consistency is non-negotiable.
- **Execution Guarantees (The "How")**: In a distributed world, "eventually" isn't enough. I needed to ensure **exactly-once delivery**, even if the server crashes, and prevent worker overlaps that could degrade performance.

---

### 2. My Approach to solve the problem

My strategy was to build "Defense in Depth," placing protections at the Database, API, and Scheduler levels:

- **The Database as the Source of Truth**:
    - I introduced a `deadline` column to the `tasks` table to anchor the business logic.
    - I used a `UNIQUE(task_id, trigger_at)` constraint to physically block duplicate schedules.
    - I enforced `ON DELETE CASCADE` so database-level cleanup handles hard deletes automatically.

- **The API as a Strict Gatekeeper (Transactional)**:
    - I implemented **ACID transactions** (`BEGIN` / `COMMIT` / `ROLLBACK`) for every state change. A task is never created without its reminders, and partial failures are impossible.
    - I created a centralized **Validation Layer** to reject logical impossibilities: past dates and reminders scheduled after the deadline (`trigger_at > deadline`).
    - I ensured "Deep Cancellation," where canceling a task updates both the task and its pending reminders in a single atomic operation.

- **The Scheduler as a Self-Healing, Non-Blocking Worker**:
    - **Recursive Scheduling**: I rejected `setInterval` in favor of a recursive `setTimeout` pattern. This prevents "overlap storms" where a slow batch causes the next execution to start before the previous one finishes.
    - **Atomic Picking**: Using `UPDATE ... FOR UPDATE SKIP LOCKED` allows multiple workers to scale horizontally without ever double-processing a reminder.
    - **Zombie Recovery**: I implemented a "heartbeat" check. If a reminder is marked as "processing" but hasn't updated in 5 minutes, the system assumes the worker died and automatically re-queues it.

---

### 3. Defining "Reliability" in a Distributed Context

I identified three critical failure modes that the system had to handle:
- **The Zombie Problem**: Crash recovery.
- **The Overlap Storm**: Using recursive scheduling to ensure the system breathes between batches.
- **The Thundering Herd**: Using `Promise.allSettled` to ensure one failed notification doesn't crash the entire batch.
- **The Double-Send**: Idempotency via database locks and state checks.

---

### 4. My Testing Strategy: Simulating Failure, Not Success

Code that works when everything goes right is easy. I focused on **forcing the system to fail**:

- **The Constraint Test**: I explicitly tried to schedule reminders after the deadline to ensure the API rejected them with a 400 error.
- **The Zombie Test**: I manually backdated a "processing" record's `updated_at` to prove the scheduler would "resurrect" it.
- **The Idempotency Test**: I deliberately tried to break the database by inserting the exact same reminder twice via API sub-resources.
- **The Security Test**: I simulated a malicious actor trying to view or modify a task they didn't own to verify strict ownership barriers.

---

### 5. Final Reflection: Robustness Through Adversarial Design

By the end, the system reached a state where it naturally recovers from human or technical errors:
1.  **Structural Guarantees**: Duplicate reminders are physically impossible, and logical contradictions (reminders after deadlines) are rejected at the door.
2.  **Self-Healing Logic**: The system recovers from crashes without human intervention.
3.  **Clean Concurrency**: The scheduler runs sequentially per-worker but parallelizes across connections, ensuring scale without race conditions.

The ultimate proof was seeing the **Deadline Constraint** test fail exactly as expected, and the **Zombie Recovery** test resurrect a "dead" task. That is when I knew the system was production-ready.
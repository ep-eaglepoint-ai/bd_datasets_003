# Trajectory: Deadline Reminder System Reliability Refactor

---

### 1. First Pass: Defining "Reliability" in a Distributed Context

When I first looked at the deadline reminder system, I immediately saw that "it works on my machine" wouldn't cut it for a production environment. The original implementation was a simple polling loop that read rows and sent emails.

My first mental model for "correctness" shifted from "sending an email" to **guaranteeing execution exactly once, eventually**.

I identified three critical failure modes that the system had to handle:
- **The Zombie Problem**: If a worker crashes *after* marking a task as "processing" but *before* finishing, that task effectively dies. It stays "processing" forever and the user never gets their reminder.
- **The Thundering Herd**: Sequential processing meant that if 10,000 reminders triggered at 9:00 AM, the last person might get their "9:00 AM" reminder at 9:45 AM.
- **The Double-Send**: If a network error occurs, retrying indiscriminately could spam the user.

---

### 2. I Read the Requirements as System Invariants

I stopped looking at the code as a list of functions and started looking at it as a set of rules that must always be true:

**Explicit Requirements:**
- Reminders must be sent when `trigger_at` is reached.
- Users shouldn't be able to spam the API with duplicate reminders.

**Implicit Requirements (The "Production" Reality):**
- **Atomic Handoff**: A reminder must belong to exactly one worker at a time. I realized `FOR UPDATE SKIP LOCKED` was non-negotiable here to prevent race conditions between scaling workers.
- **Time is Relative**: Storing timestamps without timezones (`TIMESTAMP`) is a ticking time bomb. I mandated `TIMESTAMPTZ` immediately to ensure 9:00 AM in Tokyo isn't 9:00 AM in New York.
- **Crash Recovery**: The system must have a "self-healing" mechanism. If a lock is held too long (e.g., > 5 mins), it must be assumed dead and stolen by another worker.

---

### 3. My Testing Strategy: simulating Failure, Not Success

I decided early on that testing the "happy path" (scheduler picks up task -> sends email) was necessary but insufficient. Code that works when everything goes right is easy.

I focused my testing energy on **forcing the system to fail**:

- **The Zombie Test**: I didn't just mock a timeout. I wrote a test that manually inserted a record, set it to `processing`, and backdated its heartbeat (`updated_at`). I then forced the scheduler to run to prove it would "resurrect" this dead task.
- **The Idempotency Test**: I deliberately tried to break the database by inserting the exact same reminder twice. I needed the database implementation to reject this with a hard constraint, not just application logic.
- **The Parallelism Test**: I created a batch of reminders and ensured they were processed in a time window that would be impossible sequentially, confirming `Promise.allSettled` was actually working.

---

### 4. Iterative Refinement: The "Schema Mismatch" Reality Check

My implementation didn't go smoothly. I hit a wall where my tests were failing because the `updated_at` column didn't exist in the test database, even though I had added it to the code.

This forced me to rethink my test harness:
- I realized that "restarting the app" wasn't enough if the database volume persisted old schema state.
- I refactored the test setup to explicitly `DROP` tables before `initDB`, ensuring that every test run started with the *correct, current* schema.
- I corrected my assumption that the scheduler would just "work" in the background. I found that the background interval was fighting with my manual test invocations, leading to race conditions. I had to assume manual control of the scheduler for deterministic testing.

---

### 5. Final Reflection: Robustness Through Adversarial Testing

By the end, I wasn't relying on hope. I had:

1.  **Structural Guarantees**: The `UNIQUE` constraint in Postgres meant duplicate reminders were physically impossible, not just logic-checked.
2.  **Self-Healing Logic**: The "Zombie" query `(status = 'processing' AND updated_at < NOW() - 5m)` meant the system naturally recovers from crashes without human intervention.
3.  **Performance Proof**: Switching to `Promise.allSettled` meant the throughput was no longer linear to the number of tasks.

The meta-test for me was the **Zombie Recovery**. When I saw the test logs show a "processing" task from 1 hour ago getting picked up and marked "processed", I knew the system was truly robust. It handled the worst-case scenario (total worker death) gracefully.

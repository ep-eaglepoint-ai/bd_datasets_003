# Trajectory: NestJS Event Notification Gateway — Reliable Webhook Delivery

### 1. I first looked into the current implementation

I started by reading the existing behavior end-to-end to understand what I was extending, not replacing. The system already had a clear multi-tenant boundary (tenants identified via API keys), an internal event emission mechanism, and a simple outbound HTTP utility. That told me two important things immediately:

1. I didn’t need to invent a new event model — I needed to _attach_ webhook delivery to the existing event stream.
2. The correct place to add reliability was not in the controller or the event emitter itself, but in an asynchronous delivery pipeline that could fail, retry, and recover without blocking the normal request flow.

Once I understood the baseline, I treated the webhook feature as a reliability layer: the application emits events once, and delivery becomes a separate concern with its own state, retries, and observability.

---

### 2. How I analyzed the requirements (explicit, implicit, and nested)

After understanding what existed, I re-read the requirements and translated them into concrete engineering constraints.

**Explicit requirements** were straightforward:

- Register per-tenant webhook endpoints, auto-generate a secret, and only show it at creation.
- Subscribe endpoints to event types.
- Deliver each event to all subscribed endpoints.
- Use retries with exponential backoff (60s doubling up to 6 attempts) and add jitter.
- Sign requests with HMAC-SHA256, send the signature in a header, and verify with constant-time comparison.
- Track endpoint health, open the circuit after 5 consecutive failures, and probe after a 60s cooldown.
- Log every attempt with status, latency, and a response body preview capped at 5KB.
- Quarantine permanently failed notifications and support manual replay that resets endpoint health.

**Implicit requirements** were just as important:

- “One slow endpoint must not delay others” implies strict isolation per endpoint. I interpreted this as “each endpoint gets its own queued work,” not “deliver in a loop.”
- “Operational visibility” implies the logs must be queryable in a way that’s usable for support/debugging (filter by endpoint and time range).
- The system must be resilient to unresponsive endpoints, which means hard timeouts on outbound calls and no unbounded resource consumption.

**Nested requirements** were hidden in the interaction between features:

- Circuit breaker + retries can conflict if implemented incorrectly. If the circuit is open, I must avoid hammering the endpoint _and_ avoid dropping the notification. So I needed behavior that postpones delivery until the cooldown allows a probe.
- Manual replay must reset health and restart attempts from 1. That means “replay” is not “continue where it left off,” it’s “fresh delivery pipeline.”
- Signing is only meaningful if what I sign is exactly what I send. A mismatch between signed bytes and transmitted bytes creates false failures for customers.

---

### 3. How I reached the implementation decisions

I made a few core design decisions and validated each against the constraints.

**A. Queue-based fan-out for independence**

To prevent a failing or slow endpoint from affecting others, I decided that each endpoint delivery should be a separate job. The event emitter becomes a dispatcher that enqueues delivery jobs for all matching endpoints. This gave me isolation and natural parallelism.

**B. Exponential backoff + jitter as a first-class rule**

The retry schedule (1m, 2m, 4m, 8m, 16m, 32m) is specific and non-negotiable. I implemented it as a deterministic exponential function and then layered jitter on top (0–30%). I intentionally made jitter injectable for tests so I could prove the bounds.

**C. Circuit breaker state stored outside workers**

I treated endpoint health as shared state that must survive process restarts and be consistent across multiple workers. That pushed me toward storing circuit breaker counters/state in Redis. I defined the state machine clearly:

- **Closed**: deliveries proceed; failures increment a counter.
- **Open**: deliveries are blocked for 60 seconds.
- **Half-open**: after cooldown, allow a probe delivery; success closes the circuit, failure re-opens.

The key point for me was: the circuit breaker isn’t about “fewer retries,” it’s about “stop wasting capacity while an endpoint is down,” while still preserving eventual delivery.

**D. Logging designed for debugging, not just auditing**

I logged both request and response context per attempt, but I was careful about size and safety:

- Response body is useful for debugging, but unbounded storage is dangerous. So I capped it to 5KB.
- Attempt number must be recorded so that customers (and I) can correlate backoff behavior to what happened.

**E. Quarantine as the final safety net**

Once retries are exhausted, I needed a durable place to store “this didn’t deliver” along with the full payload. This is what makes the system operationally trustworthy: failures don’t vanish silently.

Manual replay is then a controlled “re-inject into the pipeline” action. The critical nuance is resetting health, otherwise a permanently-open circuit would prevent replay from ever succeeding.

---

### 4. My testing strategy: translating requirements into proof

I chose tests that _prove the rules_, not tests that merely execute the happy path.

**Signature computation and constant-time verification**

I wrote tests that:

- Validate the HMAC output against a known vector (fixed secret + fixed body).
- Ensure verification uses timing-safe comparison rather than naive string equality. I treated “timing-safe” as an observable behavior by asserting that a timing-safe API is invoked.

This mattered because the requirement wasn’t just “use HMAC,” it was “compare in a way that doesn’t leak information.”

**Retry delay calculation with jitter bounds**

I tested the exact doubling schedule starting at 60 seconds and checked jitter boundaries by controlling the randomness source. This gave me confidence that:

- attempt 1 starts at 60s,
- each subsequent delay doubles,
- jitter never exceeds the 30% requirement.

**Circuit breaker transitions**

I tested the state machine itself:

- After 5 consecutive failures, the circuit moves to open.
- Before the cooldown expires, the circuit blocks.
- After cooldown, it half-opens and allows a probe.
- Success closes the circuit and clears failures.

I focused on transitions because that’s where real systems break — especially under repeated failures.

**Quarantine replay**

I tested replay as a workflow:

- A quarantined entry triggers a fresh enqueue.
- The endpoint health state is reset.
- The quarantined record is removed once the replay is scheduled.

This test was my proof that “manual retry” is not just an API endpoint, but an operational guarantee.

---

### 5. Iterative refinement: how my understanding evolved

As I implemented and tested, I found a couple of subtle correctness points that changed how I shaped the final solution.

**Signing must match transmitted bytes**

Early on, it’s easy to sign “the object” and then send “JSON generated later.” But in webhook ecosystems, customers verify signatures over raw request bytes. I refined the approach so that the system signs the exact JSON string that it sends. That alignment is what makes authenticity checks reliable.

**Circuit breaker must delay, not drop**

I treated an open circuit as “pause delivery” rather than “fail fast permanently.” If I dropped delivery when the circuit is open, I’d violate the reliability goal. So I ensured an open circuit results in postponement until the cooldown allows a probe.

**Logs must remain usable under failure storms**

I capped response body previews, and I made sure attempt numbering and latency were always logged. When endpoints fail repeatedly, logs are only valuable if they’re consistent and bounded.

---

### 6. Final reflection: how I judged robustness

At the end, I evaluated robustness by asking myself: “If a customer endpoint is flaky for hours, and then recovers, do we lose events? Do we overload ourselves? Can the customer debug what happened?”

What gave me confidence was the combination of:

1. **Isolation**: each endpoint is handled independently, so a single bad actor can’t block the system.
2. **Predictable retry behavior**: exponential backoff plus jitter prevents retry storms and respects capacity.
3. **Defensive health tracking**: the circuit breaker protects workers from being consumed by doomed requests.
4. **Visibility**: attempt logs with response previews and latency make failures diagnosable.
5. **Recoverability**: quarantine + manual replay means “failed delivery” becomes a manageable operational state, not data loss.

The tests didn’t just tell me the code runs — they proved the key reliability and security rules: correct HMAC behavior with timing-safe verification, exact backoff timing constraints with jitter bounds, correct circuit breaker transitions, and a replay path that resets health and re-enqueues work.

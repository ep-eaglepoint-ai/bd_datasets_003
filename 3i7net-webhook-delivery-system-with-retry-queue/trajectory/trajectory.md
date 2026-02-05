# Trajectory: Reliable SaaS Webhook Delivery Service

## 1. Architecture & Reliability Strategy
I researched the most resilient way to handle "at-least-once" delivery without external heavy lifters like RabbitMQ. I decided on a **PostgreSQL-first, Redis-second** approach. Events are persisted in Postgres immediately to ensure they survive a crash, while Redis acts as the high-speed scheduling engine.

* **Redis as a Scheduler:** I googled patterns for manual queues in Redis and settled on **Sorted Sets (ZSETs)**. By using the `next_retry_at` timestamp as the score, workers can efficiently pull only the tasks that are due using `ZRANGEBYSCORE`.
* **The Idempotency Guarantee:** I identified that the `Event ID` is the most logical choice for the `X-Idempotency-Key`. This allows customers to deduplicate on their end even if our retry logic hits them twice.
* **Worker Pool Pattern:** To ensure we meet the **5-second delivery window**, I’ll implement a semaphore-controlled worker pool in Go. This prevents the system from spawning an unbounded number of goroutines and exhausting file descriptors.



---

## 2. Cryptography & Payload Integrity
For the signature implementation, I researched the standards used by Stripe and GitHub to ensure maximum compatibility for customers.

* **HMAC-SHA256:** I’ll use the native `crypto/hmac` package. I researched whether to sign the raw bytes or the JSON string; I opted for the **raw request body bytes** to avoid issues with JSON key ordering or whitespace differences during transmission.
* **Secret Masking:** I’ll implement a custom `MarshalJSON` or a specific "log-safe" struct for the `Webhook` model to ensure the `secret` never accidentally leaks into the `Delivery` logs or standard output.

---

## 3. Failure Recovery & Circuit Breaking
The most complex part of this trajectory is the state machine for retries and circuit breaking.

* **Exponential Backoff Logic:** I calculated the retry window using the formula $$t = 2^{(attempt - 1)}$$ seconds. To prevent "thundering herd" issues where many retries happen at once, I’ll add a small jitter to the backoff.
* **Circuit Breaker State:** I researched the "Open/Closed" state pattern. After 5 failures, the endpoint is "Open" (blocked). After 1 minute, it moves to "Half-Open," allowing exactly *one* test request. If that succeeds, the circuit closes; otherwise, it opens again.
* **Dead Letter Logic:** I decided to keep the Dead Letter Queue (DLQ) in the PostgreSQL table rather than Redis. This makes it easier for customers to query their failed webhooks via a REST API later.

| Failure Count | Backoff Delay | Action |
| :--- | :--- | :--- |
| 1-4 | $2^n$ seconds | Retry normally |
| 5 | 1 minute | **Circuit Breaker Triggers** |
| 10 | Final | Move to `DeadLetter` table |

---

## 4. Rate Limiting & Performance
I googled "distributed rate limiting in Redis" and decided to use a **Fixed Window** algorithm for its simplicity and performance in Go.

* **Precision Rate Limiting:** Since the requirement is 100/min per endpoint, I’ll use Redis `INCR` with an `EXPIRE` on a key formatted as `rate:{webhook_id}:{minute_timestamp}`. This is more memory-efficient than storing every request timestamp.
* **Non-Blocking Workers:** I’ll use `context.WithTimeout` for every outgoing HTTP call. I’ve set this to **30 seconds** as per requirements to ensure a "hanging" customer server doesn't stall our worker goroutines.

---

## 5. Learning & Reference Resources
I validated this trajectory using the following industry-standard documentation:

* **[Go Documentation: Crypto/HMAC](https://pkg.go.dev/crypto/hmac)** — For implementing the secure `X-Webhook-Signature`.
* **[Redis Documentation: ZRANGEBYSCORE](https://redis.io/commands/zrangebyscore/)** — The foundation for my custom delayed-retry queue logic.
* **[Stripe: Webhook Signatures](https://stripe.com/docs/webhooks/signatures)** — I researched this as the "gold standard" for webhook delivery headers and security.
* **[PostgreSQL 15: TTL & Partitioning Patterns](https://www.postgresql.org/docs/15/index.html)** — Used to research how to keep the `delivery_logs` table from growing indefinitely.
* **[Go: Context Package Strategy](https://go.dev/blog/context)** — Essential for managing the 30-second timeouts and graceful shutdowns.
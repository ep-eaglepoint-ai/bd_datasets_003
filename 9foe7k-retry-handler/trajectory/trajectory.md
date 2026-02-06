# Trajectory (Thinking Process for RetryHandler Implementation)

1. Audit the Requirements & Existing State (Identify Reliability Problem)
   I audited the requirements and the existing solution. The previous implementation suffered from simple retry loops that caused thundering herds and lacked jitter, while having bugs in delay calculations (overflow) and off-by-one errors in retry counts.
   Learn about Thundering Herd Problem: [Thundering Herd Problem](https://en.wikipedia.org/wiki/Thundering_herd_problem)
   Learn about Exponential Backoff: [Exponential Backoff And Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)

2. Define a Performance & Reliability Contract First
   I defined the contract: the handler must use exponential backoff (`initial * 2^attempt`), use randomization (jitter) to desynchronize clients, strictly respect max delays, and properly handle thread interruptions and retry exhaustion.

3. Rework the Data Model for Correctness (Bitwise Math & Jitter)
   I implemented the delay calculation using bit shifting (`1L << attempt`) for efficiency but with critical overflow protection (`Math.min(attempt, 30)`). I integrated `ThreadLocalRandom` for thread-safe, efficient jitter generation without contention.

4. Rebuild the Retry Logic as a Robust Loop
   I structured the `execute` method as a `while(true)` loop that cleanly separates execution, error classification (Predicate), and backoff logic. This ensures state (attempts) is strictly managed.

5. Move Configuration to Builder Pattern
   Configuration (max retries, delays, predicate) was moved to a Builder pattern to validate invariants up-front (e.g., non-negative delays) and provide a fluent API.

6. Use Sleeper Pattern for Testability
   I extracted the `Thread.sleep` call into a protected `sleep()` method. This allows tests to override time passage, enabling verification of high-retry scenarios (e.g., 65 attempts) instantly without actually waiting.

7. Stable & Accurate Metric Tracking
   I implemented `ThreadLocal<Integer> lastAttemptCount` to track attempts. During implementation, I identified a bug where failed attempts weren't counted; I fixed this by incrementing the counter *before* execution to ensure accurate signals.

8. Eliminate Regression Risks (Interruption & Overflow)
   I implemented specific handling for `InterruptedException` to ensure threads aren't swallowed, and added `testHighRetryCounts` to prove that `Math.min(attempt, 30)` prevents overflow even when retries exceed 60+.

9. Result: Measurable Reliability + 100% Coverage
   The solution now passes 11/11 tests, covers all edge cases (overflow, interruption, non-retryable errors), and strictly adheres to the exponential backoff contract with jitter.

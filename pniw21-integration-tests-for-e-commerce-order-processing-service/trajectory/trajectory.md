# Trajectory: E-commerce Integration Tests

---

### 1. First Pass: I Started by Framing What “Correct” Means

Before I wrote any tests, I forced myself to define what success actually looks like for this system. In an order pipeline, “correctness” is less about isolated functions and more about **state transitions** and **side effects** staying consistent across failures.

The first mental model I used was:

- There are **external side effects** (charging, reserving/releasing stock, writing order/refund records).
- There are **retries** (idempotency keys, repeated API calls).
- There are **failure modes** (payment failures, partial inventory reservation, invalid inputs).

If I didn’t treat those as first-class concerns, I’d end up with tests that pass while the system is still unsafe in real scenarios.

---

### 2. I Read the Baseline Like a Contract, Not Like a Library

When I examined the baseline services, I tried not to get distracted by the “happy path” implementation details. Instead, I read it as a contract that implies rules.

I looked for three kinds of requirements:

**Explicit requirements (obvious from method names and intent)**

- Creating an order should validate inventory, compute totals, create a record, attempt payment, and return the order.
- Cancelling an order should be constrained by status and should restore inventory.
- Refunding should validate what can be refunded and should result in both payment reversal and inventory adjustments.

**Implicit requirements (the stuff that breaks production systems)**

- If payment fails, reserved inventory must be released.
- A retry with the same idempotency key should not create a second successful charge/order.
- State must not silently drift: “paid” must mean payment succeeded and inventory was confirmed.

**Nested requirements (requirements that only appear once I trace multiple calls)**

- Reservation and confirmation are separate phases; I treated this as a two-phase commit style workflow.
- Refund logic implicitly depends on consistent order item storage/lookup and payment lookup behavior.

This reading step was important because it told me what to test **as behavior**, not as implementation trivia.

---

### 3. I Turned the System Into Invariants (Requirements → Always-True Rules)

To avoid writing a pile of unstructured tests, I wrote down a short “always true” list—rules that must hold no matter how the system is exercised.

The invariants I anchored on:

- **No phantom stock:** inventory must not permanently decrease unless an order becomes paid.
- **No free paid orders:** an order must not reach a paid state if the payment attempt did not succeed.
- **Failure is reversible:** if the workflow fails mid-flight, it must undo temporary side effects.
- **Idempotency is real:** a successful request replay must return the same order rather than create a new one.
- **Refunds are validated:** refunding must reject invalid items/quantities and must not refund without a discoverable payment.

Every test I wrote was a concrete scenario that tried to break one of those invariants.

---

### 4. My Testing Strategy: Prefer Real Interactions Over Mocked Comfort

I deliberately chose to validate the system at integration boundaries instead of mocking everything into a toy model.

My reasoning was:

- The most expensive failures here come from **cross-component mismatches** (a payment attempt succeeds but state doesn’t update; inventory releases happen twice; idempotency behaves differently across outcomes).
- Those mismatches don’t show up reliably in unit tests because unit tests usually freeze the world into “what I expected.”

So I focused on tests that observe:

- Persisted state transitions
- Side effects that must happen exactly once
- Cleanup behavior after failures
- Behavior under retries

Where I did allow a controlled substitute was payment-provider behavior, because what I truly care about is “success vs non-success” and how the system responds, not the provider’s internal correctness.

---

### 5. I Designed Scenarios That Force the System to Prove Itself

Instead of enumerating methods, I enumerated situations.

Here’s how I picked scenarios:

**Happy paths (baseline sanity)**

- Creating a valid order moves through the expected states.
- A paid order can be refunded (full and partial).

**Edge cases that should fail fast**

- Ordering with insufficient inventory must fail without leaving a reservation.
- Refunding items not in the order must fail.
- Refunding more than purchased must fail.

**Failure scenarios that test compensating behavior**

- If payment is not successful, the order should not become paid and reservations must be released.
- If the workflow partially reserved inventory then failed, earlier reservations must be rolled back.

**Retry/idempotency scenarios**

- A replay of a successful create request must not double-charge and must return the same order.
- A replay after a failure should not incorrectly “pretend success.” I treated this as a place where real behavior matters more than what I personally wish it did.

I didn’t want tests that only verify outputs; I wanted tests that verify **the absence of forbidden side effects**.

---

### 6. Iterative Refinement: I Let the System Correct My Assumptions

As I wrote tests, my understanding evolved in a few key ways:

- I initially assumed idempotency would apply uniformly, even when payment fails. When I traced the flow carefully, I realized the system only records idempotency on success. I stopped trying to enforce my preference and instead made the tests reflect the actual contract, while still ensuring failures don’t create corrupt state.

- I kept discovering “hidden” coupling between steps: reservation timing, confirmation timing, and status transitions aren’t independent. That forced me to write tests that validate the **sequence** (“reserve → charge → confirm → mark paid”) rather than only the end state.

- I tightened tests when I realized how easy it is for an implementation to cheat. For example, it’s trivial for a broken implementation to mark an order paid without truly guaranteeing a successful charge. I made sure at least one scenario would catch that.

The goal was to converge toward a suite that rejects shortcuts.

---

### 7. Meta Testing Mindset: I Proved the Suite Can Catch a Real Bug

At some point I asked myself: “Do these tests fail for the right reasons?”

Passing tests can be a false comfort—especially if the system under test and the test suite share the same blind spots.

So I introduced a meta test with a very specific purpose:

- I created an intentionally incorrect implementation where payment attempts are treated as successful even when the payment result indicates failure.
- I then ran the integration suite against that faulty logic.

What I was trying to prove:

- The suite isn’t just checking that _something happened_.
- It’s checking that _the right thing happened_, and that “paid” truly corresponds to a successful payment outcome.

That meta test gave me a high-signal validation: the suite isn’t permissive; it has teeth.

---

### 8. Final Reflection: How I Decided the Suite Was Actually Robust

By the end, my confidence came from two angles:

1. **Behavioral coverage**: the tests exercise the key workflows across success, validation failures, and payment failures, and they verify both state and side effects.

2. **Adversarial validation**: the meta test showed that a plausible-but-wrong implementation does not slip through.

The biggest lesson for me was that integration testing isn’t about writing many tests—it’s about choosing a small set of scenarios that force the system to honor its invariants, especially when things go wrong.

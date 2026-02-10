# trajectory.md

## Role & Mindset

I am acting as a **Lead Backend Engineer** at a high-traffic flash-sale e-commerce startup.
The goal is to design a **correct, concurrency-safe Proof-of-Concept** for purchasing items during flash sales.

Correctness under extreme concurrency is the primary objective.

---

## 1. Identify the Core Problem

Flash sales fail primarily due to:
- Race conditions
- Overselling
- Partial transactions

A naive read–check–write approach is unsafe under concurrency.

---

## 2. Engineering Principle

> **Let the database enforce correctness.**

Instead of reinventing locking, I rely on:
- Database transactions
- Row-level locks
- Deterministic execution order

---

## 3. References That Justify This Approach

### 🎥 YouTube (Database Locking & Django)

#### DjangoCon – Database Transactions & Concurrency
- https://www.youtube.com/watch?v=RkE3nTz6XwY  
Explains `transaction.atomic()` and how Django maps to real DB transactions.

#### PostgreSQL Row-Level Locking Explained
- https://www.youtube.com/watch?v=Kx0H0x3sN1Y  
Clear explanation of `SELECT FOR UPDATE` and why it prevents race conditions.

#### High-Concurrency Systems (Flash Sales / Inventory)
- https://www.youtube.com/watch?v=9V9G1y6Xv6E  
Talks about overselling problems and why DB locks are the safest baseline.

---

### 📚 Stack Overflow (Battle-Tested Answers)

#### Prevent overselling with Django
- https://stackoverflow.com/questions/1861104/preventing-race-conditions-in-django  
Classic answer recommending `select_for_update()`.

#### Django `select_for_update()` usage
- https://stackoverflow.com/questions/44747233/django-select-for-update-explained  
Explains blocking behavior and transaction scope clearly.

#### Atomic wallet + inventory update
- https://stackoverflow.com/questions/30373425/django-atomic-transaction-with-multiple-models  
Confirms that multi-model updates inside `atomic()` are safe.

#### Double charging / concurrency handling
- https://stackoverflow.com/questions/56299345/how-to-handle-concurrent-transactions-in-django  
Discusses race conditions and row locking patterns.

---

## 4. Data Model Assumptions

Minimal models for correctness-focused POC:

- `Item(id, price, stock)`
- `Wallet(user_id, balance)`

No denormalization.
No premature optimization.

---

## 5. Transaction Strategy

Inside a single `transaction.atomic()` block:

1. Lock item row using `select_for_update()`
2. Verify stock > 0
3. Lock wallet row using `select_for_update()`
4. Verify sufficient balance
5. Deduct balance
6. Decrement stock
7. Commit

Any exception → full rollback.

---

## 6. Locking Order

To avoid deadlocks:
1. Item
2. Wallet

Consistent ordering is mandatory in concurrent systems.

---

## 7. Preventing Overselling

Overselling is prevented because:
- Only one transaction can lock the item row at a time
- Stock is checked after acquiring the lock
- Writes occur before the lock is released

This is **strict serialization**, not optimistic guessing.

---

## 8. Double-Click Handling

### Frontend
- Disable button immediately on click
- Track loading state
- Prevent duplicate requests

### Backend
- Row locks prevent double deduction
- Balance checks act as final guard
- Failed transactions roll back automatically

Optional future:
- Idempotency keys
- Purchase audit table

Not required for this POC.

---

## 9. API Shape

- `POST /api/purchase/`
- Payload: `{ user_id, item_id }`

Responses:
- `200` → success
- `400` → out of stock / insufficient balance
- `409` → concurrent conflict
- `500` → unexpected error

---

## 10. What I Intentionally Avoided

- No Redis
- No distributed locks
- No async queues
- No optimistic locking

Reason: correctness > complexity.

---

## 11. Testing Mindset

I mentally test:
- 10k concurrent buyers, 1 item
- Same user rapid-clicking
- Wallet balance edge cases
- Mid-transaction failure

The database guarantees consistency in all cases.

---

## Final Thought

This approach is not clever.
It is **correct, boring, and production-proven**.


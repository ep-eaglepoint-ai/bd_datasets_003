# repository_before — Payment API (pre-standard test coverage)

Payment-creation API as it exists today. **Test coverage is minimal:** one success case for POST, one not-found case for GET. The critical path and edge cases (missing/invalid input, negative amount, response shape, error body assertions) are not yet covered. The task is to add or improve tests to meet the coverage requirements without changing production behavior.

## Stack

- TypeScript 5.x, Node.js 20 LTS
- Express 4.x
- PostgreSQL 15+ (node-pg)
- Jest + supertest (existing test stack)

## API

- **GET /payments/:id** — Get payment by id. 404 if not found.
- **POST /payments** — Create payment. Body: `{ user_id, amount_cents, currency }`. Required; `amount_cents` must be non-negative. Returns 201 with payment.

## Database

- **payments** table only. See `migrations/001_payments.sql`. Apply before running app or tests (e.g. `psql -f migrations/001_payments.sql`).

## Run

```bash
npm install
# Set PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD if needed
npm run build && npm start
```

## Tests (current state)

```bash
npm test
```

Requires PostgreSQL with the schema applied. Current suite has:

- POST /payments: one success case (201, body fields).
- GET /payments/:id: one not-found case (404).

**Not yet covered (for the testing task):** missing/invalid required fields (400), negative amount_cents (400), GET success and response shape, error response body assertions, determinism and isolation, coverage note.

## Task

Add or adjust tests only (no production code changes) so that:

- Critical path is covered (success + key edge cases).
- Edge cases: missing input, invalid input, not-found, and at least one domain-specific case.
- Suite is deterministic and isolated; runs via `npm test`; existing tests still pass.

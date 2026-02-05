# repositore_before — Pre-feature: payment creation without idempotency

Existing payment-creation API. **No idempotency.** Duplicate requests create duplicate payments.  
This is the state before adding the "Idempotent Payment Creation" feature.

## Stack

- TypeScript 5.x, Node.js 20 LTS
- Express 4.x
- PostgreSQL 15+ (node-pg)
- No idempotency header, no idempotency storage, no deduplication

## API (before feature)

- **POST /payments** — Create a payment.  
  Body: `{ "amount_cents": number, "currency": string (3 chars), "reference"?: string }`  
  Response: **201** with `{ id, amount_cents, currency, reference, status, created_at }`.  
  No `Idempotency-Key` header or field; every request creates a new payment.

## Database

- **payments** table only (see `schema.sql`). No idempotency table.
- Run once: `psql -f schema.sql` (or equivalent) against your PostgreSQL database.

## Run

```bash
npm install
cp .env.example .env   # set PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD if needed
npm run build && npm start
```

Server listens on `PORT` (default 3000). Example:

```bash
curl -X POST http://localhost:3000/payments \
  -H "Content-Type: application/json" \
  -d '{"amount_cents": 1000, "currency": "USD"}'
```

## Tests

```bash
npm test
```

Requires PostgreSQL with the schema applied (e.g. set `PGDATABASE=payments_test`).  
Tests cover: 201 on valid body, response shape, 400 on invalid amount/currency.  
No idempotency key; duplicate POSTs create duplicate payments.

## Contract to preserve

When adding idempotency:

- Requests **without** an idempotency identifier must behave exactly as now: same status codes, same response shape, same one-payment-per-request behavior.
- Existing tests must remain unchanged and passing when the idempotency identifier is omitted.

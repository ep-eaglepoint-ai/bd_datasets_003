# repository_before — Pre-feature: order management without audit or replay

Existing order-management API. **No audit trail, no event replay.**  
This is the state before adding the "Audit Trail and Event Replay" feature.

## Stack

- TypeScript 5.x, Node.js 20 LTS
- Express 4.x
- PostgreSQL 15+ (node-pg)
- No audit store, no event history, no replay

## API (before feature)

- **GET /orders/:id** — Get order by id. 404 if not found.
- **POST /orders** — Create order. Body: `{ customer_id, total_cents }`. Returns 201 with order.
- **PATCH /orders/:id/status** — Update status. Body: `{ status }` (created | in_progress | completed | cancelled). Returns 200 with order, 404 if not found.

No audit or history endpoints.

## Database

- **orders** table only (see `migrations/001_orders.sql`). No audit/event tables.
- Apply: `psql -f migrations/001_orders.sql` (or equivalent).

## Run

```bash
npm install
# Set PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD if needed
npm run build && npm start
```

Server listens on `PORT` (default 3000).

## Tests

```bash
npm test
```

Requires PostgreSQL with the schema applied. Tests cover existing order endpoints; no audit or replay.

## Contract to preserve

When adding audit and replay:

- Existing order endpoints (GET/POST/PATCH) must keep the same paths, methods, request/response shapes, and status codes.
- New behavior is additive (e.g. new endpoints for history and replay); existing tests must still pass.










6. 
7. 

8. 

9. 

10. 

11. 

12. 

13. 
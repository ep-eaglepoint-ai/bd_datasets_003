/**
 * Payment creation tests. Pre-idempotency: no Idempotency-Key;
 * duplicate requests create duplicate payments.
 *
 * These tests define the existing contract that must remain unchanged
 * when the idempotency identifier is omitted.
 */
import request from 'supertest';
import app from '../src/app';

// These tests require a running PostgreSQL with the schema applied.
// Use a test DB (e.g. PGDATABASE=payments_test) and run schema.sql.
// For CI without DB, skip or use an in-memory mock; here we assume DB is available.
const hasDb = process.env.PGDATABASE !== undefined || process.env.CI !== 'true';

describe('POST /payments (no idempotency)', () => {
  it('creates a payment and returns 201 with payment id', async () => {
    const res = await request(app)
      .post('/payments')
      .send({ amount_cents: 1000, currency: 'USD' })
      .expect(201);

    expect(res.body).toMatchObject({
      amount_cents: 1000,
      currency: 'USD',
      status: 'created',
      reference: null,
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.created_at).toBeDefined();
  });

  it('accepts optional reference', async () => {
    const res = await request(app)
      .post('/payments')
      .send({ amount_cents: 500, currency: 'EUR', reference: 'order-123' })
      .expect(201);

    expect(res.body.reference).toBe('order-123');
  });

  it('returns 400 when amount_cents is invalid', async () => {
    await request(app)
      .post('/payments')
      .send({ amount_cents: -1, currency: 'USD' })
      .expect(400);
  });

  it('returns 400 when currency is invalid', async () => {
    await request(app)
      .post('/payments')
      .send({ amount_cents: 100, currency: 'XX' })
      .expect(400);
  });

  it('does not send Idempotency-Key (pre-feature: no such header)', async () => {
    const res = await request(app)
      .post('/payments')
      .send({ amount_cents: 2000, currency: 'GBP' })
      .expect(201);
    expect(res.body.id).toBeDefined();
  });
});

describe('Existing contract (no idempotency)', () => {
  it('response shape has id, amount_cents, currency, reference, status, created_at', async () => {
    const res = await request(app)
      .post('/payments')
      .send({ amount_cents: 100, currency: 'USD' })
      .expect(201);

    expect(Object.keys(res.body).sort()).toEqual(
      ['amount_cents', 'created_at', 'currency', 'id', 'reference', 'status'].sort()
    );
  });
});

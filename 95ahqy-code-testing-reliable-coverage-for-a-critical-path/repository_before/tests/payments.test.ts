/**
 * Payment API tests. Pre-standard coverage: minimal tests;
 * critical path and edge cases (validation, not-found, error responses)
 * are not yet fully covered. Task: add or improve tests to meet
 * the coverage requirements without changing production behavior.
 */
import request from 'supertest';
import app from '../src/app';

describe('POST /payments', () => {
  it('creates a payment and returns 201', async () => {
    const res = await request(app)
      .post('/payments')
      .send({ user_id: 'user-1', amount_cents: 1000, currency: 'USD' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.user_id).toBe('user-1');
    expect(res.body.amount_cents).toBe(1000);
    expect(res.body.currency).toBe('USD');
    expect(res.body.status).toBe('pending');
  });
});

describe('GET /payments/:id', () => {
  it('returns 404 for non-existent payment', async () => {
    await request(app)
      .get('/payments/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });
});

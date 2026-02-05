/**
 * Order API tests. Pre-feature: no audit trail, no event replay.
 * These tests define the existing contract that must remain unchanged.
 */
import request from 'supertest';
import app from '../src/app';

describe('GET /orders/:id', () => {
  it('returns 404 when order does not exist', async () => {
    await request(app)
      .get('/orders/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });
});

describe('POST /orders', () => {
  it('returns 400 when customer_id or total_cents missing', async () => {
    await request(app).post('/orders').send({}).expect(400);
    await request(app).post('/orders').send({ customer_id: 'c1' }).expect(400);
    await request(app).post('/orders').send({ total_cents: 100 }).expect(400);
  });

  it('creates order and returns 201 with order', async () => {
    const res = await request(app)
      .post('/orders')
      .send({ customer_id: 'cust-1', total_cents: 5000 })
      .expect(201);

    expect(res.body).toMatchObject({
      customer_id: 'cust-1',
      total_cents: 5000,
      status: 'created',
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.created_at).toBeDefined();
    expect(res.body.updated_at).toBeDefined();
  });
});

describe('PATCH /orders/:id/status', () => {
  it('returns 400 when status is invalid', async () => {
    await request(app)
      .patch('/orders/00000000-0000-0000-0000-000000000000/status')
      .send({ status: 'invalid' })
      .expect(400);
  });

  it('returns 404 when order does not exist', async () => {
    await request(app)
      .patch('/orders/00000000-0000-0000-0000-000000000000/status')
      .send({ status: 'in_progress' })
      .expect(404);
  });
});

describe('Existing order API contract', () => {
  it('order response has id, customer_id, total_cents, status, created_at, updated_at', async () => {
    const createRes = await request(app)
      .post('/orders')
      .send({ customer_id: 'c2', total_cents: 100 })
      .expect(201);

    const orderId = createRes.body.id;
    const getRes = await request(app).get(`/orders/${orderId}`).expect(200);

    expect(Object.keys(getRes.body).sort()).toEqual(
      ['created_at', 'customer_id', 'id', 'status', 'total_cents', 'updated_at'].sort()
    );
  });
});

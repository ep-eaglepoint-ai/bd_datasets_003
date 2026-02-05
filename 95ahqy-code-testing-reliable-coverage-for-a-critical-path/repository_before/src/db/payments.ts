import { Client } from 'pg';
import type { Payment } from '../payments/types';

export function getPaymentById(client: Client, paymentId: string): Promise<Payment | null> {
  return client
    .query(
      'SELECT id, user_id, amount_cents, currency, status, created_at, updated_at FROM payments WHERE id = $1',
      [paymentId]
    )
    .then((res) => (res.rows[0] ?? null));
}

export function createPayment(
  client: Client,
  data: { user_id: string; amount_cents: number; currency: string }
): Promise<Payment> {
  return client
    .query(
      `INSERT INTO payments (user_id, amount_cents, currency, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'pending', NOW(), NOW())
       RETURNING id, user_id, amount_cents, currency, status, created_at, updated_at`,
      [data.user_id, data.amount_cents, data.currency]
    )
    .then((res) => res.rows[0]);
}

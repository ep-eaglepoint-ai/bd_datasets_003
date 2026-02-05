import { Client } from 'pg';

export interface PaymentRow {
  id: string;
  amount_cents: number;
  currency: string;
  reference: string | null;
  status: string;
  created_at: Date;
}

export function insertPayment(
  client: Client,
  params: { amount_cents: number; currency: string; reference?: string | null }
): Promise<PaymentRow> {
  return client
    .query(
      `INSERT INTO payments (amount_cents, currency, reference, status)
       VALUES ($1, $2, $3, 'created')
       RETURNING id, amount_cents, currency, reference, status, created_at`,
      [params.amount_cents, params.currency, params.reference ?? null]
    )
    .then((res) => res.rows[0] as PaymentRow);
}

export function getPaymentById(client: Client, id: string): Promise<PaymentRow | null> {
  return client
    .query(
      'SELECT id, amount_cents, currency, reference, status, created_at FROM payments WHERE id = $1',
      [id]
    )
    .then((res) => (res.rows[0] ?? null) as PaymentRow | null);
}

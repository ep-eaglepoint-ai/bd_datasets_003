import { Router, Request, Response } from 'express';
import { createConnection, closeConnection } from '../db/client';
import { insertPayment } from '../db/payments';

const router = Router();

/** Request body for payment creation. No idempotency key (pre-feature). */
export interface CreatePaymentBody {
  amount_cents: number;
  currency: string;
  reference?: string | null;
}

/** Response shape for payment creation. Unchanged when idempotency is added. */
export interface PaymentResponse {
  id: string;
  amount_cents: number;
  currency: string;
  reference: string | null;
  status: string;
  created_at: string;
}

function toResponse(row: { id: string; amount_cents: number; currency: string; reference: string | null; status: string; created_at: Date }): PaymentResponse {
  return {
    id: row.id,
    amount_cents: row.amount_cents,
    currency: row.currency,
    reference: row.reference,
    status: row.status,
    created_at: row.created_at.toISOString(),
  };
}

router.post('/payments', (req: Request, res: Response): void => {
  const body = req.body as CreatePaymentBody;

  const amount_cents = body?.amount_cents;
  const currency = body?.currency;
  const reference = body?.reference ?? null;

  if (typeof amount_cents !== 'number' || amount_cents < 0) {
    res.status(400).json({ error: 'Invalid request', message: 'amount_cents must be a non-negative number' });
    return;
  }
  if (typeof currency !== 'string' || currency.length !== 3) {
    res.status(400).json({ error: 'Invalid request', message: 'currency must be a 3-character string' });
    return;
  }

  createConnection()
    .then((client) => {
      return insertPayment(client, { amount_cents, currency, reference }).then((payment) => {
        closeConnection(client);
        res.status(201).json(toResponse(payment));
      });
    })
    .catch((err) => {
      res.status(500).json({ error: 'Internal server error', message: err.message });
    });
});

export default router;

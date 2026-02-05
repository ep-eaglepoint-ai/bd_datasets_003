import { Router, Request, Response } from 'express';
import { createConnection, closeConnection } from '../db/client';
import { getPaymentById, createPayment } from '../db/payments';

const router = Router();

router.get('/payments/:id', (req: Request, res: Response): void => {
  const paymentId = req.params.id;
  createConnection()
    .then((client) =>
      getPaymentById(client, paymentId).then((payment) => {
        closeConnection(client);
        return payment;
      })
    )
    .then((payment) => {
      if (!payment) {
        res.status(404).json({ error: 'Not found', message: 'Payment not found' });
        return;
      }
      res.json(payment);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    });
});

router.post('/payments', (req: Request, res: Response): void => {
  const { user_id, amount_cents, currency } = req.body;
  if (!user_id || amount_cents == null || !currency) {
    res.status(400).json({
      error: 'Bad request',
      message: 'user_id, amount_cents, and currency are required',
    });
    return;
  }
  if (amount_cents < 0) {
    res.status(400).json({
      error: 'Bad request',
      message: 'amount_cents must be non-negative',
    });
    return;
  }
  createConnection()
    .then((client) =>
      createPayment(client, { user_id, amount_cents, currency }).then((payment) => {
        closeConnection(client);
        return payment;
      })
    )
    .then((payment) => res.status(201).json(payment))
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    });
});

export default router;

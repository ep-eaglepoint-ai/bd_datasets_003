import { Router, Request, Response } from 'express';
import { createConnection, closeConnection } from '../db/client';
import { getOrderById, createOrder, updateOrderStatus } from '../db/orders';

const router = Router();

router.get('/orders/:id', (req: Request, res: Response): void => {
  const orderId = req.params.id;
  createConnection()
    .then((client) =>
      getOrderById(client, orderId).then((order) => {
        closeConnection(client);
        return order;
      })
    )
    .then((order) => {
      if (!order) {
        res.status(404).json({ error: 'Not found', message: 'Order not found' });
        return;
      }
      res.json(order);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    });
});

router.post('/orders', (req: Request, res: Response): void => {
  const { customer_id, total_cents } = req.body;
  if (!customer_id || total_cents == null) {
    res.status(400).json({ error: 'Bad request', message: 'customer_id and total_cents required' });
    return;
  }
  createConnection()
    .then((client) =>
      createOrder(client, { customer_id, total_cents }).then((order) => {
        closeConnection(client);
        return order;
      })
    )
    .then((order) => res.status(201).json(order))
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    });
});

router.patch('/orders/:id/status', (req: Request, res: Response): void => {
  const orderId = req.params.id;
  const { status } = req.body;
  const allowed: Array<string> = ['created', 'in_progress', 'completed', 'cancelled'];
  if (!status || !allowed.includes(status)) {
    res.status(400).json({ error: 'Bad request', message: 'status must be one of: ' + allowed.join(', ') });
    return;
  }
  createConnection()
    .then((client) =>
      updateOrderStatus(client, orderId, status as 'created' | 'in_progress' | 'completed' | 'cancelled').then(
        (order) => {
          closeConnection(client);
          return order;
        }
      )
    )
    .then((order) => {
      if (!order) {
        res.status(404).json({ error: 'Not found', message: 'Order not found' });
        return;
      }
      res.json(order);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    });
});

export default router;

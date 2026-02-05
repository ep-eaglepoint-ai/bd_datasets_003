import { Router, Request, Response } from 'express';
import { createConnection, closeConnection } from '../db/client';
import { getUserById } from '../db/users';
import { getOrdersByUserId } from '../db/orders';
import { getLineItemsByOrderId } from '../db/lineItems';

const router = Router();

router.get('/users/:id', (req: Request, res: Response): void => {
  const userId = req.params.id;

  createConnection()
    .then((client) => {
      return getUserById(client, userId)
        .then((user) => {
          if (!user) {
            closeConnection(client);
            res.status(404).json({ error: 'Not found', message: 'User not found' });
            return;
          }
          return getOrdersByUserId(client, userId).then((orders) => ({ client, user, orders }));
        })
        .then((ctx) => {
          if (!ctx) return;
          const { client, user, orders } = ctx;
          const orderIds = orders.map((o) => o.id);
          const lineItemPromises = orderIds.map((orderId) => getLineItemsByOrderId(client, orderId));
          return Promise.all(lineItemPromises).then((lineItemsPerOrder) => {
            const ordersWithLines = orders.map((order, i) => ({
              id: order.id,
              user_id: order.user_id,
              total_cents: order.total_cents,
              created_at: order.created_at,
              line_items: lineItemsPerOrder[i],
            }));
            closeConnection(client);
            const body = {
              id: user.id,
              name: user.name,
              email: user.email,
              created_at: user.created_at,
              orders: ordersWithLines,
            };
            res.status(200).json(body);
          });
        });
    })
    .catch((err) => {
      res.status(500).json({ error: 'Internal server error', message: err.message });
    });
});

export default router;

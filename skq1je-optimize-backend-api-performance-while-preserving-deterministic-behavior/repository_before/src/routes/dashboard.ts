import { Router, Request, Response } from 'express';
import { createConnection, closeConnection } from '../db/client';
import { Client } from 'pg';

const router = Router();

function getTotalUsers(client: Client): Promise<number> {
  return client.query('SELECT COUNT(*)::int AS c FROM users').then((res) => res.rows[0].c);
}

function getTotalOrders(client: Client): Promise<number> {
  return client.query('SELECT COUNT(*)::int AS c FROM orders').then((res) => res.rows[0].c);
}

function getTotalRevenueCents(client: Client): Promise<number> {
  return client.query('SELECT COALESCE(SUM(total_cents), 0)::bigint AS s FROM orders').then((res) => Number(res.rows[0].s));
}

function getOrdersLast24h(client: Client): Promise<number> {
  return client
    .query("SELECT COUNT(*)::int AS c FROM orders WHERE created_at > NOW() - INTERVAL '24 hours'")
    .then((res) => res.rows[0].c);
}

router.get('/dashboard/summary', (_req: Request, res: Response): void => {
  createConnection()
    .then((client) => {
      return Promise.all([
        getTotalUsers(client),
        getTotalOrders(client),
        getTotalRevenueCents(client),
        getOrdersLast24h(client),
      ]).then(([totalUsers, totalOrders, totalRevenueCents, ordersLast24h]) => {
        closeConnection(client);
        const body = {
          total_users: totalUsers,
          total_orders: totalOrders,
          total_revenue_cents: totalRevenueCents,
          orders_last_24h: ordersLast24h,
        };
        res.status(200).json(body);
      });
    })
    .catch((err) => {
      res.status(500).json({ error: 'Internal server error', message: err.message });
    });
});

export default router;

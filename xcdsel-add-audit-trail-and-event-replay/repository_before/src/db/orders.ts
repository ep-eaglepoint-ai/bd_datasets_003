import { Client } from 'pg';
import type { Order, OrderStatus } from '../orders/types';

export function getOrderById(client: Client, orderId: string): Promise<Order | null> {
  return client
    .query(
      'SELECT id, customer_id, total_cents, status, created_at, updated_at FROM orders WHERE id = $1',
      [orderId]
    )
    .then((res) => (res.rows[0] ?? null));
}

export function createOrder(
  client: Client,
  data: { customer_id: string; total_cents: number }
): Promise<Order> {
  return client
    .query(
      `INSERT INTO orders (customer_id, total_cents, status, created_at, updated_at)
       VALUES ($1, $2, 'created', NOW(), NOW())
       RETURNING id, customer_id, total_cents, status, created_at, updated_at`,
      [data.customer_id, data.total_cents]
    )
    .then((res) => res.rows[0]);
}

export function updateOrderStatus(
  client: Client,
  orderId: string,
  status: OrderStatus
): Promise<Order | null> {
  return client
    .query(
      `UPDATE orders SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, customer_id, total_cents, status, created_at, updated_at`,
      [status, orderId]
    )
    .then((res) => (res.rows[0] ?? null));
}

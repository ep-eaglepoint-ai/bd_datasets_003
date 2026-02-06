import { Client } from 'pg';

export function getOrdersByUserId(client: Client, userId: string): Promise<Array<{ id: string; user_id: string; total_cents: number; created_at: Date }>> {
    return client
        .query(
            'SELECT id, user_id, total_cents, created_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        )
        .then((res) => res.rows);
}

export function getOrderById(client: Client, orderId: string): Promise<{ id: string; user_id: string; total_cents: number; created_at: Date } | null> {
    return client
        .query(
            'SELECT id, user_id, total_cents, created_at FROM orders WHERE id = $1',
            [orderId]
        )
        .then((res) => (res.rows[0] ?? null));
}

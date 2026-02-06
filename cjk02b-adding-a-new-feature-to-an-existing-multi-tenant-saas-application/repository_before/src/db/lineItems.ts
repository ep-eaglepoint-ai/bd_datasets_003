import { Client } from 'pg';

export function getLineItemsByOrderId(client: Client, orderId: string): Promise<Array<{ id: string; order_id: string; product_id: string; quantity: number; unit_cents: number }>> {
    return client
        .query(
            'SELECT id, order_id, product_id, quantity, unit_cents FROM line_items WHERE order_id = $1',
            [orderId]
        )
        .then((res) => res.rows);
}

import type { Pool } from "pg";
import type Redis from "ioredis";
import type { OrderItem, ShippingAddress } from "@sut/OrderService";

export const US_WEST_ADDRESS: ShippingAddress = {
  street: "1 Market St",
  city: "San Francisco",
  state: "CA",
  zipCode: "94105",
  country: "US",
};

export const US_EAST_ADDRESS: ShippingAddress = {
  street: "200 Broadway",
  city: "New York",
  state: "NY",
  zipCode: "10007",
  country: "US",
};

export async function seedInventory(
  pool: Pool,
  items: Array<{ productId: string; quantity: number }>
) {
  for (const it of items) {
    await pool.query(
      `INSERT INTO inventory (product_id, quantity) VALUES ($1, $2)
       ON CONFLICT (product_id) DO UPDATE SET quantity = $2, updated_at = NOW()`,
      [it.productId, it.quantity]
    );
  }
}

export function orderItems(
  items: Array<{ productId: string; quantity: number; pricePerUnit: number }>
): OrderItem[] {
  return items;
}

export async function getOrderRow(pool: Pool, orderId: string) {
  const r = await pool.query("SELECT * FROM orders WHERE id = $1", [orderId]);
  return r.rows[0] ?? null;
}

export async function getInventoryQty(
  pool: Pool,
  productId: string
): Promise<number> {
  const r = await pool.query(
    "SELECT quantity FROM inventory WHERE product_id = $1",
    [productId]
  );
  return r.rows[0]?.quantity ?? 0;
}

export async function getReservation(
  redis: Redis,
  productId: string
): Promise<number> {
  const v = await redis.get(`reservation:${productId}`);
  return v ? parseInt(v, 10) : 0;
}

export async function getIdempotency(
  redis: Redis,
  key: string
): Promise<string | null> {
  return redis.get(`idempotency:${key}`);
}

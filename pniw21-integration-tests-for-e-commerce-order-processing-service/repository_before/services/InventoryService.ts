import { Pool } from 'pg';
import { Redis } from 'ioredis';

const RESERVATION_TTL_SECONDS = 15 * 60;

export class InventoryService {
    private pool: Pool;
    private redis: Redis;

    constructor(pool: Pool, redis: Redis) {
        this.pool = pool;
        this.redis = redis;
    }

    async getAvailableQuantity(productId: string): Promise<number> {
        const result = await this.pool.query(
            'SELECT quantity FROM inventory WHERE product_id = $1',
            [productId]
        );

        if (result.rows.length === 0) {
            return 0;
        }

        const dbQuantity = result.rows[0].quantity;
        const reserved = await this.getReservedQuantity(productId);

        return Math.max(0, dbQuantity - reserved);
    }

    async getReservedQuantity(productId: string): Promise<number> {
        const reserved = await this.redis.get(`reservation:${productId}`);
        return reserved ? parseInt(reserved, 10) : 0;
    }

    async reserve(productId: string, quantity: number): Promise<boolean> {
        const lockKey = `lock:inventory:${productId}`;
        const lockAcquired = await this.redis.set(lockKey, '1', 'EX', 10, 'NX');

        if (!lockAcquired) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return this.reserve(productId, quantity);
        }

        try {
            const available = await this.getAvailableQuantity(productId);

            if (available < quantity) {
                return false;
            }

            const reservationKey = `reservation:${productId}`;
            const currentReserved = await this.getReservedQuantity(productId);
            const newReserved = currentReserved + quantity;

            await this.redis.setex(reservationKey, RESERVATION_TTL_SECONDS, newReserved.toString());

            return true;
        } finally {
            await this.redis.del(lockKey);
        }
    }

    async confirmReservation(productId: string, quantity: number): Promise<void> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            await client.query(
                'UPDATE inventory SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2',
                [quantity, productId]
            );

            const reservationKey = `reservation:${productId}`;
            const currentReserved = await this.getReservedQuantity(productId);
            const newReserved = Math.max(0, currentReserved - quantity);

            if (newReserved > 0) {
                const ttl = await this.redis.ttl(reservationKey);
                await this.redis.setex(reservationKey, ttl > 0 ? ttl : RESERVATION_TTL_SECONDS, newReserved.toString());
            } else {
                await this.redis.del(reservationKey);
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async release(productId: string, quantity: number): Promise<void> {
        const reservationKey = `reservation:${productId}`;
        const currentReserved = await this.getReservedQuantity(productId);

        if (currentReserved > 0) {
            const newReserved = Math.max(0, currentReserved - quantity);
            if (newReserved > 0) {
                const ttl = await this.redis.ttl(reservationKey);
                await this.redis.setex(reservationKey, ttl > 0 ? ttl : RESERVATION_TTL_SECONDS, newReserved.toString());
            } else {
                await this.redis.del(reservationKey);
            }
        } else {
            await this.pool.query(
                'UPDATE inventory SET quantity = quantity + $1, updated_at = NOW() WHERE product_id = $2',
                [quantity, productId]
            );
        }
    }

    async setQuantity(productId: string, quantity: number): Promise<void> {
        await this.pool.query(
            `INSERT INTO inventory (product_id, quantity)
             VALUES ($1, $2)
             ON CONFLICT (product_id) DO UPDATE SET quantity = $2, updated_at = NOW()`,
            [productId, quantity]
        );
    }
}

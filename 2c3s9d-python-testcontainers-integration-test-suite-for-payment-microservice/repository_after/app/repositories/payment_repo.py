import json
from app.config import get_db_pool, get_redis
from app.models import Payment


class PaymentRepository:
    async def save(self, payment):
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO payments (id, amount, currency, customer_id, stripe_charge_id, status, idempotency_key)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (id) DO UPDATE SET status = $6
            """, payment.id, payment.amount, payment.currency, payment.customer_id,
                payment.stripe_charge_id, payment.status, payment.idempotency_key)

        redis = await get_redis()
        await redis.delete(f"payment:{payment.id}")

    async def save_refund(self, refund):
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO refunds (id, payment_id, amount, reason, status)
                VALUES ($1, $2, $3, $4, $5)
            """, refund.id, refund.payment_id, refund.amount, refund.reason, refund.status)

    async def get_by_id(self, payment_id: str):
        redis = await get_redis()
        cached = await redis.get(f"payment:{payment_id}")
        if cached:
            return Payment.from_dict(json.loads(cached))

        pool = await get_db_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM payments WHERE id = $1", payment_id)
            if row:
                payment = Payment.from_row(dict(row))
                await redis.setex(f"payment:{payment_id}", 300, json.dumps(payment.to_dict()))
                return payment
        return None

    async def get_by_idempotency_key(self, key: str):
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT * FROM payments WHERE idempotency_key = $1", key)
            return Payment.from_row(dict(row)) if row else None

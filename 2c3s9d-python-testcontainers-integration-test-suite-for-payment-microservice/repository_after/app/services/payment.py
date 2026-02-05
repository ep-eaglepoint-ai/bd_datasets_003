import asyncio
import httpx
import uuid
from app.repositories.payment_repo import PaymentRepository
from app.queue.publisher import EventPublisher
from app.models import Payment


class PaymentService:
    def __init__(self):
        self.repo = PaymentRepository()
        self.publisher = EventPublisher()
        self.stripe_url = "https://api.stripe.com/v1/charges"

    async def create_payment(self, amount: int, currency: str, customer_id: str, idempotency_key: str = None):
        if idempotency_key:
            existing = await self.repo.get_by_idempotency_key(idempotency_key)
            if existing:
                return existing

        charge_id = await self._charge_stripe(amount, currency, customer_id)

        payment = Payment(
            id=str(uuid.uuid4()),
            amount=amount,
            currency=currency,
            customer_id=customer_id,
            stripe_charge_id=charge_id,
            status="completed",
            idempotency_key=idempotency_key
        )

        await self.repo.save(payment)
        await self.publisher.publish("payment.created", {"payment_id": payment.id})

        return payment

    async def _charge_stripe(self, amount: int, currency: str, customer_id: str):
        async with httpx.AsyncClient() as client:
            for attempt in range(3):
                try:
                    response = await client.post(
                        self.stripe_url,
                        data={"amount": amount, "currency": currency, "customer": customer_id},
                        headers={"Authorization": "Bearer sk_test_xxx"},
                        timeout=10.0
                    )
                    response.raise_for_status()
                    return response.json()["id"]
                except httpx.HTTPError:
                    if attempt == 2:
                        raise
                    await asyncio.sleep(2 ** attempt)

    async def get_payment(self, payment_id: str):
        return await self.repo.get_by_id(payment_id)

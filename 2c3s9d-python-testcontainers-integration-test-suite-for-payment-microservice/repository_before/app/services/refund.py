import uuid
from app.repositories.payment_repo import PaymentRepository
from app.services.notification import NotificationService
from app.queue.publisher import EventPublisher
from app.models import Refund


class RefundService:
    def __init__(self):
        self.repo = PaymentRepository()
        self.notification = NotificationService()
        self.publisher = EventPublisher()

    async def process_refund(self, payment_id: str, amount: int = None, reason: str = None):
        payment = await self.repo.get_by_id(payment_id)
        if not payment:
            raise ValueError("Payment not found")

        if payment.status == "refunded":
            raise ValueError("Payment already refunded")

        refund_amount = amount or payment.amount

        refund = Refund(
            id=str(uuid.uuid4()),
            payment_id=payment_id,
            amount=refund_amount,
            reason=reason,
            status="completed"
        )

        payment.status = "refunded"
        await self.repo.save(payment)
        await self.repo.save_refund(refund)

        await self.notification.send_refund_notification(payment.customer_id, refund)
        await self.publisher.publish("refund.created", {"refund_id": refund.id})

        return refund

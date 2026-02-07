from pydantic import BaseModel
from typing import Optional


class PaymentRequest(BaseModel):
    amount: int
    currency: str
    customer_id: str
    idempotency_key: Optional[str] = None


class RefundRequest(BaseModel):
    amount: Optional[int] = None
    reason: Optional[str] = None

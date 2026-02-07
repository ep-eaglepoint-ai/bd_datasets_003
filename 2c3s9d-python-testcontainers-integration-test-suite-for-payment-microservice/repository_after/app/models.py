from dataclasses import dataclass
from typing import Optional


@dataclass
class Payment:
    id: str
    amount: int
    currency: str
    customer_id: str
    stripe_charge_id: str
    status: str
    idempotency_key: Optional[str] = None

    def to_dict(self):
        return {
            "id": self.id,
            "amount": self.amount,
            "currency": self.currency,
            "customer_id": self.customer_id,
            "stripe_charge_id": self.stripe_charge_id,
            "status": self.status,
            "idempotency_key": self.idempotency_key
        }

    @classmethod
    def from_dict(cls, data):
        return cls(
            id=data["id"],
            amount=data["amount"],
            currency=data["currency"],
            customer_id=data["customer_id"],
            stripe_charge_id=data["stripe_charge_id"],
            status=data["status"],
            idempotency_key=data.get("idempotency_key")
        )

    @classmethod
    def from_row(cls, row):
        return cls(
            id=row["id"],
            amount=row["amount"],
            currency=row["currency"],
            customer_id=row["customer_id"],
            stripe_charge_id=row["stripe_charge_id"],
            status=row["status"],
            idempotency_key=row.get("idempotency_key")
        )


@dataclass
class Refund:
    id: str
    payment_id: str
    amount: int
    reason: Optional[str]
    status: str

    def to_dict(self):
        return {
            "id": self.id,
            "payment_id": self.payment_id,
            "amount": self.amount,
            "reason": self.reason,
            "status": self.status
        }

    @classmethod
    def from_dict(cls, data):
        return cls(
            id=data["id"],
            payment_id=data["payment_id"],
            amount=data["amount"],
            reason=data.get("reason"),
            status=data["status"]
        )

    @classmethod
    def from_row(cls, row):
        return cls(
            id=row["id"],
            payment_id=row["payment_id"],
            amount=row["amount"],
            reason=row.get("reason"),
            status=row["status"]
        )

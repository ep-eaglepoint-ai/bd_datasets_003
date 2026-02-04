from dataclasses import dataclass
from typing import Optional, List
from datetime import datetime
from enum import Enum


class PaymentStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"


class NotificationChannel(str, Enum):
    EMAIL = "email"
    SMS = "sms"
    PUSH = "push"


@dataclass
class User:
    id: str
    email: str
    name: str
    created_at: datetime
    is_active: bool = True
    metadata: Optional[dict] = None


@dataclass
class Payment:
    id: str
    user_id: str
    amount: float
    currency: str
    status: PaymentStatus
    created_at: datetime
    transaction_id: Optional[str] = None
    error_message: Optional[str] = None


@dataclass
class Notification:
    id: str
    user_id: str
    channel: NotificationChannel
    subject: str
    body: str
    sent_at: Optional[datetime] = None
    delivered: bool = False


@dataclass
class PaginatedResponse:
    items: List
    total: int
    page: int
    per_page: int
    has_next: bool

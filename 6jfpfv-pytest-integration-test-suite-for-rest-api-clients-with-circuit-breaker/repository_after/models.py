from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class UserStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class PaymentStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"


class NotificationChannel(str, Enum):
    EMAIL = "email"
    SMS = "sms"
    PUSH = "push"


class NotificationStatus(str, Enum):
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"


class User(BaseModel):
    id: str
    email: str
    name: str
    status: UserStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class CreateUserRequest(BaseModel):
    email: str
    name: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    status: Optional[UserStatus] = None
    metadata: Optional[Dict[str, Any]] = None


class Payment(BaseModel):
    id: str
    amount: float
    currency: str
    status: PaymentStatus
    customer_id: str
    description: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class CreatePaymentRequest(BaseModel):
    amount: float
    currency: str
    customer_id: str
    description: Optional[str] = None


class RefundRequest(BaseModel):
    payment_id: str
    amount: Optional[float] = None
    reason: Optional[str] = None


class Transaction(BaseModel):
    id: str
    payment_id: str
    type: str
    amount: float
    status: str
    created_at: datetime


class Notification(BaseModel):
    id: str
    channel: NotificationChannel
    recipient: str
    subject: Optional[str] = None
    body: str
    status: NotificationStatus
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    error: Optional[str] = None


class SendNotificationRequest(BaseModel):
    channel: NotificationChannel
    recipient: str
    subject: Optional[str] = None
    body: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ListUsersResponse(BaseModel):
    users: List[User]

from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class WebhookStatus(enum.Enum):
    ACTIVE = "active"
    DISABLED = "disabled"


class DeliveryStatus(enum.Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    RETRYING = "retrying"


class WebhookEndpoint(Base):
    __tablename__ = "webhook_endpoints"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), nullable=False, index=True)
    url = Column(String(2048), nullable=False)
    secret = Column(String(64), nullable=False)  # For HMAC signing
    status = Column(Enum(WebhookStatus), default=WebhookStatus.ACTIVE)
    event_types = Column(Text)  # JSON array of subscribed event types
    timeout_seconds = Column(Integer, default=30)
    consecutive_failures = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    deliveries = relationship("WebhookDelivery", back_populates="endpoint")


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id = Column(String(36), primary_key=True)
    endpoint_id = Column(String(36), ForeignKey("webhook_endpoints.id"), nullable=False)
    event_type = Column(String(100), nullable=False)
    payload = Column(Text, nullable=False)  # JSON payload
    idempotency_key = Column(String(64), unique=True, nullable=False)
    status = Column(Enum(DeliveryStatus), default=DeliveryStatus.PENDING)
    attempt_count = Column(Integer, default=0)
    max_attempts = Column(Integer, default=5)
    next_retry_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)

    endpoint = relationship("WebhookEndpoint", back_populates="deliveries")
    attempts = relationship("DeliveryAttempt", back_populates="delivery")


class DeliveryAttempt(Base):
    __tablename__ = "delivery_attempts"

    id = Column(String(36), primary_key=True)
    delivery_id = Column(String(36), ForeignKey("webhook_deliveries.id"), nullable=False)
    attempt_number = Column(Integer, nullable=False)
    status_code = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    response_time_ms = Column(Integer, nullable=True)
    attempted_at = Column(DateTime, server_default=func.now())

    delivery = relationship("WebhookDelivery", back_populates="attempts")

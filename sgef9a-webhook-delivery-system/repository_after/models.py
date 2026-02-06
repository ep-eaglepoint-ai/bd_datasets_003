"""
Database models for the webhook delivery system.

This module defines SQLAlchemy async models for webhook subscriptions,
delivery attempts, and health tracking.
"""

import uuid
from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    Boolean,
    Float,
    UniqueConstraint,
    Index,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, relationship


class DeliveryStatus(str, PyEnum):
    """Status of a webhook delivery attempt."""
    PENDING = "PENDING"
    RETRYING = "RETRYING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


class Base(AsyncAttrs, DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


class Webhook(Base):
    """
    Webhook subscription model.
    
    Stores webhook endpoint configuration including URL, events to subscribe,
    and cryptographic secret key for payload signing.
    """
    __tablename__ = "webhooks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    url = Column(String(2048), nullable=False)
    events = Column(Text, nullable=False)  # JSON array of event types
    description = Column(String(500), nullable=True)
    
    # Cryptographic secret key for HMAC-SHA256 signatures
    secret_key = Column(String(64), nullable=False, unique=True)
    
    # Status tracking - uses default= with callable for Python-side defaults
    is_active = Column(Boolean, default=lambda: True, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    delivery_attempts = relationship("DeliveryAttempt", back_populates="webhook", cascade="all, delete-orphan")
    health = relationship("WebhookHealth", back_populates="webhook", uselist=False, cascade="all, delete-orphan")
    
    def __init__(self, **kwargs):
        # Apply Python-side defaults for non-database defaults
        if 'is_active' not in kwargs:
            kwargs['is_active'] = True
        super().__init__(**kwargs)
    
    def __repr__(self) -> str:
        return f"<Webhook(id={self.id}, url={self.url}, is_active={self.is_active})>"


class DeliveryAttempt(Base):
    """
    Webhook delivery attempt tracking.
    
    Records each attempt to deliver a webhook payload, including status,
    response codes, and error messages for debugging and monitoring.
    """
    __tablename__ = "delivery_attempts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    webhook_id = Column(UUID(as_uuid=True), ForeignKey("webhooks.id", ondelete="CASCADE"), nullable=False)
    
    # Idempotency key to prevent duplicate deliveries
    idempotency_key = Column(String(255), nullable=True)
    
    # Delivery tracking
    attempt_number = Column(Integer, default=1, nullable=False)
    status = Column(Enum(DeliveryStatus), default=DeliveryStatus.PENDING, nullable=False)
    
    # Payload information
    payload = Column(Text, nullable=True)  # JSON payload that was sent
    payload_size = Column(Integer, nullable=True)  # Size in bytes
    
    # Response information
    response_code = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)  # Truncated response body
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    next_retry_at = Column(DateTime(timezone=True), nullable=True)  # For scheduled retries
    
    # Relationships
    webhook = relationship("Webhook", back_populates="delivery_attempts")
    
    # Indexes for efficient querying
    __table_args__ = (
        Index("ix_delivery_attempts_webhook_id_created_at", "webhook_id", "created_at"),
        Index("ix_delivery_attempts_status", "status"),
        UniqueConstraint("webhook_id", "idempotency_key", name="uq_webhook_idempotency_key"),
    )
    
    def __init__(self, **kwargs):
        # Apply Python-side defaults for non-database defaults
        if 'attempt_number' not in kwargs:
            kwargs['attempt_number'] = 1
        if 'status' not in kwargs:
            kwargs['status'] = DeliveryStatus.PENDING
        super().__init__(**kwargs)
    
    def __repr__(self) -> str:
        return f"<DeliveryAttempt(id={self.id}, webhook_id={self.webhook_id}, status={self.status}, attempt={self.attempt_number})>"


class WebhookHealth(Base):
    """
    Webhook endpoint health tracking.
    
    Maintains health scores based on recent delivery success rates,
    using an exponential moving average to weight recent results more heavily.
    """
    __tablename__ = "webhook_health"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    webhook_id = Column(UUID(as_uuid=True), ForeignKey("webhooks.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    # Counters
    success_count = Column(Integer, default=0, nullable=False)
    failure_count = Column(Integer, default=0, nullable=False)
    
    # Last result timestamps
    last_success_at = Column(DateTime(timezone=True), nullable=True)
    last_failure_at = Column(DateTime(timezone=True), nullable=True)
    
    # Health score (0.0 to 1.0, exponential moving average)
    health_score = Column(Float, default=1.0, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    webhook = relationship("Webhook", back_populates="health")
    
    def __init__(self, **kwargs):
        # Apply Python-side defaults for non-database defaults
        if 'success_count' not in kwargs:
            kwargs['success_count'] = 0
        if 'failure_count' not in kwargs:
            kwargs['failure_count'] = 0
        if 'health_score' not in kwargs:
            kwargs['health_score'] = 1.0
        super().__init__(**kwargs)
    
    def __repr__(self) -> str:
        return f"<WebhookHealth(webhook_id={self.webhook_id}, health_score={self.health_score:.2f})>"

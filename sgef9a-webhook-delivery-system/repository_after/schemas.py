"""
Pydantic schemas for webhook delivery API.

This module defines request and response schemas for webhook management
and delivery operations.
"""

from datetime import datetime
from typing import Optional, List, Any, Dict
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl, field_validator


# ============ Webhook Schemas ============

class WebhookCreate(BaseModel):
    """Schema for creating a new webhook subscription."""
    url: HttpUrl = Field(..., description="Webhook endpoint URL")
    events: List[str] = Field(..., description="Event types to subscribe to")
    description: Optional[str] = Field(None, max_length=500)
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "url": "https://example.com/webhook",
                "events": ["order.created", "order.updated"],
                "description": "Receive order notifications"
            }
        }
    }


class WebhookUpdate(BaseModel):
    """Schema for updating a webhook subscription."""
    url: Optional[HttpUrl] = Field(None, description="Webhook endpoint URL")
    events: Optional[List[str]] = Field(None, description="Event types to subscribe to")
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = Field(None, description="Whether the webhook is active")


class WebhookResponse(BaseModel):
    """Schema for webhook response."""
    id: UUID
    url: str
    events: List[str]
    description: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    model_config = {
        "from_attributes": True
    }


class WebhookWithSecret(WebhookResponse):
    """Schema for webhook response including secret key (only on creation)."""
    secret_key: str


# ============ Delivery Schemas ============

class DeliveryAttemptResponse(BaseModel):
    """Schema for delivery attempt response."""
    id: UUID
    webhook_id: UUID
    idempotency_key: Optional[str]
    attempt_number: int
    status: str
    response_code: Optional[int]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]
    next_retry_at: Optional[str]  # ISO format string for JSON serialization
    
    model_config = {
        "from_attributes": True
    }


class DeliveryHistoryResponse(BaseModel):
    """Schema for paginated delivery history response."""
    items: List[DeliveryAttemptResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class DeliveryRetryRequest(BaseModel):
    """Schema for manual retry request."""
    idempotency_key: Optional[str] = Field(None, description="Optional new idempotency key")


class DeliveryRetryResponse(BaseModel):
    """Schema for retry response."""
    message: str
    new_delivery_id: UUID
    original_delivery_id: UUID


# ============ Health Schemas ============

class WebhookHealthResponse(BaseModel):
    """Schema for webhook health response."""
    webhook_id: UUID
    success_count: int
    failure_count: int
    health_score: float
    last_success_at: Optional[datetime]
    last_failure_at: Optional[datetime]
    
    model_config = {
        "from_attributes": True
    }


# ============ Test Schemas ============

class WebhookTestRequest(BaseModel):
    """Schema for webhook test request."""
    payload: Dict[str, Any] = Field(
        default_factory=lambda: {"event": "test", "timestamp": "${timestamp}"},
        description="Custom test payload"
    )
    idempotency_key: Optional[str] = Field(None, description="Optional idempotency key")


class WebhookTestResponse(BaseModel):
    """Schema for webhook test response."""
    message: str
    delivery_id: UUID
    status: str
    response_code: Optional[int]
    response_time_ms: float


# ============ Common Schemas ============

class ErrorResponse(BaseModel):
    """Schema for error responses."""
    detail: str
    error_code: Optional[str] = None


class HealthCheckResponse(BaseModel):
    """Schema for service health check."""
    status: str
    database: str
    scheduler: str
    timestamp: datetime

from pydantic import BaseModel, HttpUrl, field_validator
from typing import Optional, List
import json
from datetime import datetime
from app.models.webhook import WebhookStatus, DeliveryStatus


class WebhookEndpointCreate(BaseModel):
    url: HttpUrl
    event_types: List[str]
    timeout_seconds: Optional[int] = 30


class WebhookEndpointUpdate(BaseModel):
    url: Optional[HttpUrl] = None
    event_types: Optional[List[str]] = None
    timeout_seconds: Optional[int] = None
    status: Optional[WebhookStatus] = None


class WebhookEndpointResponse(BaseModel):
    id: str
    url: str
    status: WebhookStatus
    event_types: List[str]
    timeout_seconds: int
    consecutive_failures: int
    created_at: datetime
    # secret: str  # Requirement 14 says secret shown only once at creation. So maybe specific response model for create? 
    # But this is the general response. I will leave it out or add it only if needed.
    # Actually, the user requirement says "shown to users only once at creation time". 
    # So I probably need a WebhookEndpointCreateResponse that includes the secret.

    @field_validator('event_types', mode='before')
    @classmethod
    def parse_event_types(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return []
        return v

    class Config:
        from_attributes = True

class WebhookEndpointSecretResponse(WebhookEndpointResponse):
    secret: str

class DeliveryAttemptResponse(BaseModel):
    id: str
    attempt_number: int
    status_code: Optional[int]
    error_message: Optional[str]
    response_time_ms: Optional[int]
    attempted_at: datetime

    class Config:
        from_attributes = True


class WebhookDeliveryResponse(BaseModel):
    id: str
    endpoint_id: str
    event_type: str
    status: DeliveryStatus
    attempt_count: int
    next_retry_at: Optional[datetime]
    created_at: datetime
    completed_at: Optional[datetime]
    attempts: List[DeliveryAttemptResponse] = []

    class Config:
        from_attributes = True

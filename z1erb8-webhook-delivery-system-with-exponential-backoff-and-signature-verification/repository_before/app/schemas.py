from pydantic import BaseModel, HttpUrl
from typing import List, Optional
from datetime import datetime
from uuid import UUID
from app.events.types import EventType

class WebhookCreate(BaseModel):
    url: HttpUrl
    events: List[EventType]
    description: Optional[str] = None

class WebhookResponse(BaseModel):
    id: UUID
    url: str
    events: List[str]
    secret: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class DeliveryResponse(BaseModel):
    id: UUID
    webhook_id: UUID
    event_type: str
    status: str
    attempts: int
    created_at: datetime
    last_attempt_at: Optional[datetime]

    class Config:
        from_attributes = True

class EventPayload(BaseModel):
    event_type: EventType
    data: dict

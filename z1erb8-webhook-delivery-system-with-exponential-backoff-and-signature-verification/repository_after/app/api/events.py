from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, Any, List
from app.database import get_db
from app.models.webhook import WebhookEndpoint, WebhookStatus
from app.services import webhook_service
from app.celery_app import delivery_task
import json

router = APIRouter()


class EventPayload(BaseModel):
    event_type: str
    data: Dict[str, Any]


@router.post("/trigger")
async def trigger_event(
    event: EventPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Trigger an event that will be delivered to all subscribed webhook endpoints.
    This endpoint is called internally when events occur in the system.
    """
    # - Find all active endpoints subscribed to this event type
    # Since event_types is stored as JSON text, we might need to filter in python 
    # or use postgres json operators if it was JSONB. It is Text.
    # So we fetch all active endpoints and filter in code.
    # Optimization: Filter by user_id if needed, but this is a system-wide trigger.
    # Requirement 9: "filter endpoints and only send to those whose subscription list includes the event type"
    
    active_endpoints = db.query(WebhookEndpoint).filter(
        WebhookEndpoint.status == WebhookStatus.ACTIVE
    ).all()
    
    deliveries = []
    
    for endpoint in active_endpoints:
        # Check subscription
        try:
            subscribed_events = json.loads(endpoint.event_types)
        except:
            continue
            
        if event.event_type in subscribed_events or "*" in subscribed_events:
            # Create delivery
            delivery = webhook_service.create_delivery(
                db, 
                endpoint, 
                event.event_type, 
                event.data
            )
            deliveries.append(delivery)
            
    # Queue deliveries
    for d in deliveries:
        # Requirement 1: "event trigger endpoint returns immediately ... actual ... in background worker"
        # task queue (Celery)
        delivery_task.delay(d.id)
        
    return {"status": "triggered", "delivery_count": len(deliveries)}

import httpx
import asyncio
import time
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from app.models.webhook import WebhookDelivery, DeliveryStatus
from app.services import webhook_service
from app.database import SessionLocal  # Import sessionmaker directly

async def deliver_webhook(
    db: Session,
    delivery: WebhookDelivery
) -> bool:
    """
    Attempt to deliver a webhook to its endpoint.
    Returns True if delivery was successful, False otherwise.
    """
    endpoint = delivery.endpoint
    
    # Check timeout
    timeout = endpoint.timeout_seconds
    
    # Generate signature
    signature = webhook_service.generate_signature(delivery.payload, endpoint.secret)
    
    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": delivery.event_type,
        "X-Webhook-Delivery-ID": delivery.id,
        "X-Webhook-Timestamp": datetime.utcnow().isoformat() + "Z",
        "X-Webhook-Attempt": str(delivery.attempt_count + 1),
        "Idempotency-Key": delivery.idempotency_key,
        "User-Agent": "Webhook-Delivery-System/1.0"
    }
    
    start_time = time.time()
    status_code = None
    response_body = None
    error_message = None
    
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                endpoint.url, 
                content=delivery.payload, 
                headers=headers
            )
            status_code = response.status_code
            response_body = response.text
            
            # Raise for status to trigger exception on 4xx/5xx if needed, 
            # but usually we just log the code.
            # We consider 200-299 as success.
            if not (200 <= status_code < 300):
                error_message = f"HTTP {status_code}"
                
    except httpx.TimeoutException:
        error_message = "Request timed out"
    except httpx.RequestError as e:
        error_message = f"Request error: {str(e)}"
    except Exception as e:
        error_message = f"Unexpected error: {str(e)}"
        
    duration_ms = int((time.time() - start_time) * 100) # Typo in my calculation? * 1000 for ms
    duration_ms = int((time.time() - start_time) * 1000)

    # Record attempt
    webhook_service.record_attempt(
        db,
        delivery,
        status_code,
        response_body,
        error_message,
        duration_ms
    )
    
    return status_code is not None and 200 <= status_code < 300


async def process_delivery_by_id(delivery_id: str):
    """Process a single delivery by ID (used by Celery task)"""
    db = SessionLocal()
    try:
        delivery = db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id).first()
        if not delivery:
            return
            
        await deliver_webhook(db, delivery)
    finally:
        db.close()


async def process_pending_deliveries(db: Session):
    """Process all pending webhook deliveries (for polling)"""
    deliveries = webhook_service.get_pending_deliveries(db)
    
    for delivery in deliveries:
        # In a real poller, we might enqueue them to Celery. 
        # For the skeleton 'run_delivery_worker', we might process them sequentially or parallel.
        # Given constraint 1: "using a task queue", this poller should probably just enqueue them.
        # But if this is the ONLY worker, it must do the work.
        # The prompt implies: "The event trigger ... returns immediately ... actual ... happens in a background worker process".
        # I will reuse the generic 'process_delivery_by_id' logic, but here assume we are calling it directly or via task.
        await deliver_webhook(db, delivery)


# This would typically be called by a Celery task or similar
def run_delivery_worker():
    """Entry point for the delivery worker (Polling Loop)"""
    while True:
        db = SessionLocal()
        try:
            # We need an event loop to run async code in this sync function
            asyncio.run(process_pending_deliveries(db))
        except Exception as e:
            print(f"Error in delivery worker: {e}")
        finally:
            db.close()
        
        time.sleep(10) # 10 second poll interval

import json
import hmac
import hashlib
import uuid
import secrets
import random
from datetime import datetime, timedelta
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models.webhook import (
    WebhookEndpoint,
    WebhookDelivery,
    DeliveryAttempt,
    WebhookStatus,
    DeliveryStatus,
)
from app.config import RETRY_DELAYS, CONSECUTIVE_FAILURE_THRESHOLD


def generate_signature(payload: str, secret: str) -> str:
    """Generate HMAC-SHA256 signature for webhook payload"""
    if not isinstance(payload, bytes):
        payload = payload.encode('utf-8')
    if not isinstance(secret, bytes):
        secret = secret.encode('utf-8')
    
    signature = hmac.new(secret, payload, hashlib.sha256).hexdigest()
    return signature


def generate_idempotency_key(endpoint_id: str, event_type: str, payload: str) -> str:
    """Generate unique idempotency key to prevent duplicate deliveries"""
    data = f"{endpoint_id}:{event_type}:{payload}"
    return hashlib.sha256(data.encode('utf-8')).hexdigest()


def calculate_next_retry(attempt_count: int) -> Optional[datetime]:
    """Calculate next retry time using exponential backoff with jitter"""
    if attempt_count >= len(RETRY_DELAYS):
        return None  # No more retries
    
    delay_seconds = RETRY_DELAYS[attempt_count]
    
    # Add random jitter: +/- 10% of delay
    jitter_range = delay_seconds * 0.1
    jitter = random.uniform(-jitter_range, jitter_range)
    
    total_delay = max(0, delay_seconds + jitter)
    return datetime.utcnow() + timedelta(seconds=total_delay)


def create_endpoint(
    db: Session,
    user_id: str,
    url: str,
    event_types: List[str],
    timeout_seconds: int = 30
) -> WebhookEndpoint:
    """Create a new webhook endpoint"""
    # Requirement 14: secure secret
    secret = secrets.token_hex(32)  # 32 bytes = 64 chars hex
    
    endpoint = WebhookEndpoint(
        id=str(uuid.uuid4()),
        user_id=user_id,
        url=url,
        secret=secret,
        event_types=json.dumps(event_types),
        timeout_seconds=timeout_seconds,
        status=WebhookStatus.ACTIVE
    )
    db.add(endpoint)
    db.commit()
    db.refresh(endpoint)
    return endpoint


def create_delivery(
    db: Session,
    endpoint: WebhookEndpoint,
    event_type: str,
    payload: dict
) -> WebhookDelivery:
    """Create a new webhook delivery record"""
    payload_json = json.dumps(payload)
    idempotency_key = generate_idempotency_key(endpoint.id, event_type, payload_json)
    
    # Check for existing delivery
    existing = db.query(WebhookDelivery).filter(
        WebhookDelivery.idempotency_key == idempotency_key
    ).first()
    
    if existing:
        return existing
        
    delivery = WebhookDelivery(
        id=str(uuid.uuid4()),
        endpoint_id=endpoint.id,
        event_type=event_type,
        payload=payload_json,
        idempotency_key=idempotency_key,
        status=DeliveryStatus.PENDING,
        attempt_count=0,
        max_attempts=len(RETRY_DELAYS)
    )
    db.add(delivery)
    db.commit()
    db.refresh(delivery)
    return delivery


def record_attempt(
    db: Session,
    delivery: WebhookDelivery,
    status_code: Optional[int],
    response_body: Optional[str],
    error_message: Optional[str],
    response_time_ms: int
) -> DeliveryAttempt:
    """Record a delivery attempt and update delivery status"""
    
    # Create attempt record
    attempt = DeliveryAttempt(
        id=str(uuid.uuid4()),
        delivery_id=delivery.id,
        attempt_number=delivery.attempt_count + 1,
        status_code=status_code,
        response_body=response_body[:1000] if response_body else None, # Truncate log
        error_message=error_message,
        response_time_ms=response_time_ms
    )
    db.add(attempt)
    
    delivery.attempt_count += 1
    
    is_success = status_code is not None and 200 <= status_code < 300
    
    if is_success:
        delivery.status = DeliveryStatus.SUCCESS
        delivery.completed_at = datetime.utcnow()
        delivery.endpoint.consecutive_failures = 0
    else:
        # Failure logic
        delivery.endpoint.consecutive_failures += 1
        
        # Disable endpoint if too many failures
        if delivery.endpoint.consecutive_failures >= CONSECUTIVE_FAILURE_THRESHOLD:
            delivery.endpoint.status = WebhookStatus.DISABLED
            delivery.status = DeliveryStatus.FAILED
            delivery.completed_at = datetime.utcnow()
        elif delivery.attempt_count >= delivery.max_attempts:
            delivery.status = DeliveryStatus.FAILED
            delivery.completed_at = datetime.utcnow()
        else:
            delivery.status = DeliveryStatus.RETRYING
            delivery.next_retry_at = calculate_next_retry(delivery.attempt_count - 1)
            
    db.commit()
    return attempt


def get_pending_deliveries(db: Session, limit: int = 100) -> List[WebhookDelivery]:
    """Get deliveries that are ready to be processed"""
    now = datetime.utcnow()
    return db.query(WebhookDelivery).join(WebhookEndpoint).filter(
        WebhookDelivery.status.in_([DeliveryStatus.PENDING, DeliveryStatus.RETRYING]),
        (WebhookDelivery.next_retry_at == None) | (WebhookDelivery.next_retry_at <= now),
        WebhookEndpoint.status == WebhookStatus.ACTIVE
    ).limit(limit).all()

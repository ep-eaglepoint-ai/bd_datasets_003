"""
Webhook delivery engine.

This module handles the actual delivery of webhooks with:
- Async HTTP delivery using httpx
- Signature generation and inclusion
- Idempotency key support
- Delivery attempt tracking and persistence
- Health score updates
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import DeliveryAttempt, Webhook, WebhookHealth, DeliveryStatus
from signatures import create_signed_payload
from retry import (
    calculate_retry_delay,
    get_next_retry_time,
    should_retry,
    DEFAULT_MAX_ATTEMPTS,
    DEFAULT_BASE_DELAY_SECONDS,
    DEFAULT_JITTER_RANGE,
)


logger = logging.getLogger(__name__)

# Default configuration
DEFAULT_PAYLOAD_SIZE_LIMIT = 256 * 1024  # 256KB
MAX_RESPONSE_BODY_SIZE = 10 * 1024  # 10KB (truncated response storage)


class DeliveryError(Exception):
    """Exception raised when webhook delivery fails."""
    pass


class PayloadTooLargeError(DeliveryError):
    """Exception raised when payload exceeds size limit."""
    pass


class DuplicateDeliveryError(DeliveryError):
    """Exception raised when idempotency key already exists."""
    pass


async def check_idempotency(
    session: AsyncSession,
    webhook_id: UUID,
    idempotency_key: str
) -> Optional[DeliveryAttempt]:
    """
    Check if a delivery with the given idempotency key already exists.
    
    Args:
        session: Database session.
        webhook_id: The webhook endpoint ID.
        idempotency_key: The idempotency key.
    
    Returns:
        Existing DeliveryAttempt if found, None otherwise.
    """
    result = await session.execute(
        select(DeliveryAttempt)
        .where(DeliveryAttempt.webhook_id == webhook_id)
        .where(DeliveryAttempt.idempotency_key == idempotency_key)
    )
    return result.scalar_one_or_none()


async def create_delivery_attempt(
    session: AsyncSession,
    webhook: Webhook,
    payload: Dict[str, Any],
    idempotency_key: Optional[str] = None
) -> DeliveryAttempt:
    """
    Create a new delivery attempt record.
    
    Args:
        session: Database session.
        webhook: The webhook endpoint.
        payload: The payload to deliver.
        idempotency_key: Optional idempotency key.
    
    Returns:
        Created DeliveryAttempt.
    """
    # Check for existing idempotent delivery
    if idempotency_key:
        existing = await check_idempotency(session, webhook.id, idempotency_key)
        if existing:
            # Return existing successful delivery if available
            if existing.status == DeliveryStatus.SUCCESS:
                return existing
            # For failed/retrying, we'll create a new attempt
            # (allow retry with same idempotency key)
    
    # Serialize payload
    payload_json = json.dumps(payload, separators=(',', ':'))
    payload_bytes = payload_json.encode('utf-8')
    payload_size = len(payload_bytes)
    
    # Check payload size
    if payload_size > DEFAULT_PAYLOAD_SIZE_LIMIT:
        raise PayloadTooLargeError(
            f"Payload size {payload_size} bytes exceeds limit {DEFAULT_PAYLOAD_SIZE_LIMIT} bytes"
        )
    
    # Create delivery attempt
    attempt = DeliveryAttempt(
        webhook_id=webhook.id,
        idempotency_key=idempotency_key,
        attempt_number=1,
        status=DeliveryStatus.PENDING,
        payload=payload_json,
        payload_size=payload_size,
        created_at=datetime.now(timezone.utc),
    )
    
    session.add(attempt)
    await session.commit()
    await session.refresh(attempt)
    
    return attempt


async def deliver_webhook(
    session: AsyncSession,
    attempt: DeliveryAttempt,
    webhook: Webhook
) -> DeliveryAttempt:
    """
    Execute a single webhook delivery attempt.
    
    Args:
        session: Database session.
        attempt: The delivery attempt record.
        webhook: The webhook endpoint.
    
    Returns:
        Updated DeliveryAttempt with response information.
    """
    # Create signed payload
    payload_bytes, signature_header, timestamp = create_signed_payload(
        webhook.secret_key,
        json.loads(attempt.payload)
    )
    
    # Prepare headers
    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature_header,
        "X-Webhook-Timestamp": str(timestamp),
        "X-Webhook-Delivery-ID": str(attempt.id),
        "User-Agent": "WebhookDeliverySystem/1.0",
    }
    
    # Add idempotency key if present
    if attempt.idempotency_key:
        headers["X-Idempotency-Key"] = attempt.idempotency_key
    
    try:
        # Execute HTTP POST
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                webhook.url,
                content=payload_bytes,
                headers=headers
            )
        
        # Determine success based on status code
        is_success = 200 <= response.status_code < 300
        
        # Extract response body (truncated)
        response_body = response.text[:MAX_RESPONSE_BODY_SIZE]
        
        # Update attempt record
        attempt.status = DeliveryStatus.SUCCESS if is_success else DeliveryStatus.FAILED
        attempt.response_code = response.status_code
        attempt.response_body = response_body
        attempt.completed_at = datetime.now(timezone.utc)
        
        # Update health score
        await update_health_score(session, webhook.id, is_success)
        
    except httpx.TimeoutException as e:
        attempt.status = DeliveryStatus.FAILED
        attempt.error_message = f"Timeout: {str(e)}"
        attempt.completed_at = datetime.now(timezone.utc)
        await update_health_score(session, webhook.id, False)
        
    except httpx.ConnectError as e:
        attempt.status = DeliveryStatus.FAILED
        attempt.error_message = f"Connection error: {str(e)}"
        attempt.completed_at = datetime.now(timezone.utc)
        await update_health_score(session, webhook.id, False)
        
    except Exception as e:
        attempt.status = DeliveryStatus.FAILED
        attempt.error_message = f"Unexpected error: {str(e)}"
        attempt.completed_at = datetime.now(timezone.utc)
        await update_health_score(session, webhook.id, False)
        logger.exception(f"Unexpected error during webhook delivery: {e}")
    
    await session.commit()
    await session.refresh(attempt)
    
    return attempt


async def schedule_retry(
    session: AsyncSession,
    attempt: DeliveryAttempt,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    base_delay: float = DEFAULT_BASE_DELAY_SECONDS,
    jitter_range: float = DEFAULT_JITTER_RANGE
) -> Optional[DeliveryAttempt]:
    """
    Schedule a retry for a failed delivery.
    
    Args:
        session: Database session.
        attempt: The failed delivery attempt.
        max_attempts: Maximum retry attempts.
        base_delay: Base delay for exponential backoff.
        jitter_range: Jitter range for retry spreading.
    
    Returns:
        New DeliveryAttempt for the retry, or None if max attempts exceeded.
    """
    next_attempt_number = attempt.attempt_number + 1
    
    # Check if we should retry
    if not should_retry(next_attempt_number, max_attempts):
        logger.info(
            f"Max retries exceeded for delivery {attempt.id} "
            f"({attempt.attempt_number}/{max_attempts})"
        )
        return None
    
    # Calculate next retry time
    next_retry_at = get_next_retry_time(
        next_attempt_number,
        base_delay,
        jitter_range
    )
    
    # Create new attempt for retry
    retry_attempt = DeliveryAttempt(
        webhook_id=attempt.webhook_id,
        idempotency_key=attempt.idempotency_key,  # Preserve idempotency key
        attempt_number=next_attempt_number,
        status=DeliveryStatus.RETRYING,
        payload=attempt.payload,
        payload_size=attempt.payload_size,
        created_at=datetime.now(timezone.utc),
        next_retry_at=next_retry_at,
    )
    
    session.add(retry_attempt)
    
    # Update original attempt status
    attempt.status = DeliveryStatus.RETRYING
    attempt.next_retry_at = next_retry_at
    
    await session.commit()
    await session.refresh(retry_attempt)
    
    return retry_attempt


async def update_health_score(
    session: AsyncSession,
    webhook_id: UUID,
    success: bool
) -> None:
    """
    Update webhook health score using exponential moving average.
    
    Uses alpha=0.2 to weight recent results more heavily than historical ones.
    
    Args:
        session: Database session.
        webhook_id: The webhook ID.
        success: Whether the delivery was successful.
    """
    # Get or create health record
    result = await session.execute(
        select(WebhookHealth).where(WebhookHealth.webhook_id == webhook_id)
    )
    health = result.scalar_one_or_none()
    
    if health is None:
        health = WebhookHealth(webhook_id=webhook_id)
        session.add(health)
    
    # Update counters
    now = datetime.now(timezone.utc)
    if success:
        health.success_count += 1
        health.last_success_at = now
    else:
        health.failure_count += 1
        health.last_failure_at = now
    
    # Calculate health score using exponential moving average
    # alpha = 0.2 gives each new result 20% weight
    alpha = 0.2
    total = health.success_count + health.failure_count
    
    if total == 0:
        health.health_score = 1.0
    else:
        # Simple ratio weighted by EMA
        success_rate = health.success_count / total
        health.health_score = alpha * success_rate + (1 - alpha) * health.health_score
    
    await session.commit()


async def process_delivery(
    session: AsyncSession,
    webhook: Webhook,
    payload: Dict[str, Any],
    idempotency_key: Optional[str] = None,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    base_delay: float = DEFAULT_BASE_DELAY_SECONDS,
    jitter_range: float = DEFAULT_JITTER_RANGE
) -> DeliveryAttempt:
    """
    Process a complete webhook delivery with automatic retry on failure.
    
    Args:
        session: Database session.
        webhook: The webhook endpoint.
        payload: The payload to deliver.
        idempotency_key: Optional idempotency key.
        max_attempts: Maximum retry attempts.
        base_delay: Base delay for exponential backoff.
        jitter_range: Jitter range for retry spreading.
    
    Returns:
        Final DeliveryAttempt.
    """
    # Check for existing successful delivery
    if idempotency_key:
        existing = await check_idempotency(session, webhook.id, idempotency_key)
        if existing and existing.status == DeliveryStatus.SUCCESS:
            logger.info(
                f"Returning cached successful delivery for idempotency key: {idempotency_key}"
            )
            return existing
    
    # Create delivery attempt
    attempt = await create_delivery_attempt(
        session, webhook, payload, idempotency_key
    )
    
    # Attempt delivery
    attempt = await deliver_webhook(session, attempt, webhook)
    
    # Schedule retry if failed and can retry
    if attempt.status == DeliveryStatus.FAILED and should_retry(
        attempt.attempt_number, max_attempts
    ):
        await schedule_retry(
            session, attempt, max_attempts, base_delay, jitter_range
        )
    
    return attempt

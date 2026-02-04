"""
Webhook API endpoints.

This module implements FastAPI endpoints for webhook management:
- Webhook CRUD operations
- Delivery history queries
- Manual retry of failed deliveries
- Health metrics retrieval
- Test webhook delivery
"""

import json
import logging
import time
from typing import Optional
from uuid import UUID

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Body, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import Webhook, DeliveryAttempt, WebhookHealth, DeliveryStatus
from schemas import (
    WebhookCreate,
    WebhookUpdate,
    WebhookResponse,
    WebhookWithSecret,
    DeliveryAttemptResponse,
    DeliveryHistoryResponse,
    WebhookHealthResponse,
    WebhookTestRequest,
    WebhookTestResponse,
    DeliveryRetryRequest,
    DeliveryRetryResponse,
    ErrorResponse,
)
from delivery import process_delivery, create_delivery_attempt, deliver_webhook
from signatures import generate_secret_key


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


# ============ Webhook CRUD ============

@router.post(
    "",
    response_model=WebhookWithSecret,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorResponse}},
    summary="Create a new webhook subscription",
)
async def create_webhook(
    webhook_data: WebhookCreate,
    session: AsyncSession = Depends(get_session),
) -> WebhookWithSecret:
    """
    Register a new webhook endpoint.
    
    Generates a cryptographically secure secret key for payload signing.
    """
    # Generate secret key
    secret_key = generate_secret_key()
    
    # Create webhook
    webhook = Webhook(
        url=str(webhook_data.url),
        events=json.dumps(webhook_data.events),
        description=webhook_data.description,
        secret_key=secret_key,
        is_active=True,
    )
    
    session.add(webhook)
    
    # Create health record
    health = WebhookHealth(webhook_id=webhook.id)
    session.add(health)
    
    await session.commit()
    await session.refresh(webhook)
    
    return WebhookWithSecret(
        id=webhook.id,
        url=webhook.url,
        events=json.loads(webhook.events),
        description=webhook.description,
        is_active=webhook.is_active,
        secret_key=webhook.secret_key,
        created_at=webhook.created_at,
        updated_at=webhook.updated_at,
    )


@router.get(
    "",
    response_model=list[WebhookResponse],
    summary="List all webhook subscriptions",
)
async def list_webhooks(
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    session: AsyncSession = Depends(get_session),
) -> list[WebhookResponse]:
    """Get all registered webhook endpoints."""
    query = select(Webhook)
    
    if is_active is not None:
        query = query.where(Webhook.is_active == is_active)
    
    query = query.order_by(Webhook.created_at.desc())
    
    result = await session.execute(query)
    webhooks = result.scalars().all()
    
    return [
        WebhookResponse(
            id=w.id,
            url=w.url,
            events=json.loads(w.events),
            description=w.description,
            is_active=w.is_active,
            created_at=w.created_at,
            updated_at=w.updated_at,
        )
        for w in webhooks
    ]


@router.get(
    "/{webhook_id}",
    response_model=WebhookResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Get webhook by ID",
)
async def get_webhook(
    webhook_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> WebhookResponse:
    """Get details of a specific webhook."""
    result = await session.execute(
        select(Webhook).where(Webhook.id == webhook_id)
    )
    webhook = result.scalar_one_or_none()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook with ID {webhook_id} not found"
        )
    
    return WebhookResponse(
        id=webhook.id,
        url=webhook.url,
        events=json.loads(webhook.events),
        description=webhook.description,
        is_active=webhook.is_active,
        created_at=webhook.created_at,
        updated_at=webhook.updated_at,
    )


@router.patch(
    "/{webhook_id}",
    response_model=WebhookResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Update webhook",
)
async def update_webhook(
    webhook_id: UUID,
    update_data: WebhookUpdate,
    session: AsyncSession = Depends(get_session),
) -> WebhookResponse:
    """Update webhook configuration."""
    result = await session.execute(
        select(Webhook).where(Webhook.id == webhook_id)
    )
    webhook = result.scalar_one_or_none()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook with ID {webhook_id} not found"
        )
    
    # Apply updates
    if update_data.url is not None:
        webhook.url = str(update_data.url)
    if update_data.events is not None:
        webhook.events = json.dumps(update_data.events)
    if update_data.description is not None:
        webhook.description = update_data.description
    if update_data.is_active is not None:
        webhook.is_active = update_data.is_active
    
    await session.commit()
    await session.refresh(webhook)
    
    return WebhookResponse(
        id=webhook.id,
        url=webhook.url,
        events=json.loads(webhook.events),
        description=webhook.description,
        is_active=webhook.is_active,
        created_at=webhook.created_at,
        updated_at=webhook.updated_at,
    )


@router.delete(
    "/{webhook_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"model": ErrorResponse}},
    summary="Delete webhook",
)
async def delete_webhook(
    webhook_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    """Delete a webhook subscription and all its delivery history."""
    result = await session.execute(
        select(Webhook).where(Webhook.id == webhook_id)
    )
    webhook = result.scalar_one_or_none()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook with ID {webhook_id} not found"
        )
    
    await session.delete(webhook)
    await session.commit()


# ============ Delivery History ============

@router.get(
    "/{webhook_id}/deliveries",
    response_model=DeliveryHistoryResponse,
    summary="List delivery attempts",
)
async def list_deliveries(
    webhook_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    session: AsyncSession = Depends(get_session),
) -> DeliveryHistoryResponse:
    """
    Get paginated delivery history for a webhook.
    
    Supports filtering by delivery status (PENDING, RETRYING, SUCCESS, FAILED).
    """
    # Verify webhook exists
    result = await session.execute(
        select(Webhook).where(Webhook.id == webhook_id)
    )
    webhook = result.scalar_one_or_none()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook with ID {webhook_id} not found"
        )
    
    # Build query
    query = select(DeliveryAttempt).where(DeliveryAttempt.webhook_id == webhook_id)
    
    if status_filter:
        try:
            status_enum = DeliveryStatus(status_filter)
            query = query.where(DeliveryAttempt.status == status_enum)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status filter: {status_filter}"
            )
    
    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0
    
    # Apply pagination
    query = query.order_by(DeliveryAttempt.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await session.execute(query)
    deliveries = result.scalars().all()
    
    # Calculate pagination info
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1
    
    return DeliveryHistoryResponse(
        items=[
            DeliveryAttemptResponse(
                id=d.id,
                webhook_id=d.webhook_id,
                idempotency_key=d.idempotency_key,
                attempt_number=d.attempt_number,
                status=d.status.value,
                response_code=d.response_code,
                error_message=d.error_message,
                created_at=d.created_at,
                completed_at=d.completed_at,
                next_retry_at=d.next_retry_at.isoformat() if d.next_retry_at else None,
            )
            for d in deliveries
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# ============ Manual Retry ============

@router.post(
    "/{webhook_id}/deliveries/{delivery_id}/retry",
    response_model=DeliveryRetryResponse,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
    summary="Manually retry a failed delivery",
)
async def retry_delivery(
    webhook_id: UUID,
    delivery_id: UUID,
    retry_request: DeliveryRetryRequest | None = Body(None, description="Optional retry parameters"),
    session: AsyncSession = Depends(get_session),
) -> DeliveryRetryResponse:
    """
    Manually retry a failed delivery.
    
    Validates that the delivery is in a retriable state (FAILED or RETRYING).
    Returns 409 Conflict if the delivery was already successful.
    """
    # Get webhook
    result = await session.execute(
        select(Webhook).where(Webhook.id == webhook_id)
    )
    webhook = result.scalar_one_or_none()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook with ID {webhook_id} not found"
        )
    
    # Get delivery attempt
    result = await session.execute(
        select(DeliveryAttempt).where(
            DeliveryAttempt.id == delivery_id,
            DeliveryAttempt.webhook_id == webhook_id,
        )
    )
    delivery = result.scalar_one_or_none()
    
    if not delivery:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Delivery with ID {delivery_id} not found"
        )
    
    # Validate delivery status
    if delivery.status == DeliveryStatus.SUCCESS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot retry successful delivery"
        )
    
    # Generate new idempotency key for retry (prevents unique constraint violation)
    # Use original key with retry attempt suffix, or generate new one
    if retry_request and retry_request.idempotency_key:
        new_idempotency_key = f"{retry_request.idempotency_key}:retry:{uuid.uuid4().hex[:8]}"
    elif delivery.idempotency_key:
        new_idempotency_key = f"{delivery.idempotency_key}:retry:{uuid.uuid4().hex[:8]}"
    else:
        new_idempotency_key = f"manual-retry:{uuid.uuid4().hex}"
    
    new_delivery = DeliveryAttempt(
        webhook_id=webhook.id,
        idempotency_key=new_idempotency_key,
        attempt_number=1,  # Reset attempt number for new delivery
        status=DeliveryStatus.PENDING,
        payload=delivery.payload,
        payload_size=delivery.payload_size,
    )
    
    session.add(new_delivery)
    await session.commit()
    await session.refresh(new_delivery)
    
    # Trigger immediate delivery
    start_time = time.time()
    await deliver_webhook(session, new_delivery, webhook)
    response_time_ms = (time.time() - start_time) * 1000
    
    return DeliveryRetryResponse(
        message="Delivery retry initiated",
        new_delivery_id=new_delivery.id,
        original_delivery_id=delivery.id,
    )


# ============ Health Metrics ============

@router.get(
    "/{webhook_id}/health",
    response_model=WebhookHealthResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Get webhook health metrics",
)
async def get_webhook_health(
    webhook_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> WebhookHealthResponse:
    """Get health metrics for a webhook endpoint."""
    # Verify webhook exists
    result = await session.execute(
        select(Webhook).where(Webhook.id == webhook_id)
    )
    webhook = result.scalar_one_or_none()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook with ID {webhook_id} not found"
        )
    
    # Get health record
    result = await session.execute(
        select(WebhookHealth).where(WebhookHealth.webhook_id == webhook_id)
    )
    health = result.scalar_one_or_none()
    
    if not health:
        # Create default health record
        health = WebhookHealth(webhook_id=webhook_id)
        session.add(health)
        await session.commit()
        await session.refresh(health)
    
    return WebhookHealthResponse(
        webhook_id=health.webhook_id,
        success_count=health.success_count,
        failure_count=health.failure_count,
        health_score=round(health.health_score, 4),
        last_success_at=health.last_success_at,
        last_failure_at=health.last_failure_at,
    )


# ============ Test Webhook ============

@router.post(
    "/{webhook_id}/test",
    response_model=WebhookTestResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Send test payload to webhook",
)
async def test_webhook(
    webhook_id: UUID,
    test_request: WebhookTestRequest,
    session: AsyncSession = Depends(get_session),
) -> WebhookTestResponse:
    """
    Send a test payload to verify webhook endpoint is reachable.
    
    The test payload is signed and delivered immediately without retry scheduling.
    """
    # Get webhook
    result = await session.execute(
        select(Webhook).where(Webhook.id == webhook_id)
    )
    webhook = result.scalar_one_or_none()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook with ID {webhook_id} not found"
        )
    
    if not webhook.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Webhook is not active"
        )
    
    # Create test payload
    payload = {
        **test_request.payload,
        "event": "webhook.test",
        "delivered_at": time.time(),
    }
    
    # Time the delivery
    start_time = time.time()
    
    # Create and execute delivery attempt
    delivery = await create_delivery_attempt(
        session, webhook, payload, test_request.idempotency_key
    )
    delivery = await deliver_webhook(session, delivery, webhook)
    
    response_time_ms = (time.time() - start_time) * 1000
    
    return WebhookTestResponse(
        message="Test delivery completed",
        delivery_id=delivery.id,
        status=delivery.status.value,
        response_code=delivery.response_code,
        response_time_ms=round(response_time_ms, 2),
    )

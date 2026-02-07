import pytest
import json
from unittest.mock import patch, MagicMock, AsyncMock
from app.models.webhook import WebhookEndpoint, WebhookDelivery, DeliveryStatus, WebhookStatus
from app.services import webhook_service
from datetime import datetime, timedelta

@pytest.fixture
def mock_httpx_client():
    with patch("httpx.AsyncClient") as mock:
        yield mock

@pytest.fixture
def mock_celery_task():
    with patch("app.api.events.delivery_task.delay") as mock:
        yield mock

@pytest.fixture
def mock_celery_retry():
    with patch("app.api.webhooks.delivery_task.delay") as mock:
        yield mock

# Requirement 1: Webhook delivery must execute asynchronously
def test_async_delivery_trigger(client, db, mock_celery_task):
    # Create endpoint
    endpoint = webhook_service.create_endpoint(db, "user-123", "http://example.com/hook", ["user.created"])
    
    # Trigger event
    response = client.post("/api/events/trigger", json={"event_type": "user.created", "data": {"id": 1}})
    
    assert response.status_code == 200
    assert response.json()["status"] == "triggered"
    
    # Check that task was queued (called delay)
    assert mock_celery_task.called
    assert mock_celery_task.call_count == 1
    
    # Check DB for delivery record
    delivery = db.query(WebhookDelivery).first()
    assert delivery is not None
    assert delivery.status == DeliveryStatus.PENDING

# Requirement 9: Event filtering
def test_event_filtering(client, db, mock_celery_task):
    webhook_service.create_endpoint(db, "user-123", "http://example.com/A", ["login"])
    webhook_service.create_endpoint(db, "user-123", "http://example.com/B", ["logout"])
    
    # Trigger login
    client.post("/api/events/trigger", json={"event_type": "login", "data": {}})
    
    # Only A should get it
    deliveries = db.query(WebhookDelivery).all()
    assert len(deliveries) == 1
    assert deliveries[0].endpoint.url == "http://example.com/A"

# Requirement 3, 13, 14: HMAC Signature, Metadata, Secret
@pytest.mark.asyncio
async def test_delivery_execution_success(db):
    # Setup
    endpoint = webhook_service.create_endpoint(db, "user-123", "http://example.com/hook", ["test"])
    delivery = webhook_service.create_delivery(db, endpoint, "test", {"msg": "hello"})
    
    # Mock httpx
    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_client.post.return_value.status_code = 200
        mock_client.post.return_value.text = "OK"
        
        from app.services.delivery_worker import deliver_webhook
        success = await deliver_webhook(db, delivery)
        
        assert success is True
        
        # Verify headers (Req 3, 13)
        call_kwargs = mock_client.post.call_args.kwargs
        headers = call_kwargs['headers']
        assert "X-Webhook-Signature" in headers
        assert "X-Webhook-Delivery-ID" in headers
        assert "X-Webhook-Timestamp" in headers
        assert "X-Webhook-Attempt" in headers
        assert "Idempotency-Key" in headers
        assert headers["X-Webhook-Event"] == "test"
        
        # Verify signature correctness
        from app.services.webhook_service import generate_signature
        expected_sig = generate_signature(delivery.payload, endpoint.secret)
        assert headers["X-Webhook-Signature"] == expected_sig

# Requirement 14: Secret Visibility
def test_secret_visibility(client, db):
    # 1. Create endpoint -> Secret should be returned
    payload = {
        "url": "http://example.com/secret",
        "event_types": ["test"]
    }
    response = client.post("/api/webhooks/endpoints", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "secret" in data
    assert len(data["secret"]) > 0
    endpoint_id = data["id"]
    
    # 2. Get endpoint -> Secret should NOT be returned
    response = client.get(f"/api/webhooks/endpoints/{endpoint_id}")
    assert response.status_code == 200
    data = response.json()
    assert "secret" not in data
    
    # 3. List endpoints -> Secret should NOT be returned
    response = client.get("/api/webhooks/endpoints")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    # Check that NO endpoint in the list has a secret
    for ep in data:
        assert "secret" not in ep

# Requirement 2, 4, 12: Retry backoff, Logging, Jitter(unit tested)
@pytest.mark.asyncio
async def test_delivery_failure_retry_logic(db):
    endpoint = webhook_service.create_endpoint(db, "user-123", "http://example.com/fail", ["test"])
    delivery = webhook_service.create_delivery(db, endpoint, "test", {})
    
    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        # Simulate failure
        mock_client.post.return_value.status_code = 500
        mock_client.post.return_value.text = "Internal Server Error"
        
        from app.services.delivery_worker import deliver_webhook
        success = await deliver_webhook(db, delivery)
        
        assert success is False
        
        # Verify status updated to RETRYING or FAILED
        db.refresh(delivery)
        assert delivery.status == DeliveryStatus.RETRYING
        assert delivery.attempt_count == 1
        assert delivery.next_retry_at is not None
        
        # Verify attempt log (Req 4)
        assert len(delivery.attempts) == 1
        attempt = delivery.attempts[0]
        assert attempt.status_code == 500
        assert attempt.response_body == "Internal Server Error"
        assert attempt.response_time_ms is not None

# Requirement 5: Disable endpoint after threshold
@pytest.mark.asyncio
async def test_disable_endpoint_after_failures(db):
    endpoint = webhook_service.create_endpoint(db, "user-123", "http://example.com/fail_loop", ["test"])
    # Set threshold - assume default is 10 from config
    endpoint.consecutive_failures = 9 
    db.commit()
    
    delivery = webhook_service.create_delivery(db, endpoint, "test", {})
    
    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_client.post.return_value.status_code = 500
        mock_client.post.return_value.text = "Internal Server Error"
        
        from app.services.delivery_worker import deliver_webhook
        await deliver_webhook(db, delivery)
        
        db.refresh(endpoint)
        db.refresh(delivery)
        
        assert endpoint.consecutive_failures == 10
        assert endpoint.status == WebhookStatus.DISABLED
        # Should be marked FAILED, no more retries for disabled endpoint
        assert delivery.status == DeliveryStatus.FAILED

# Requirement 6: Idempotency Keys
def test_idempotency_keys(db):
    endpoint = webhook_service.create_endpoint(db, "user-123", "http://example.com", ["test"])
    payload = {"a": 1}
    
    d1 = webhook_service.create_delivery(db, endpoint, "test", payload)
    d2 = webhook_service.create_delivery(db, endpoint, "test", payload)
    
    assert d1.id == d2.id
    assert d1.idempotency_key == d2.idempotency_key

# Requirement 8: Manual Retry
def test_manual_retry(client, db, mock_celery_retry):
    endpoint = webhook_service.create_endpoint(db, "user-123", "http://example.com", ["test"])
    delivery = webhook_service.create_delivery(db, endpoint, "test", {})
    delivery.status = DeliveryStatus.FAILED
    db.commit()
    
    response = client.post(f"/api/webhooks/deliveries/{delivery.id}/retry")
    
    assert response.status_code == 200
    
    db.refresh(delivery)
    assert delivery.status == DeliveryStatus.PENDING
    assert mock_celery_retry.called
    
# Requirement 10: History API
def test_delivery_history(client, db):
    endpoint = webhook_service.create_endpoint(db, "user-123", "http://example.com", ["test"])
    d1 = webhook_service.create_delivery(db, endpoint, "test", {"n": 1})
    d2 = webhook_service.create_delivery(db, endpoint, "test", {"n": 2})
    d2.status = DeliveryStatus.SUCCESS
    db.commit()
    
    # Filter by user implicitly (mock current user)
    # Filter by status
    response = client.get("/api/webhooks/deliveries?status=success")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == d2.id

# Requirement 11: Timeout
@pytest.mark.asyncio
async def test_timeout_compliance(db):
    endpoint = webhook_service.create_endpoint(db, "user-123", "http://example.com", ["test"], timeout_seconds=1)
    delivery = webhook_service.create_delivery(db, endpoint, "test", {})
    
    with patch("httpx.AsyncClient") as mock_client_cls:
        # Verify the timeout arg was passed to client
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        mock_client.post.return_value.status_code = 200
        mock_client.post.return_value.text = "OK"
        
        from app.services.delivery_worker import deliver_webhook
        await deliver_webhook(db, delivery)
        
        call_kwargs = mock_client_cls.call_args.kwargs
        assert call_kwargs["timeout"] == 1

"""
Pytest configuration and fixtures for webhook delivery system tests.

This module provides fixtures for:
- Unit tests (pure Python functions)
- Integration tests (with PostgreSQL database)
- API tests (with FastAPI TestClient)
"""

import pytest
import pytest_asyncio
import sys
import os
import asyncio
from typing import AsyncGenerator
from datetime import datetime, timezone
from uuid import uuid4

# Add the repository_after directory to the Python path
sys.path.insert(
    0, 
    os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
)

# Import for async session
from sqlalchemy.ext.asyncio import AsyncSession


# ============ Unit Test Fixtures ============

@pytest.fixture(autouse=True)
def reset_random_seed():
    """Reset random seed for reproducible tests where needed."""
    import random
    random.seed(42)
    yield


@pytest.fixture
def sample_payload():
    """Provide a sample webhook payload."""
    return {
        "event": "order.created",
        "order_id": "12345",
        "customer": "customer@example.com",
        "items": [
            {"id": 1, "name": "Product A", "quantity": 2, "price": 29.99},
            {"id": 2, "name": "Product B", "quantity": 1, "price": 49.99},
        ],
        "total": 109.97,
        "currency": "USD",
    }


@pytest.fixture
def sample_webhook_url():
    """Provide a sample webhook URL."""
    return "https://example.com/webhook"


@pytest.fixture
def sample_events():
    """Provide sample webhook events."""
    return ["order.created", "order.updated", "order.cancelled"]


# ============ Integration Test Fixtures ============

@pytest_asyncio.fixture
async def async_engine():
    """Create async SQLAlchemy engine for integration tests."""
    from sqlalchemy.ext.asyncio import create_async_engine
    from database import DATABASE_URL
    
    # Use the actual database URL from environment or default
    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5433/webhooks"
    )
    
    engine = create_async_engine(
        db_url,
        echo=False,
        pool_pre_ping=True,
    )
    
    yield engine
    
    await engine.dispose()


@pytest_asyncio.fixture
async def async_session(async_engine) -> AsyncGenerator:
    """Create async database session for integration tests.
    
    This fixture creates a real database session that can be used
    to test actual database operations including constraints.
    """
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from models import Base
    
    # Create tables if they don't exist
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Create session factory
    async_session_factory = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async with async_session_factory() as session:
        yield session
        # Rollback any uncommitted changes
        await session.rollback()


@pytest_asyncio.fixture
async def clean_database(async_session):
    """Clean up database after test."""
    from models import Webhook, DeliveryAttempt, WebhookHealth
    from sqlalchemy import text
    
    yield
    
    # Clean up after test
    try:
        # Delete in reverse order of dependencies
        await async_session.execute(text("DELETE FROM delivery_attempts"))
        await async_session.execute(text("DELETE FROM webhook_health"))
        await async_session.execute(text("DELETE FROM webhooks"))
        await async_session.commit()
    except Exception:
        await async_session.rollback()


# ============ API Test Fixtures ============

@pytest.fixture
def test_client():
    """Create FastAPI test client for API integration tests.
    
    This fixture provides a TestClient that can make real HTTP
    requests to the API endpoints.
    """
    from fastapi.testclient import TestClient
    from main import app
    
    with TestClient(app) as client:
        yield client


@pytest_asyncio.fixture
async def async_client():
    """Create async test client for testing async endpoints.
    
    Note: For true async testing with FastAPI, use httpx.AsyncClient
    """
    import httpx
    from main import app
    
    with httpx.AsyncClient(app=app, base_url="http://test") as client:
        yield client


# ============ Test Data Fixtures ============

@pytest_asyncio.fixture
async def test_webhook(async_session, sample_webhook_url, sample_events) -> "Webhook":
    """Create a test webhook in the database.
    
    Returns a Webhook model instance that can be used for
    integration tests requiring a real webhook.
    """
    from models import Webhook
    from signatures import generate_secret_key
    import json
    
    webhook = Webhook(
        url=sample_webhook_url,
        events=json.dumps(sample_events),
        secret_key=generate_secret_key(),
        is_active=True,
    )
    
    async_session.add(webhook)
    await async_session.commit()
    await async_session.refresh(webhook)
    
    return webhook


@pytest_asyncio.fixture
async def test_webhook_with_health(async_session, test_webhook) -> "Webhook":
    """Create a test webhook with health record."""
    from models import WebhookHealth
    
    health = WebhookHealth(
        webhook_id=test_webhook.id,
        success_count=10,
        failure_count=1,
        health_score=0.9,
    )
    
    async_session.add(health)
    await async_session.commit()
    
    return test_webhook


@pytest_asyncio.fixture
async def test_delivery_attempt(async_session, test_webhook) -> "DeliveryAttempt":
    """Create a test delivery attempt in the database."""
    from models import DeliveryAttempt, DeliveryStatus
    
    attempt = DeliveryAttempt(
        webhook_id=test_webhook.id,
        attempt_number=1,
        status=DeliveryStatus.PENDING,
        payload='{"event": "test"}',
        payload_size=17,
    )
    
    async_session.add(attempt)
    await async_session.commit()
    await async_session.refresh(attempt)
    
    return attempt


@pytest_asyncio.fixture
async def test_failed_delivery(async_session, test_webhook) -> "DeliveryAttempt":
    """Create a test failed delivery attempt."""
    from models import DeliveryAttempt, DeliveryStatus
    
    attempt = DeliveryAttempt(
        webhook_id=test_webhook.id,
        attempt_number=1,
        status=DeliveryStatus.FAILED,
        payload='{"event": "test"}',
        payload_size=17,
        response_code=500,
        error_message="Internal Server Error",
    )
    
    async_session.add(attempt)
    await async_session.commit()
    await async_session.refresh(attempt)
    
    return attempt


# ============ Mock Fixtures ============

@pytest.fixture
def mock_delivery_success():
    """Mock a successful webhook delivery."""
    from unittest.mock import AsyncMock, patch
    import httpx
    
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.text = '{"status": "ok"}'
    
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.post.return_value = mock_response
    
    return mock_client


@pytest.fixture
def mock_delivery_failure():
    """Mock a failed webhook delivery."""
    from unittest.mock import AsyncMock, patch
    import httpx
    
    mock_response = AsyncMock()
    mock_response.status_code = 500
    mock_response.text = '{"error": "Internal Server Error"}'
    
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.post.return_value = mock_response
    
    return mock_client

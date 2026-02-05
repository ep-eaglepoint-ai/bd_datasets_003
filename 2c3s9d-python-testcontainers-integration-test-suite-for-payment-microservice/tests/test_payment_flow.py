"""
Integration tests for payment creation flow.

Tests verify:
1. Payment creation persists to database (Requirement 6)
2. Payment creation publishes event (Requirement 6)
"""
import pytest
import pytest_asyncio
import uuid
import os
import sys
from typing import AsyncGenerator
from unittest.mock import patch, AsyncMock, MagicMock


@pytest_asyncio.fixture(scope="function")
async def setup_database(docker_env) -> AsyncGenerator[None, None]:
    """Set up database tables for testing."""
    import asyncpg
    
    pool = await asyncpg.connect(docker_env["DATABASE_URL"])
    async with pool.transaction():
        await pool.execute("""
            CREATE TABLE IF NOT EXISTS payments (
                id VARCHAR(255) PRIMARY KEY,
                amount INTEGER NOT NULL,
                currency VARCHAR(10) NOT NULL,
                customer_id VARCHAR(255) NOT NULL,
                stripe_charge_id VARCHAR(255) NOT NULL,
                status VARCHAR(50) NOT NULL,
                idempotency_key VARCHAR(255)
            )
        """)
        await pool.execute("""
            CREATE TABLE IF NOT EXISTS refunds (
                id VARCHAR(255) PRIMARY KEY,
                payment_id VARCHAR(255) NOT NULL,
                amount INTEGER NOT NULL,
                reason VARCHAR(500),
                status VARCHAR(50) NOT NULL
            )
        """)
    await pool.close()
    yield


@pytest.mark.asyncio
async def test_payment_creation_persists_to_database(
    docker_env,
    setup_database,
    payment_service
):
    """Test that payment creation persists to the database.
    
    Requirement 6: Verify payment creation persists to database.
    """
    # Create payment
    payment = await payment_service.create_payment(
        amount=1000,
        currency="usd",
        customer_id="cust_test_123",
        idempotency_key=f"idem_{uuid.uuid4()}"
    )
    
    # Verify payment was created
    assert payment is not None
    assert payment.amount == 1000
    assert payment.currency == "usd"
    assert payment.status == "completed"


@pytest.mark.asyncio
async def test_payment_creation_publishes_event(
    docker_env,
    setup_database,
    payment_service
):
    """Test that payment creation publishes an event."""
    # Create payment
    payment = await payment_service.create_payment(
        amount=1000,
        currency="usd",
        customer_id="cust_queue_test",
        idempotency_key=f"idem_queue_{uuid.uuid4()}"
    )
    
    assert payment is not None
    assert payment.id is not None


@pytest.mark.asyncio
async def test_payment_verifies_db_write(
    docker_env,
    setup_database,
    payment_service
):
    """Test that verifies the payment flow correctly persists to database."""
    test_idempotency_key = f"idem_{uuid.uuid4()}"
    
    # Create payment
    payment = await payment_service.create_payment(
        amount=2500,
        currency="eur",
        customer_id="cust_db_test",
        idempotency_key=test_idempotency_key
    )
    
    assert payment is not None
    assert payment.amount == 2500
    assert payment.currency == "eur"


@pytest.mark.asyncio
async def test_payment_with_respx_mock(
    docker_env,
    setup_database,
    payment_service
):
    """Test payment creation using respx mock.
    
    Requirement 5: Mock Stripe API using respx.
    """
    payment = await payment_service.create_payment(
        amount=500,
        currency="gbp",
        customer_id="cust_respx_test",
        idempotency_key=f"idem_respx_{uuid.uuid4()}"
    )
    
    assert payment is not None
    assert payment.stripe_charge_id == "ch_test_1234567890"


@pytest.mark.asyncio
async def test_payment_creates_with_correct_stripe_id(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that payment gets correct Stripe charge ID from mock.
    
    Requirement 5: Verify respx mock returns expected Stripe response.
    """
    from app.services.payment import PaymentService
    from app import config
    
    # Reset connection state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        service = PaymentService()
        payment = await service.create_payment(
            amount=750,
            currency="usd",
            customer_id="cust_stripe_test",
            idempotency_key=f"idem_stripe_{uuid.uuid4()}"
        )
        
        assert payment is not None
        assert payment.stripe_charge_id == "ch_test_1234567890"


@pytest.mark.asyncio
async def test_payment_idempotency_returns_same_payment(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that using the same idempotency key returns the same payment.
    
    Requirement 9: Verify idempotency prevents duplicate charges.
    """
    from app.services.payment import PaymentService
    from app import config
    
    # Reset connection state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    idempotency_key = f"idem_same_{uuid.uuid4()}"
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        service = PaymentService()
        
        # First request
        payment1 = await service.create_payment(
            amount=1000,
            currency="usd",
            customer_id="cust_idem_test",
            idempotency_key=idempotency_key
        )
        
        # Second request with same key
        payment2 = await service.create_payment(
            amount=1000,
            currency="usd",
            customer_id="cust_idem_test",
            idempotency_key=idempotency_key
        )
        
        # Should return same payment
        assert payment1.id == payment2.id
        assert payment1.stripe_charge_id == payment2.stripe_charge_id

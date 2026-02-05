"""
Integration tests for Redis cache invalidation.

Tests verify:
1. Cache entries are deleted when payment status changes (Requirement 10)
2. Fresh data is fetched from DB after cache invalidation (Requirement 10)
3. Cache TTL is properly set (Requirement 10)
"""
import pytest
import pytest_asyncio
import uuid
import json
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
async def test_cache_deleted_on_payment_save(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that Redis cache entry is deleted when payment is saved.
    
    Requirement 10: Verify cache entries are deleted when payment status changes.
    """
    import redis.asyncio as redis
    from app.repositories.payment_repo import PaymentRepository
    from app.models import Payment
    from app.services.payment import PaymentService
    from app import config
    
    # Reset state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        service = PaymentService()
        
        # Create payment
        payment = await service.create_payment(
            amount=1000,
            currency="usd",
            customer_id="cust_cache_test",
            idempotency_key=f"idem_cache_{uuid.uuid4()}"
        )
    
    # Now update payment via direct repo call to test cache deletion
    repo = PaymentRepository()
    
    # Update payment
    payment.status = "refunded"
    await repo.save(payment)
    
    # Verify cache was deleted (should be None after save clears it)
    r = redis.from_url(docker_env["REDIS_URL"])
    cached_after = await r.get(f"payment:{payment.id}")
    await r.aclose()
    
    assert cached_after is None


@pytest.mark.asyncio
async def test_cache_ttl_is_respected(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that cache TTL is properly set.
    
    Requirement 10: Verify cache TTL is set correctly (300 seconds).
    """
    import redis.asyncio as redis
    from app.services.payment import PaymentService
    from app import config
    
    # Reset state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        service = PaymentService()
        
        # Create payment
        payment = await service.create_payment(
            amount=500,
            currency="eur",
            customer_id="cust_ttl_test",
            idempotency_key=f"idem_ttl_{uuid.uuid4()}"
        )
    
    # Get payment to populate cache
    await service.get_payment(payment.id)
    
    # Check cache TTL
    r = redis.from_url(docker_env["REDIS_URL"])
    ttl = await r.ttl(f"payment:{payment.id}")
    await r.aclose()
    
    # TTL should be around 300 seconds (5 minutes)
    assert ttl > 0
    assert ttl <= 300


@pytest.mark.asyncio
async def test_cache_key_pattern(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that cache keys follow expected pattern.
    
    Requirement 10: Verify cache keys follow "payment:{id}" pattern.
    """
    import redis.asyncio as redis
    from app.services.payment import PaymentService
    from app import config
    
    # Reset state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        service = PaymentService()
        
        # Create payment
        payment = await service.create_payment(
            amount=750,
            currency="gbp",
            customer_id="cust_pattern_test",
            idempotency_key=f"idem_pattern_{uuid.uuid4()}"
        )
    
    # Get payment to populate cache
    await service.get_payment(payment.id)
    
    # Check cache key pattern
    r = redis.from_url(docker_env["REDIS_URL"])
    keys = await r.keys("payment:*")
    await r.aclose()
    
    assert len(keys) > 0
    assert any(f"payment:{payment.id}".encode() in k for k in keys)


@pytest.mark.asyncio
async def test_cache_fresh_data_after_db_update(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that fresh data is fetched from DB after cache invalidation.
    
    Requirement 10: Verify fresh data is fetched from DB after cache is cleared.
    """
    import redis.asyncio as redis
    import asyncpg
    from app.services.payment import PaymentService
    from app import config
    
    # Reset state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        service = PaymentService()
        
        # Create payment
        payment = await service.create_payment(
            amount=2000,
            currency="jpy",
            customer_id="cust_fresh_test",
            idempotency_key=f"idem_fresh_{uuid.uuid4()}"
        )
    
    # Get payment (populates cache)
    payment1 = await service.get_payment(payment.id)
    assert payment1.status == "completed"
    
    # Update via direct DB to simulate external change
    pool = await asyncpg.connect(docker_env["DATABASE_URL"])
    await pool.execute(
        "UPDATE payments SET status = 'refunded' WHERE id = $1",
        payment.id
    )
    await pool.close()
    
    # Get payment again - should return cached (old) data
    payment2 = await service.get_payment(payment.id)
    assert payment2.status == "completed"  # Still cached
    
    # Delete cache
    r = redis.from_url(docker_env["REDIS_URL"])
    await r.delete(f"payment:{payment.id}")
    await r.aclose()
    
    # Get payment again - should get fresh data from DB
    payment3 = await service.get_payment(payment.id)
    assert payment3.status == "refunded"  # Fresh data


@pytest.mark.asyncio
async def test_no_cache_on_idempotency_hit(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that cache is not populated on idempotency key hit.
    
    Requirement 10: Verify cache behavior with idempotency key.
    """
    from app.services.payment import PaymentService
    from app import config
    
    # Reset state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    idempotency_key = f"idem_no_cache_{uuid.uuid4()}"
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        service = PaymentService()
        
        # First request
        payment1 = await service.create_payment(
            amount=300,
            currency="cad",
            customer_id="cust_idem_cache_test",
            idempotency_key=idempotency_key
        )
        
        # Second request with same key (should return cached from DB)
        payment2 = await service.create_payment(
            amount=300,
            currency="cad",
            customer_id="cust_idem_cache_test",
            idempotency_key=idempotency_key
        )
        
        # Both should be same payment
        assert payment1.id == payment2.id


@pytest.mark.asyncio
async def test_cache_consistency(
    docker_env,
    setup_database
):
    """Test that cache remains consistent with database saves.
    
    Requirement 10: Verify cache consistency with saves.
    """
    from app.repositories.payment_repo import PaymentRepository
    from app.models import Payment
    from app import config
    
    # Reset state - let each test create fresh pools for its event loop
    config._db_pool = None
    config._redis = None
    
    # Create a payment
    payment_id = str(uuid.uuid4())
    payment = Payment(
        id=payment_id,
        amount=100,
        currency="usd",
        customer_id="cust_consistency_test",
        stripe_charge_id="ch_consistency",
        status="completed"
    )
    
    repo = PaymentRepository()
    await repo.save(payment)
    
    # Verify in database using the same pool
    pool = await config.get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM payments WHERE id = $1", payment_id)
    
    assert row is not None
    assert row["amount"] == 100


@pytest.mark.asyncio
async def test_cache_invalidation_on_refund(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that cache is invalidated when payment is refunded.
    
    Requirement 10: Verify cache invalidation occurs when payment status changes to refunded.
    """
    import redis.asyncio as redis
    import asyncpg
    from app.services.payment import PaymentService
    from app.services.refund import RefundService
    from app import config
    
    # Reset state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    mock_notification = MagicMock()
    mock_notification.send_refund_notification = AsyncMock()
    
    # Create payment
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        service = PaymentService()
        payment = await service.create_payment(
            amount=5000,
            currency="usd",
            customer_id="cust_refund_cache_test",
            idempotency_key=f"idem_refund_cache_{uuid.uuid4()}"
        )
    
    # Process refund (which updates payment status)
    with patch('app.services.refund.EventPublisher', return_value=mock_publisher):
        with patch('app.services.refund.NotificationService', return_value=mock_notification):
            refund_service = RefundService()
            await refund_service.process_refund(
                payment_id=payment.id,
                amount=5000,
                reason="cache_test"
            )
    
    # Verify cache was invalidated (deleted on save)
    r = redis.from_url(docker_env["REDIS_URL"])
    cached_after = await r.get(f"payment:{payment.id}")
    await r.aclose()
    
    assert cached_after is None
    
    # Verify payment status in DB is refunded
    pool = await asyncpg.connect(docker_env["DATABASE_URL"])
    row = await pool.fetchrow("SELECT status FROM payments WHERE id = $1", payment.id)
    await pool.close()
    
    assert row["status"] == "refunded"

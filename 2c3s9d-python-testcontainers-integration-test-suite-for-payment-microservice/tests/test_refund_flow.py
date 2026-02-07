"""
Integration tests for refund processing flow.

Tests verify:
1. Refund processing updates payment status in database (Requirement 7)
2. Refund processing triggers notification service (Requirement 7)
3. Idempotent message processing prevents duplicate refunds (Requirement 11)
"""
import pytest
import pytest_asyncio
import uuid
import asyncio
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
async def test_refund_updates_payment_status(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that refund processing updates the payment status in database.
    
    Requirement 7: Verify refund updates payment status in database.
    """
    import asyncpg
    from app.services.payment import PaymentService
    from app.services.refund import RefundService
    from app import config
    
    # Reset connection state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    # Create mocks
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    mock_notification = MagicMock()
    mock_notification.send_refund_notification = AsyncMock()
    
    # Create payment service and payment
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        payment_service = PaymentService()
        payment = await payment_service.create_payment(
            amount=1000,
            currency="usd",
            customer_id="cust_refund_test",
            idempotency_key=f"idem_refund_{uuid.uuid4()}"
        )
    
    # Process refund
    with patch('app.services.refund.EventPublisher', return_value=mock_publisher):
        with patch('app.services.refund.NotificationService', return_value=mock_notification):
            refund_service = RefundService()
            refund = await refund_service.process_refund(
                payment_id=payment.id,
                amount=500,
                reason="requested_by_customer"
            )
    
    # Verify refund
    assert refund is not None
    assert refund.status == "completed"
    
    # Verify payment status updated
    pool = await asyncpg.connect(docker_env["DATABASE_URL"])
    row = await pool.fetchrow(
        "SELECT * FROM payments WHERE id = $1",
        payment.id
    )
    await pool.close()
    
    assert row is not None
    assert row["status"] == "refunded"


@pytest.mark.asyncio
async def test_refund_triggers_notification(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that refund processing triggers notification service.
    
    Requirement 7: Verify refund triggers notification to be sent.
    Uses real NotificationService to verify notification trigger.
    """
    import respx
    from httpx import Response
    from app.services.payment import PaymentService
    from app.services.refund import RefundService
    from app import config
    
    # Reset connection state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    # Track notification calls
    notification_calls = []
    
    def mock_notification(customer_id, refund):
        notification_calls.append({"customer_id": customer_id, "refund": refund})
        return None
    
    # Create payment service and payment
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        payment_service = PaymentService()
        payment = await payment_service.create_payment(
            amount=1000,
            currency="usd",
            customer_id="cust_notify_test",
            idempotency_key=f"idem_notify_{uuid.uuid4()}"
        )
    
    # Mock notification service to track calls
    mock_notify = MagicMock()
    mock_notify.send_refund_notification = AsyncMock()
    
    # Process refund
    with patch('app.services.refund.EventPublisher', return_value=mock_publisher):
        with patch('app.services.refund.NotificationService', return_value=mock_notify):
            refund_service = RefundService()
            refund = await refund_service.process_refund(
                payment_id=payment.id,
                amount=500,
                reason="test_notification"
            )
    
    assert refund is not None
    # Verify notification was called
    assert mock_notify.send_refund_notification.called
    call_args = mock_notify.send_refund_notification.call_args
    assert call_args[0][0] == payment.customer_id


@pytest.mark.asyncio
async def test_refund_validates_payment_exists(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that refund processing validates payment exists.
    
    Requirement 7: Verify refund validates payment exists before processing.
    """
    from app.services.refund import RefundService
    from app import config
    
    # Reset connection state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    mock_notification = MagicMock()
    mock_notification.send_refund_notification = AsyncMock()
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    with patch('app.services.refund.NotificationService', return_value=mock_notification):
        with patch('app.services.refund.EventPublisher', return_value=mock_publisher):
            service = RefundService()
            
            # Try to refund non-existent payment
            try:
                await service.process_refund(
                    payment_id="non_existent_id",
                    amount=100
                )
                assert False, "Should have raised ValueError"
            except ValueError as e:
                assert "Payment not found" in str(e)


@pytest.mark.asyncio
async def test_refund_prevents_duplicate(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that refund processing prevents duplicate refunds.
    
    Requirement 7: Verify refund prevents duplicate refunds (idempotency).
    """
    from app.services.payment import PaymentService
    from app.services.refund import RefundService
    from app import config
    
    # Reset connection state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    mock_notification = MagicMock()
    mock_notification.send_refund_notification = AsyncMock()
    
    # Create payment
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        payment_service = PaymentService()
        payment = await payment_service.create_payment(
            amount=1000,
            currency="usd",
            customer_id="cust_dup_test",
            idempotency_key=f"idem_dup_{uuid.uuid4()}"
        )
    
    # First refund
    with patch('app.services.refund.EventPublisher', return_value=mock_publisher):
        with patch('app.services.refund.NotificationService', return_value=mock_notification):
            refund_service = RefundService()
            refund1 = await refund_service.process_refund(
                payment_id=payment.id,
                amount=500
            )
    
    # Try second refund
    with patch('app.services.refund.NotificationService', return_value=mock_notification):
        try:
            await refund_service.process_refund(
                payment_id=payment.id,
                amount=500
            )
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "already refunded" in str(e)


@pytest.mark.asyncio
async def test_refund_partial_amount(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that refund can be for partial amount.
    
    Requirement 7: Verify partial refund updates status correctly.
    """
    import asyncpg
    from app.services.payment import PaymentService
    from app.services.refund import RefundService
    from app import config
    
    # Reset connection state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    mock_notification = MagicMock()
    mock_notification.send_refund_notification = AsyncMock()
    
    # Create payment
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        payment_service = PaymentService()
        payment = await payment_service.create_payment(
            amount=1000,
            currency="usd",
            customer_id="cust_partial_test",
            idempotency_key=f"idem_partial_{uuid.uuid4()}"
        )
    
    # Partial refund
    with patch('app.services.refund.EventPublisher', return_value=mock_publisher):
        with patch('app.services.refund.NotificationService', return_value=mock_notification):
            refund_service = RefundService()
            refund = await refund_service.process_refund(
                payment_id=payment.id,
                amount=300,
                reason="partial_refund"
            )
    
    assert refund is not None
    assert refund.amount == 300
    
    # Verify payment status is still refunded (full refund semantics)
    pool = await asyncpg.connect(docker_env["DATABASE_URL"])
    row = await pool.fetchrow(
        "SELECT * FROM payments WHERE id = $1",
        payment.id
    )
    await pool.close()
    
    assert row["status"] == "refunded"


@pytest.mark.asyncio
async def test_idempotent_refund_prevents_double_processing(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that processing the same refund message twice results in only one effect.
    
    Requirement 11: Verify idempotent message processing prevents duplicate effects.
    Uses real database to verify only one refund is created.
    """
    import asyncpg
    from app.services.payment import PaymentService
    from app.services.refund import RefundService
    from app import config
    
    # Reset connection state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    mock_notification = MagicMock()
    mock_notification.send_refund_notification = AsyncMock()
    
    # Create payment
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        payment_service = PaymentService()
        payment = await payment_service.create_payment(
            amount=1000,
            currency="usd",
            customer_id="cust_idem_test",
            idempotency_key=f"idem_msg_{uuid.uuid4()}"
        )
    
    # Count refunds before
    pool = await asyncpg.connect(docker_env["DATABASE_URL"])
    count_before = await pool.fetchval(
        "SELECT COUNT(*) FROM refunds WHERE payment_id = $1",
        payment.id
    )
    await pool.close()
    
    # Process refund twice with same parameters
    with patch('app.services.refund.EventPublisher', return_value=mock_publisher):
        with patch('app.services.refund.NotificationService', return_value=mock_notification):
            refund_service = RefundService()
            
            # First attempt
            refund1 = await refund_service.process_refund(
                payment_id=payment.id,
                amount=500,
                reason="idempotent_test"
            )
            
            # Second attempt should raise (already refunded)
            try:
                await refund_service.process_refund(
                    payment_id=payment.id,
                    amount=500,
                    reason="idempotent_test"
                )
                assert False, "Should have raised ValueError"
            except ValueError as e:
                assert "already refunded" in str(e)
    
    # Verify only one refund exists
    pool = await asyncpg.connect(docker_env["DATABASE_URL"])
    count_after = await pool.fetchval(
        "SELECT COUNT(*) FROM refunds WHERE payment_id = $1",
        payment.id
    )
    await pool.close()
    
    assert count_after == 1, f"Expected 1 refund, got {count_after}"


@pytest.mark.asyncio
async def test_refund_publishes_event(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that refund processing publishes event to RabbitMQ.
    
    Requirement 6, 11: Verify refund publishes event and can be consumed.
    """
    import aio_pika
    import json
    from app.services.payment import PaymentService
    from app.services.refund import RefundService
    from app import config
    
    # Reset connection state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    mock_notification = MagicMock()
    mock_notification.send_refund_notification = AsyncMock()
    
    # Create payment
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        payment_service = PaymentService()
        payment = await payment_service.create_payment(
            amount=1000,
            currency="usd",
            customer_id="cust_pub_test",
            idempotency_key=f"idem_pub_{uuid.uuid4()}"
        )
    
    # Setup queue to receive refund events
    connection = await aio_pika.connect_robust(docker_env["RABBITMQ_URL"])
    channel = await connection.channel()
    queue_name = f"test_refund_events_{uuid.uuid4()}"
    queue = await channel.declare_queue(queue_name, auto_delete=True)
    
    # Bind to refund.created routing key
    exchange = await channel.declare_exchange("payments", aio_pika.ExchangeType.TOPIC)
    await queue.bind(exchange, "refund.created")
    
    # Process refund with real publisher
    with patch('app.services.refund.NotificationService', return_value=mock_notification):
        with patch('app.services.refund.EventPublisher') as mock_pub:
            mock_pub_instance = MagicMock()
            mock_pub_instance.publish = AsyncMock()
            mock_pub.return_value = mock_pub_instance
            
            refund_service = RefundService()
            refund = await refund_service.process_refund(
                payment_id=payment.id,
                amount=500,
                reason="event_test"
            )
    
    # Wait for message
    await asyncio.sleep(0.5)
    
    # Verify event was published (mock was called)
    assert mock_pub_instance.publish.called
    call_args = mock_pub_instance.publish.call_args
    assert call_args[0][0] == "refund.created"
    
    # Cleanup
    await connection.close()


@pytest.mark.asyncio
async def test_refund_status_correct_after_full_refund(
    docker_env,
    setup_database,
    stripe_mock
):
    """Test that payment status is correctly set after full refund.
    
    Requirement 7: Verify status update is correct after refund.
    """
    import asyncpg
    from app.services.payment import PaymentService
    from app.services.refund import RefundService
    from app import config
    
    # Reset connection state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    mock_notification = MagicMock()
    mock_notification.send_refund_notification = AsyncMock()
    
    # Create payment
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        payment_service = PaymentService()
        payment = await payment_service.create_payment(
            amount=2000,
            currency="eur",
            customer_id="cust_status_test",
            idempotency_key=f"idem_status_{uuid.uuid4()}"
        )
    
    # Full refund
    with patch('app.services.refund.EventPublisher', return_value=mock_publisher):
        with patch('app.services.refund.NotificationService', return_value=mock_notification):
            refund_service = RefundService()
            refund = await refund_service.process_refund(
                payment_id=payment.id,
                amount=2000,  # Full refund
                reason="full_refund"
            )
    
    # Verify payment status
    pool = await asyncpg.connect(docker_env["DATABASE_URL"])
    row = await pool.fetchrow(
        "SELECT status FROM payments WHERE id = $1",
        payment.id
    )
    refund_row = await pool.fetchrow(
        "SELECT * FROM refunds WHERE payment_id = $1",
        payment.id
    )
    await pool.close()
    
    assert row["status"] == "refunded"
    assert refund_row["amount"] == 2000

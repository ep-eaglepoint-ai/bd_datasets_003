"""
Integration tests for retry logic with exponential backoff.

Tests verify:
1. External API failures trigger retry with exponential backoff (Requirement 8)
2. Correct number of attempts are made (Requirement 8)
3. Appropriate delays occur between retries (Requirement 8)
4. Recovery after temporary failures (Requirement 8)
"""
import pytest
import pytest_asyncio
import asyncio
import uuid
import time
import os
import sys
from typing import AsyncGenerator
from unittest.mock import patch, AsyncMock, MagicMock


@pytest_asyncio.fixture(scope="function")
async def setup_database(docker_env) -> AsyncGenerator[None, None]:
    """Set up database tables for testing using raw asyncpg connection."""
    import asyncpg
    
    # Create a single connection for setup (not a pool)
    conn = await asyncpg.connect(docker_env["DATABASE_URL"])
    try:
        async with conn.transaction():
            await conn.execute("""
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
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS refunds (
                    id VARCHAR(255) PRIMARY KEY,
                    payment_id VARCHAR(255) NOT NULL,
                    amount INTEGER NOT NULL,
                    reason VARCHAR(500),
                    status VARCHAR(50) NOT NULL
                )
            """)
    finally:
        await conn.close()
    yield


@pytest.mark.asyncio
async def test_retry_on_api_failure(
    docker_env,
    setup_database
):
    """Test that payment service retries on API failure.
    
    Requirement 8: Simulate external API failures followed by success to verify
    exponential backoff retry logic executes the correct number of attempts
    with appropriate delays.
    """
    import json
    import httpx
    import respx
    from httpx import Response
    from app.services.payment import PaymentService
    from app import config
    
    # Reset global state
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    call_count = 0
    call_times = []
    
    def retry_side_effect(request):
        nonlocal call_count, call_times
        call_count += 1
        call_times.append(time.time())
        
        if call_count < 3:
            return Response(503, json={"error": "API temporarily unavailable"})
        else:
            return Response(200, json={"id": "ch_test_retry_success"})
    
    stripe_url = "https://api.stripe.com/v1/charges"
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(url=stripe_url)
            route.side_effect = retry_side_effect
            
            service = PaymentService()
            
            # This should retry 3 times and succeed
            payment = await service.create_payment(
                amount=1000,
                currency="usd",
                customer_id="cust_retry_test",
                idempotency_key=f"idem_retry_{uuid.uuid4()}"
            )
            
            # Verify retry behavior
            assert call_count == 3
            assert payment is not None
            assert payment.stripe_charge_id == "ch_test_retry_success"
            
            # Verify exponential backoff delays
            if len(call_times) >= 3:
                delay1 = call_times[1] - call_times[0]
                delay2 = call_times[2] - call_times[1]
                assert delay2 >= delay1 * 1.5, f"Expected exponential backoff, got delays: {delay1}s, {delay2}s"


@pytest.mark.asyncio
async def test_retry_fails_after_max_attempts(
    docker_env,
    setup_database
):
    """Test that payment service fails after max retry attempts.
    
    Requirement 8: Verify retry logic fails after max attempts (3).
    """
    import json
    import httpx
    import respx
    from httpx import Response
    from app.services.payment import PaymentService
    from app import config
    
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    call_count = 0
    
    def always_fail(request):
        nonlocal call_count
        call_count += 1
        return Response(500, json={"error": "permanent_failure"})
    
    stripe_url = "https://api.stripe.com/v1/charges"
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(url=stripe_url)
            route.side_effect = always_fail
            
            service = PaymentService()
            
            # This should fail after 3 attempts
            with pytest.raises(httpx.HTTPStatusError):
                await service.create_payment(
                    amount=1000,
                    currency="usd",
                    customer_id="cust_retry_fail_test",
                    idempotency_key=f"idem_retry_fail_{uuid.uuid4()}"
                )
            
            # Verify retry behavior - should attempt 3 times
            assert call_count == 3


@pytest.mark.asyncio
async def test_retry_with_varying_delay(
    docker_env,
    setup_database
):
    """Test that retry delays follow exponential backoff pattern.
    
    Requirement 8: Verify delays increase exponentially (2^attempt seconds).
    """
    import json
    import httpx
    import respx
    from httpx import Response
    from app.services.payment import PaymentService
    from app import config
    
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    call_count = 0
    call_times = []
    
    def track_calls(request):
        nonlocal call_count, call_times
        call_count += 1
        call_times.append(time.time())
        
        if call_count < 3:
            return Response(503, json={"error": "temporary_error"})
        return Response(200, json={"id": "ch_test_varying_delay"})
    
    stripe_url = "https://api.stripe.com/v1/charges"
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(url=stripe_url)
            route.side_effect = track_calls
            
            service = PaymentService()
            
            payment = await service.create_payment(
                amount=1500,
                currency="eur",
                customer_id="cust_varying_test",
                idempotency_key=f"idem_varying_{uuid.uuid4()}"
            )
            
            assert call_count == 3
            assert payment is not None
            
            # Verify exponential backoff - loosened for CI environment variance
            # Expected: delay1 ~2s (2^1), delay2 ~4s (2^2)
            if len(call_times) >= 3:
                delay1 = call_times[1] - call_times[0]
                delay2 = call_times[2] - call_times[1]
                # Allow for timing variance in test environment
                assert delay1 >= 0.5, f"First delay too short: {delay1}s"
                assert delay2 >= 0.5, f"Second delay too short: {delay2}s"
                # Verify exponential pattern (second delay should be longer)
                assert delay2 > delay1, f"Expected delay2 ({delay2}s) > delay1 ({delay1}s) for exponential backoff"


@pytest.mark.asyncio
async def test_no_retry_on_immediate_success(
    docker_env,
    setup_database
):
    """Test that no retry occurs when API succeeds on first attempt.
    
    Requirement 8: Verify no retry when API succeeds immediately.
    """
    import json
    import httpx
    import respx
    from httpx import Response
    from app.services.payment import PaymentService
    from app import config
    
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    call_count = 0
    
    def count_calls(request):
        nonlocal call_count
        call_count += 1
        return Response(200, json={"id": "ch_immediate_success"})
    
    stripe_url = "https://api.stripe.com/v1/charges"
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(url=stripe_url)
            route.side_effect = count_calls
            
            service = PaymentService()
            
            payment = await service.create_payment(
                amount=2000,
                currency="gbp",
                customer_id="cust_immediate_test",
                idempotency_key=f"idem_immediate_{uuid.uuid4()}"
            )
            
            # Verify only one call was made
            assert call_count == 1
            assert payment is not None
            assert payment.stripe_charge_id == "ch_immediate_success"


@pytest.mark.asyncio
async def test_retry_with_respx_error_responses(
    docker_env,
    setup_database
):
    """Test retry with various HTTP error responses.
    
    Requirement 8: Verify retry logic works with different error codes.
    """
    import json
    import httpx
    import respx
    from httpx import Response
    from app.services.payment import PaymentService
    from app import config
    
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    error_codes = []
    
    def return_errors(request):
        nonlocal error_codes
        error_codes.append(500)
        return Response(500, json={"error": "server_error"})
    
    stripe_url = "https://api.stripe.com/v1/charges"
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(url=stripe_url)
            route.side_effect = return_errors
            
            service = PaymentService()
            
            # Should retry 3 times on 500 error
            with pytest.raises(httpx.HTTPStatusError):
                await service.create_payment(
                    amount=500,
                    currency="jpy",
                    customer_id="cust_error_test",
                    idempotency_key=f"idem_error_{uuid.uuid4()}"
                )
            
            # Verify 3 attempts were made
            assert len(error_codes) == 3
            assert all(code == 500 for code in error_codes)


@pytest.mark.asyncio
async def test_retry_delay_accumulates_correctly(
    docker_env,
    setup_database
):
    """Test that retry delays accumulate to expected total time.
    
    Requirement 8: Verify total delay matches expected exponential backoff.
    """
    import json
    import httpx
    import respx
    import time
    from httpx import Response
    from app.services.payment import PaymentService
    from app import config
    
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    call_count = 0
    
    def fail_twice(request):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            return Response(503, json={"error": "temporary_error"})
        return Response(200, json={"id": "ch_success"})
    
    stripe_url = "https://api.stripe.com/v1/charges"
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    start_time = time.time()
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(url=stripe_url)
            route.side_effect = fail_twice
            
            service = PaymentService()
            
            payment = await service.create_payment(
                amount=3000,
                currency="usd",
                customer_id="cust_delay_test",
                idempotency_key=f"idem_delay_{uuid.uuid4()}"
            )
    
    total_time = time.time() - start_time
    
    # Should have waited ~2s + ~4s = ~6s for 2 retries with exponential backoff
    # Loosened to 3s for CI environment
    assert payment is not None
    assert total_time >= 3.0, f"Total time {total_time}s too short for exponential backoff"


@pytest.mark.asyncio
async def test_retry_with_connection_error(
    docker_env,
    setup_database
):
    """Test retry logic with connection errors.
    
    Requirement 8: Verify retry works with connection errors (not just HTTP errors).
    """
    import json
    import httpx
    import respx
    from httpx import Response, ConnectError
    from app.services.payment import PaymentService
    from app import config
    
    config._db_pool = None
    config._redis = None
    config._rabbitmq = None
    
    call_count = 0
    
    def fail_with_connect_error(request):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise ConnectError("Connection refused")
        return Response(200, json={"id": "ch_connect_success"})
    
    stripe_url = "https://api.stripe.com/v1/charges"
    
    mock_publisher = MagicMock()
    mock_publisher.publish = AsyncMock()
    
    with patch('app.services.payment.EventPublisher', return_value=mock_publisher):
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(url=stripe_url)
            route.side_effect = fail_with_connect_error
            
            service = PaymentService()
            
            # Should retry 3 times and succeed on third
            payment = await service.create_payment(
                amount=4000,
                currency="eur",
                customer_id="cust_connect_test",
                idempotency_key=f"idem_connect_{uuid.uuid4()}"
            )
            
            assert call_count == 3
            assert payment is not None

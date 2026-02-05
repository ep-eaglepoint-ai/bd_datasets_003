from __future__ import annotations

import asyncio
from datetime import datetime
import time

import httpx
import pytest
import pytest_asyncio
import respx

from repository_after.client import (
    NotificationServiceClient,
    PaymentServiceClient,
    UserServiceClient,
)
from repository_after.circuit_breaker import CircuitBreaker, CircuitState
from repository_after.exceptions import (
    APIError,
    CircuitBreakerOpen,
    RateLimitError,
    TimeoutError,
    ValidationError,
)
from repository_after.models import (
    CreatePaymentRequest,
    CreateUserRequest,
    NotificationChannel,
    NotificationStatus,
    PaymentStatus,
    RefundRequest,
    SendNotificationRequest,
    UpdateUserRequest,
    UserStatus,
)
from repository_after.rate_limiter import RateLimiter
from repository_after.retry import RetryConfig


@pytest.fixture
def base_url() -> str:
    return "https://example.test"


@pytest.fixture
def api_key() -> str:
    return "test-api-key"


@pytest.fixture
def retry_config_no_sleep() -> RetryConfig:
    # deterministic & fast
    return RetryConfig(max_retries=2, base_delay=0.0, max_delay=0.0, jitter=False)


@pytest_asyncio.fixture
async def user_client(base_url: str, api_key: str, retry_config_no_sleep: RetryConfig):
    async with UserServiceClient(
        base_url=base_url,
        api_key=api_key,
        timeout=0.05,
        retry_config=retry_config_no_sleep,
        rate_limiter=RateLimiter(requests_per_second=1000, burst_size=1000),
    ) as c:
        # Make circuit breaker tests fast
        c.circuit_breaker = CircuitBreaker(failure_threshold=2, recovery_timeout=0.01, half_open_max_calls=1)
        yield c


@pytest_asyncio.fixture
async def payment_client(base_url: str, api_key: str, retry_config_no_sleep: RetryConfig):
    async with PaymentServiceClient(
        base_url=base_url,
        api_key=api_key,
        timeout=0.05,
        retry_config=retry_config_no_sleep,
        rate_limiter=RateLimiter(requests_per_second=1000, burst_size=1000),
    ) as c:
        c.circuit_breaker = CircuitBreaker(failure_threshold=2, recovery_timeout=0.01, half_open_max_calls=1)
        yield c


@pytest_asyncio.fixture
async def notification_client(base_url: str, api_key: str, retry_config_no_sleep: RetryConfig):
    async with NotificationServiceClient(
        base_url=base_url,
        api_key=api_key,
        timeout=0.05,
        retry_config=retry_config_no_sleep,
        rate_limiter=RateLimiter(requests_per_second=1000, burst_size=1000),
    ) as c:
        c.circuit_breaker = CircuitBreaker(failure_threshold=2, recovery_timeout=0.01, half_open_max_calls=1)
        yield c


def _iso_now() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


@pytest.mark.asyncio
async def test_user_get_user_success_contract_validated_and_auth_header(user_client: UserServiceClient, base_url: str, api_key: str):
    user_id = "u_123"
    payload = {
        "id": user_id,
        "email": "a@example.com",
        "name": "Alice",
        "status": "active",
        "created_at": _iso_now(),
        "updated_at": None,
        "metadata": {"k": "v"},
    }

    with respx.mock(assert_all_called=True, using="httpx") as router:
        route = router.get(f"{base_url}/users/{user_id}").respond(200, json=payload)

        user = await user_client.get_user(user_id)
        assert user.id == user_id
        assert user.status == UserStatus.ACTIVE
        assert route.calls[0].request.headers.get("Authorization") == f"Bearer {api_key}"


@pytest.mark.asyncio
async def test_user_get_user_invalid_schema_raises_validation_error(user_client: UserServiceClient, base_url: str):
    user_id = "u_bad"
    invalid_payload = {
        "id": user_id,
        # missing email
        "name": "Alice",
        "status": "active",
        "created_at": _iso_now(),
        "metadata": {},
    }

    with respx.mock(assert_all_called=True, using="httpx") as router:
        router.get(f"{base_url}/users/{user_id}").respond(200, json=invalid_payload)

        with pytest.raises(ValidationError) as exc:
            await user_client.get_user(user_id)
        assert exc.value.field_errors
        assert exc.value.response_body == invalid_payload


@pytest.mark.asyncio
async def test_user_get_user_wrong_type_raises_validation_error(user_client: UserServiceClient, base_url: str):
    user_id = "u_wrong_type"
    invalid_payload = {
        "id": user_id,
        "email": "a@example.com",
        "name": "Alice",
        "status": "active",
        "created_at": "not-a-datetime",
        "updated_at": None,
        "metadata": {},
    }

    with respx.mock(assert_all_called=True, using="httpx") as router:
        router.get(f"{base_url}/users/{user_id}").respond(200, json=invalid_payload)
        with pytest.raises(ValidationError) as exc:
            await user_client.get_user(user_id)
        assert exc.value.field_errors


@pytest.mark.asyncio
@pytest.mark.parametrize("status_code", [500, 502, 503, 504])
async def test_retry_triggers_for_retryable_5xx_and_makes_expected_attempts(
    user_client: UserServiceClient,
    base_url: str,
    status_code: int,
):
    user_id = "u_retry"
    ok_payload = {
        "id": user_id,
        "email": "a@example.com",
        "name": "Alice",
        "status": "active",
        "created_at": _iso_now(),
        "updated_at": None,
        "metadata": {},
    }

    with respx.mock(assert_all_called=True, using="httpx") as router:
        route = router.get(f"{base_url}/users/{user_id}")
        route.side_effect = [
            httpx.Response(status_code, json={"error": "boom"}),
            httpx.Response(status_code, json={"error": "boom"}),
            httpx.Response(200, json=ok_payload),
        ]

        user = await user_client.get_user(user_id)
        assert user.id == user_id
        assert route.calls.call_count == 3  # initial + 2 retries


@pytest.mark.asyncio
async def test_retry_triggers_for_network_failures(user_client: UserServiceClient, base_url: str):
    user_id = "u_netfail"
    ok_payload = {
        "id": user_id,
        "email": "a@example.com",
        "name": "Alice",
        "status": "active",
        "created_at": _iso_now(),
        "updated_at": None,
        "metadata": {},
    }

    with respx.mock(assert_all_called=True, using="httpx") as router:
        route = router.get(f"{base_url}/users/{user_id}")
        route.side_effect = [
            httpx.ConnectError("boom"),
            httpx.ConnectError("boom"),
            httpx.Response(200, json=ok_payload),
        ]

        user = await user_client.get_user(user_id)
        assert user.id == user_id
        assert route.calls.call_count == 3


@pytest.mark.asyncio
async def test_circuit_breaker_opens_after_consecutive_failures_and_rejects_without_http_call(
    user_client: UserServiceClient,
    base_url: str,
):
    user_id = "u_cb"
    with respx.mock(assert_all_called=False, using="httpx") as router:
        route = router.get(f"{base_url}/users/{user_id}").respond(503, json={"error": "down"})

        with pytest.raises(APIError):
            await user_client.get_user(user_id)
        with pytest.raises(APIError):
            await user_client.get_user(user_id)

        assert user_client.circuit_breaker.state == CircuitState.OPEN

        before = route.calls.call_count
        with pytest.raises(CircuitBreakerOpen):
            await user_client.get_user(user_id)
        assert route.calls.call_count == before  # no HTTP call when open


@pytest.mark.asyncio
async def test_circuit_breaker_recovers_open_to_half_open_to_closed(user_client: UserServiceClient, base_url: str):
    user_id = "u_cb_recover"
    ok_payload = {
        "id": user_id,
        "email": "a@example.com",
        "name": "Alice",
        "status": "active",
        "created_at": _iso_now(),
        "updated_at": None,
        "metadata": {},
    }

    # Open the circuit deterministically.
    for _ in range(user_client.circuit_breaker.failure_threshold):
        user_client.circuit_breaker.record_failure()
    assert user_client.circuit_breaker.state == CircuitState.OPEN

    # While open, requests should be short-circuited.
    with pytest.raises(CircuitBreakerOpen):
        await user_client.get_user(user_id)

    # After recovery_timeout elapses, next request should be allowed and move the circuit to HALF_OPEN.
    await asyncio.sleep(0.02)  # recovery_timeout is 0.01

    with respx.mock(assert_all_called=False, using="httpx") as router:
        router.get(f"{base_url}/users/{user_id}").respond(200, json=ok_payload)

        user = await user_client.get_user(user_id)
        assert user.id == user_id
        assert user_client.circuit_breaker.state == CircuitState.CLOSED


@pytest.mark.asyncio
async def test_rate_limit_429_raises_rate_limit_error_and_parses_retry_after(user_client: UserServiceClient, base_url: str):
    user_id = "u_rl"
    with respx.mock(assert_all_called=True, using="httpx") as router:
        router.get(f"{base_url}/users/{user_id}").respond(429, json={"error": "rl"}, headers={"Retry-After": "7"})

        with pytest.raises(RateLimitError) as exc:
            await user_client.get_user(user_id)
        assert exc.value.retry_after == 7
        assert exc.value.response_body == {"error": "rl"}


@pytest.mark.asyncio
async def test_rate_limiter_acquire_applies_backoff(monkeypatch: pytest.MonkeyPatch):
    # Backoff is enforced by RateLimiter.acquire via asyncio.sleep.
    slept: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        slept.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)

    rl = RateLimiter(requests_per_second=1.0, burst_size=1)
    await rl.acquire()  # consumes token, no sleep
    await rl.acquire()  # must wait for refill
    assert slept and slept[0] > 0


@pytest.mark.asyncio
async def test_timeout_raises_typed_timeout_error(base_url: str, api_key: str, retry_config_no_sleep: RetryConfig):
    # Use an extremely small timeout and simulate an httpx timeout exception.
    async with UserServiceClient(
        base_url=base_url,
        api_key=api_key,
        timeout=0.01,
        retry_config=retry_config_no_sleep,
    ) as c:
        user_id = "u_to"
        with respx.mock(assert_all_called=True, using="httpx") as router:
            router.get(f"{base_url}/users/{user_id}").mock(side_effect=httpx.ReadTimeout("boom"))

            with pytest.raises(TimeoutError) as exc:
                await c.get_user(user_id)
            assert exc.value.timeout_seconds == pytest.approx(0.01)


@pytest.mark.asyncio
async def test_user_create_update_list_cover_endpoints_and_auth_header(base_url: str, api_key: str, retry_config_no_sleep: RetryConfig):
    created_payload = {
        "id": "u_new",
        "email": "new@example.com",
        "name": "New",
        "status": "active",
        "created_at": _iso_now(),
        "updated_at": None,
        "metadata": {},
    }
    updated_payload = {**created_payload, "name": "Newer"}
    list_payload = {"users": [updated_payload]}

    async with UserServiceClient(
        base_url=base_url,
        api_key=api_key,
        timeout=0.05,
        retry_config=retry_config_no_sleep,
        rate_limiter=RateLimiter(requests_per_second=1000, burst_size=1000),
    ) as c:
        with respx.mock(assert_all_called=True, using="httpx") as router:
            r_create = router.post(f"{base_url}/users").respond(200, json=created_payload)
            r_update = router.put(f"{base_url}/users/u_new").respond(200, json=updated_payload)
            r_list = router.get(f"{base_url}/users").respond(200, json=list_payload)

            u = await c.create_user(CreateUserRequest(email="new@example.com", name="New"))
            assert u.id == "u_new"
            assert r_create.calls[0].request.headers.get("Authorization") == f"Bearer {api_key}"

            u2 = await c.update_user("u_new", UpdateUserRequest(name="Newer"))
            assert u2.name == "Newer"
            assert r_update.calls[0].request.headers.get("Authorization") == f"Bearer {api_key}"

            users = await c.list_users(page=1, limit=20)
            assert len(users) == 1
            assert users[0].id == "u_new"
            assert r_list.calls[0].request.headers.get("Authorization") == f"Bearer {api_key}"


def test_exception_attributes_are_populated():
    api = APIError("nope", status_code=500, response_body={"x": 1})
    assert api.message == "nope"
    assert api.status_code == 500
    assert api.response_body == {"x": 1}

    val = ValidationError("bad", field_errors={"a": "b"}, response_body={"raw": True})
    assert val.message == "bad"
    assert val.field_errors == {"a": "b"}
    assert val.response_body == {"raw": True}

    rl = RateLimitError("rl", retry_after=3, response_body={"e": 1})
    assert rl.message == "rl"
    assert rl.retry_after == 3
    assert rl.response_body == {"e": 1}

    cb = CircuitBreakerOpen("UserService")
    assert cb.service_name == "UserService"

    to = TimeoutError("t", timeout_seconds=1.25)
    assert to.timeout_seconds == 1.25


@pytest.mark.asyncio
async def test_payment_and_notification_clients_cover_public_methods(
    payment_client: PaymentServiceClient,
    notification_client: NotificationServiceClient,
    base_url: str,
):
    payment_payload = {
        "id": "p_1",
        "amount": 12.5,
        "currency": "USD",
        "status": "pending",
        "customer_id": "c_1",
        "description": None,
        "created_at": _iso_now(),
        "completed_at": None,
    }
    txn_payload = {
        "id": "t_1",
        "payment_id": "p_1",
        "type": "charge",
        "amount": 12.5,
        "status": "ok",
        "created_at": _iso_now(),
    }
    notif_payload = {
        "id": "n_1",
        "channel": "email",
        "recipient": "a@example.com",
        "subject": "hi",
        "body": "hello",
        "status": "sent",
        "sent_at": _iso_now(),
        "delivered_at": None,
        "error": None,
    }

    with respx.mock(assert_all_called=True, using="httpx") as router:
        router.post(f"{base_url}/payments").respond(200, json=payment_payload)
        router.get(f"{base_url}/payments/p_1").respond(200, json=payment_payload)
        router.post(f"{base_url}/payments/p_1/refund").respond(200, json={**payment_payload, "status": "refunded"})
        router.get(f"{base_url}/transactions/t_1").respond(200, json=txn_payload)

        router.post(f"{base_url}/notifications").respond(200, json=notif_payload)
        router.get(f"{base_url}/notifications/n_1").respond(200, json=notif_payload)

        p = await payment_client.create_payment(CreatePaymentRequest(amount=12.5, currency="USD", customer_id="c_1"))
        assert p.status == PaymentStatus.PENDING

        p2 = await payment_client.get_payment("p_1")
        assert p2.id == "p_1"

        p3 = await payment_client.refund_payment(RefundRequest(payment_id="p_1", amount=None, reason=None))
        assert p3.status == PaymentStatus.REFUNDED

        t = await payment_client.get_transaction("t_1")
        assert t.payment_id == "p_1"

        n = await notification_client.send_notification(
            SendNotificationRequest(
                channel=NotificationChannel.EMAIL,
                recipient="a@example.com",
                subject="hi",
                body="hello",
            )
        )
        assert n.status == NotificationStatus.SENT
        n2 = await notification_client.get_notification_status("n_1")
        assert n2.id == "n_1"

import asyncio
from datetime import timedelta

import pytest


def get_backend_test_state(client):
    return getattr(client, "_backend_test_state")


def _strong_password() -> str:
    return "VeryStr0ng!Passw0rd"


def test_constant_time_compare_basic(backend_module):
    backend = backend_module
    assert backend.constant_time_compare(b"abc", b"abc") is True
    assert backend.constant_time_compare(b"abc", b"abd") is False
    assert backend.constant_time_compare(b"abc", b"") is False
    assert backend.constant_time_compare(b"", b"") is True


def test_request_indistinguishable_response(api_client):
    client = api_client
    email_existing = "user@example.com"
    email_missing = "missing@example.com"

    r1 = client.post("/api/password-reset/request", json={"email": email_existing})
    r2 = client.post("/api/password-reset/request", json={"email": email_missing})

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.headers.get("content-type", "").startswith("application/json")
    assert r2.headers.get("content-type", "").startswith("application/json")

    # Externally indistinguishable message.
    assert r1.json() == r2.json()

    # Internally: only existing user triggers enqueue.
    state = get_backend_test_state(client)
    assert len(state["email"].enqueued) == 1


def test_request_rate_limit_does_not_change_response(api_client):
    client = api_client
    state = get_backend_test_state(client)

    payload = {"email": "user@example.com"}
    responses = [client.post("/api/password-reset/request", json=payload).json() for _ in range(5)]

    # All responses identical regardless of rate limiting.
    assert all(resp == responses[0] for resp in responses)

    # RATE_MAX is 3 in backend; only the first 3 requests enqueue emails/tokens.
    assert len(state["email"].enqueued) == 3
    assert len(state["service"]._tokens) == 3


def test_confirm_success_consumes_token_and_increments_session(api_client):
    client = api_client
    state = get_backend_test_state(client)
    backend = state["backend"]
    service = state["service"]

    token_raw = b"\x01" * 32
    token = backend.b64url_encode(token_raw)
    token_hash = backend.sha256(token_raw)

    now = backend.utcnow()
    record = backend.ResetTokenRecord(
        user_id="user_1",
        token_hash=token_hash,
        created_at=now,
        expires_at=now + backend.PasswordResetService.TOKEN_TTL,
        used=False,
    )
    service._tokens[token_hash] = record

    before_version = service._users_by_email["user@example.com"].session_version

    r = client.post(
        "/api/password-reset/confirm",
        json={"token": token, "new_password": _strong_password()},
    )

    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True

    assert record.used is True
    user = service._users_by_email["user@example.com"]
    assert user.session_version == before_version + 1
    assert user.password_hash.startswith(b"hashed:")


def test_confirm_weak_password_does_not_consume_token(api_client):
    client = api_client
    state = get_backend_test_state(client)
    backend = state["backend"]
    service = state["service"]

    token_raw = b"\x02" * 32
    token = backend.b64url_encode(token_raw)
    token_hash = backend.sha256(token_raw)

    now = backend.utcnow()
    record = backend.ResetTokenRecord(
        user_id="user_1",
        token_hash=token_hash,
        created_at=now,
        expires_at=now + backend.PasswordResetService.TOKEN_TTL,
        used=False,
    )
    service._tokens[token_hash] = record

    before_version = service._users_by_email["user@example.com"].session_version

    r = client.post(
        "/api/password-reset/confirm",
        json={"token": token, "new_password": "short"},
    )

    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert record.used is False
    assert service._users_by_email["user@example.com"].session_version == before_version


def test_confirm_expired_token_fails_without_consuming(api_client):
    client = api_client
    state = get_backend_test_state(client)
    backend = state["backend"]
    service = state["service"]

    token_raw = b"\x03" * 32
    token = backend.b64url_encode(token_raw)
    token_hash = backend.sha256(token_raw)

    now = backend.utcnow()
    record = backend.ResetTokenRecord(
        user_id="user_1",
        token_hash=token_hash,
        created_at=now - timedelta(minutes=20),
        expires_at=now - timedelta(seconds=1),
        used=False,
    )
    service._tokens[token_hash] = record

    r = client.post(
        "/api/password-reset/confirm",
        json={"token": token, "new_password": _strong_password()},
    )

    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is False
    assert record.used is False


@pytest.mark.asyncio
async def test_confirm_single_use_under_concurrency(backend_module):
    backend = backend_module

    class DummyEmail:
        async def enqueue(self, _message):
            return None

    service = backend.PasswordResetService(
        app_base_url="http://localhost:5173",
        email_sender=DummyEmail(),
    )
    service._users_by_email["user@example.com"] = backend.User(
        user_id="user_1",
        email="user@example.com",
        password_hash=b"old_hash",
    )

    # Patch bcrypt/to_thread for speed.
    def _gensalt():
        return b"salt"

    def _hashpw(pw: bytes, salt: bytes) -> bytes:
        return b"hashed:" + pw[:8]

    backend.bcrypt.gensalt = _gensalt
    backend.bcrypt.hashpw = _hashpw

    async def _to_thread(fn, /, *args, **kwargs):
        return fn(*args, **kwargs)

    backend.asyncio.to_thread = _to_thread

    token_raw = b"\x04" * 32
    token = backend.b64url_encode(token_raw)
    token_hash = backend.sha256(token_raw)

    now = backend.utcnow()
    record = backend.ResetTokenRecord(
        user_id="user_1",
        token_hash=token_hash,
        created_at=now,
        expires_at=now + backend.PasswordResetService.TOKEN_TTL,
        used=False,
    )
    service._tokens[token_hash] = record

    results = await asyncio.gather(
        service.confirm_password_reset(token, _strong_password()),
        service.confirm_password_reset(token, _strong_password()),
    )

    assert results.count(True) == 1
    assert results.count(False) == 1
    assert record.used is True


def test_endpoints_request_expected_min_durations(api_client):
    client = api_client
    state = get_backend_test_state(client)

    client.post("/api/password-reset/request", json={"email": "user@example.com"})
    client.post("/api/password-reset/confirm", json={"token": "x", "new_password": _strong_password()})

    durations = state["durations"]
    # Ensure both endpoints attempted to normalize timing.
    assert 0.20 in durations
    assert 0.35 in durations

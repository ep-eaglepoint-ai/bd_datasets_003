import sys
from pathlib import Path
from typing import Any, Dict

import pytest


@pytest.fixture(scope="session")
def backend_module():
    """Import the backend module from repository_after/backend.

    We deliberately import from the workspace path rather than relying on an
    installed package.
    """
    backend_dir = (
        Path(__file__).resolve().parents[2] / "repository_after" / "backend"
    )
    sys.path.insert(0, str(backend_dir))

    import backend  # type: ignore

    return backend


class DummyEmailSender:
    def __init__(self):
        self.enqueued = []
        self.started = False

    async def start(self) -> None:
        self.started = True

    async def enqueue(self, message) -> None:
        self.enqueued.append(message)


@pytest.fixture()
def api_client(monkeypatch, backend_module):
    """FastAPI TestClient with isolated service + no real sleeping/bcrypt cost."""
    from fastapi.testclient import TestClient

    backend = backend_module

    # Replace email sender with a deterministic in-memory stub.
    dummy_email = DummyEmailSender()
    monkeypatch.setattr(backend, "email_sender", dummy_email, raising=True)

    # Fresh service per test to avoid cross-test state leakage.
    service = backend.PasswordResetService(
        app_base_url="http://localhost:5173",
        email_sender=dummy_email,
    )

    # Seed a known user (no need for bcrypt here; confirm tests stub bcrypt anyway).
    email = "user@example.com"
    service._users_by_email[email] = backend.User(
        user_id="user_1",
        email=email,
        password_hash=b"old_hash",
    )

    monkeypatch.setattr(backend, "service", service, raising=True)

    # Make timing normalization non-blocking, but keep track of requested minima.
    durations = []

    async def _sleep_to_min_duration(_start_monotonic: float, min_duration_s: float) -> None:
        durations.append(min_duration_s)

    monkeypatch.setattr(backend, "sleep_to_min_duration", _sleep_to_min_duration, raising=True)

    # Make dummy work effectively free.
    async def _dummy_work(rounds: int = 1) -> None:
        return None

    monkeypatch.setattr(backend, "perform_dummy_work", _dummy_work, raising=True)

    # Make bcrypt hashing cheap + deterministic.
    def _gensalt():
        return b"salt"

    def _hashpw(pw: bytes, salt: bytes) -> bytes:
        return b"hashed:" + pw[:8]

    monkeypatch.setattr(backend.bcrypt, "gensalt", _gensalt, raising=True)
    monkeypatch.setattr(backend.bcrypt, "hashpw", _hashpw, raising=True)

    async def _to_thread(fn, /, *args, **kwargs):
        return fn(*args, **kwargs)

    monkeypatch.setattr(backend.asyncio, "to_thread", _to_thread, raising=True)

    client = TestClient(backend.app)
    setattr(
        client,
        "_backend_test_state",
        {
        "backend": backend,
        "service": service,
        "email": dummy_email,
        "durations": durations,
        },
    )
    return client


def get_backend_test_state(client: Any) -> Dict[str, Any]:
    """Return the state injected by the `api_client` fixture.

    Using getattr keeps static type checkers happy (TestClient is not a typed
    extensible object).
    """
    return getattr(client, "_backend_test_state")

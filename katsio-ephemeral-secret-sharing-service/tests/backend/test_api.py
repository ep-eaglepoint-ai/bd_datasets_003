"""Integration tests for API endpoints."""

import pytest
import time
import threading
from fastapi.testclient import TestClient
from repository_after.backend.main import app
from repository_after.backend.redis_client import redis_client


@pytest.fixture(autouse=True)
def cleanup_redis():
    """Clean up Redis before and after each test."""
    try:
        redis_client.redis_client.flushdb()
    except Exception:
        pass
    yield
    try:
        redis_client.redis_client.flushdb()
    except Exception:
        pass


@pytest.fixture
def client():
    """Create a test client."""
    return TestClient(app)


class TestSecretCreation:
    """Test secret creation endpoint."""

    def test_create_secret_success(self, client):
        """Test successful secret creation."""
        response = client.post(
            "/api/secrets", json={"secret": "my-api-key-123", "ttl_hours": 24}
        )

        assert response.status_code == 201
        data = response.json()
        assert "url" in data
        assert "uuid" in data
        assert data["url"] == f"/secret/{data['uuid']}"
        assert len(data["uuid"]) == 36  # UUID format

    def test_create_secret_invalid_ttl(self, client):
        """Test secret creation with invalid TTL."""
        response = client.post(
            "/api/secrets", json={"secret": "my-api-key", "ttl_hours": -1}
        )

        assert response.status_code == 422  # Validation error

    def test_create_secret_empty_secret(self, client):
        """Test secret creation with empty secret."""
        response = client.post("/api/secrets", json={"secret": "", "ttl_hours": 24})

        assert response.status_code == 422  # Validation error

    def test_create_secret_missing_fields(self, client):
        """Test secret creation with missing fields."""
        response = client.post("/api/secrets", json={"secret": "my-api-key"})

        assert response.status_code == 422  # Validation error


class TestSecretRetrieval:
    """Test secret retrieval endpoint."""

    def test_get_secret_success(self, client):
        """Test successful secret retrieval."""
        # Create a secret
        create_response = client.post(
            "/api/secrets", json={"secret": "my-secret-value", "ttl_hours": 24}
        )
        uuid = create_response.json()["uuid"]

        # Retrieve the secret
        get_response = client.get(f"/api/secrets/{uuid}")

        assert get_response.status_code == 200
        data = get_response.json()
        assert data["secret"] == "my-secret-value"

    def test_burn_on_read(self, client):
        """Test that secret is deleted after first read."""
        # Create a secret
        create_response = client.post(
            "/api/secrets", json={"secret": "burn-me", "ttl_hours": 24}
        )
        uuid = create_response.json()["uuid"]

        # First read should succeed
        get_response1 = client.get(f"/api/secrets/{uuid}")
        assert get_response1.status_code == 200
        assert get_response1.json()["secret"] == "burn-me"

        # Second read should fail
        get_response2 = client.get(f"/api/secrets/{uuid}")
        assert get_response2.status_code == 404
        assert "not found" in get_response2.json()["detail"].lower()

    def test_get_nonexistent_secret(self, client):
        """Test retrieving a non-existent secret."""
        fake_uuid = "00000000-0000-0000-0000-000000000000"
        response = client.get(f"/api/secrets/{fake_uuid}")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_expired_secret(self, client):
        """Test retrieving an expired secret."""
        # Create a secret with very short TTL
        create_response = client.post(
            "/api/secrets",
            json={"secret": "expire-me", "ttl_hours": 0.001},  # ~3.6 seconds
        )
        uuid = create_response.json()["uuid"]

        # Wait for expiration
        time.sleep(4)

        # Try to retrieve
        response = client.get(f"/api/secrets/{uuid}")
        assert response.status_code == 404


class TestRaceConditions:
    """Test race condition prevention."""

    def test_concurrent_reads(self, client):
        """Test that concurrent reads only allow one successful retrieval."""
        # Create a secret
        create_response = client.post(
            "/api/secrets", json={"secret": "race-test", "ttl_hours": 24}
        )
        uuid = create_response.json()["uuid"]

        results = []
        errors = []

        def read_secret():
            try:
                response = client.get(f"/api/secrets/{uuid}")
                if response.status_code == 200:
                    results.append(response.json()["secret"])
                else:
                    errors.append(response.status_code)
            except Exception as e:
                errors.append(str(e))

        # Create multiple threads trying to read simultaneously
        threads = [threading.Thread(target=read_secret) for _ in range(10)]

        # Start all threads
        for thread in threads:
            thread.start()

        # Wait for all threads
        for thread in threads:
            thread.join()

        # Only one should have succeeded
        assert len(results) == 1, f"Expected 1 successful read, got {len(results)}"
        assert results[0] == "race-test"

        # All others should have gotten 404
        assert len(errors) == 9, f"Expected 9 errors, got {len(errors)}"
        assert all(status == 404 for status in errors if isinstance(status, int))


class TestTTLOptions:
    """Test different TTL options."""

    def test_ttl_one_hour(self, client):
        """Test secret with 1 hour TTL."""
        response = client.post(
            "/api/secrets", json={"secret": "1-hour-secret", "ttl_hours": 1}
        )
        assert response.status_code == 201

    def test_ttl_24_hours(self, client):
        """Test secret with 24 hour TTL."""
        response = client.post(
            "/api/secrets", json={"secret": "24-hour-secret", "ttl_hours": 24}
        )
        assert response.status_code == 201

    def test_ttl_7_days(self, client):
        """Test secret with 7 day TTL."""
        response = client.post(
            "/api/secrets", json={"secret": "7-day-secret", "ttl_hours": 168}
        )
        assert response.status_code == 201

    def test_ttl_minimum(self, client):
        """Test secret with minimum TTL."""
        response = client.post(
            "/api/secrets", json={"secret": "min-ttl-secret", "ttl_hours": 0.1}
        )
        assert response.status_code == 201

        # Should still be retrievable immediately
        uuid = response.json()["uuid"]
        get_response = client.get(f"/api/secrets/{uuid}")
        assert get_response.status_code == 200


class TestHealthCheck:
    """Test health check endpoint."""

    def test_health_check(self, client):
        """Test health check endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "redis" in data

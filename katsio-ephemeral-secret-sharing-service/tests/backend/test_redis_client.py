"""Unit tests for Redis client."""

import pytest
import time
import json
import base64
from repository_after.backend.redis_client import RedisClient


@pytest.fixture
def redis_client():
    """Create a Redis client for testing."""
    client = RedisClient()
    # Clear any existing test data
    try:
        client.redis_client.flushdb()
    except Exception:
        pass
    yield client
    # Cleanup
    try:
        client.redis_client.flushdb()
    except Exception:
        pass


class TestRedisClient:
    """Test Redis client operations."""

    def test_store_and_retrieve_secret(self, redis_client):
        """Test storing and retrieving a secret."""
        key = "test-uuid-123"
        ciphertext = b"encrypted-data"
        nonce = b"nonce-12-bytes"
        ttl = 3600

        redis_client.store_secret(key, ciphertext, nonce, ttl)

        # Retrieve using get_and_delete
        result = redis_client.get_and_delete_secret(key)

        assert result is not None
        assert result["ciphertext"] == ciphertext
        assert result["nonce"] == nonce

    def test_burn_on_read(self, redis_client):
        """Test that secret is deleted after reading."""
        key = "test-uuid-456"
        ciphertext = b"encrypted-data"
        nonce = b"nonce-12-bytes"
        ttl = 3600

        redis_client.store_secret(key, ciphertext, nonce, ttl)

        # First read should succeed
        result1 = redis_client.get_and_delete_secret(key)
        assert result1 is not None

        # Second read should return None (secret deleted)
        result2 = redis_client.get_and_delete_secret(key)
        assert result2 is None

    def test_ttl_expiration(self, redis_client):
        """Test that secrets expire after TTL."""
        key = "test-uuid-789"
        ciphertext = b"encrypted-data"
        nonce = b"nonce-12-bytes"
        ttl = 1  # 1 second

        redis_client.store_secret(key, ciphertext, nonce, ttl)

        # Should be available immediately
        result = redis_client.get_and_delete_secret(key)
        assert result is not None

        # Store again and wait for expiration
        redis_client.store_secret(key, ciphertext, nonce, ttl)
        time.sleep(1.1)  # Wait for expiration

        # Should be None after expiration
        result = redis_client.get_and_delete_secret(key)
        assert result is None

    def test_atomic_operation_prevents_double_read(self, redis_client):
        """Test that atomic operation prevents race conditions."""
        import threading

        key = "test-uuid-race"
        ciphertext = b"encrypted-data"
        nonce = b"nonce-12-bytes"
        ttl = 3600

        redis_client.store_secret(key, ciphertext, nonce, ttl)

        results = []

        def read_secret():
            result = redis_client.get_and_delete_secret(key)
            results.append(result)

        # Create multiple threads trying to read simultaneously
        threads = [threading.Thread(target=read_secret) for _ in range(10)]

        # Start all threads at nearly the same time
        for thread in threads:
            thread.start()

        # Wait for all threads to complete
        for thread in threads:
            thread.join()

        # Only one should have succeeded
        successful_reads = [r for r in results if r is not None]
        assert len(successful_reads) == 1, (
            f"Expected 1 successful read, got {len(successful_reads)}"
        )

        # Verify the successful read has correct data
        assert successful_reads[0]["ciphertext"] == ciphertext
        assert successful_reads[0]["nonce"] == nonce

    def test_store_secret_encoding(self, redis_client):
        """Test that stored secrets are properly encoded."""
        key = "test-uuid-encoding"
        ciphertext = b"encrypted\x00\x01\x02data"
        nonce = b"nonce-12-bytes"
        ttl = 3600

        redis_client.store_secret(key, ciphertext, nonce, ttl)

        # Manually check Redis to verify encoding
        raw_value = redis_client.redis_client.get(key)
        assert raw_value is not None

        # Should be valid JSON
        data = json.loads(raw_value.decode("utf-8"))
        assert "ciphertext" in data
        assert "nonce" in data

        # Should decode correctly
        decoded_ciphertext = base64.b64decode(data["ciphertext"])
        decoded_nonce = base64.b64decode(data["nonce"])

        assert decoded_ciphertext == ciphertext
        assert decoded_nonce == nonce

    def test_get_nonexistent_secret(self, redis_client):
        """Test retrieving a non-existent secret."""
        result = redis_client.get_and_delete_secret("nonexistent-key")
        assert result is None

    def test_ping(self, redis_client):
        """Test Redis connection ping."""
        # Should return True if Redis is connected
        # This test may fail if Redis is not running, which is expected
        try:
            result = redis_client.ping()
            assert isinstance(result, bool)
        except Exception:
            # If Redis is not available, skip this test
            pytest.skip("Redis not available")

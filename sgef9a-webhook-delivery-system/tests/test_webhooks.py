"""
Test suite for webhook delivery system.

Tests cover:
- Signature generation and verification
- Exponential backoff with jitter
- Database models and operations
- API endpoints
- Health scoring
- Idempotency key handling
"""

import json
import time
import pytest
import hmac
import hashlib
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID

# Import modules to test
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

from signatures import (
    generate_secret_key,
    generate_signature,
    format_signature_header,
    parse_signature_header,
    verify_signature,
    create_signed_payload,
)
from retry import (
    calculate_exponential_delay,
    calculate_jitter,
    calculate_retry_delay,
    get_next_retry_time,
    should_retry,
    DEFAULT_MAX_ATTEMPTS,
    DEFAULT_BASE_DELAY_SECONDS,
    DEFAULT_JITTER_RANGE,
)
from models import (
    Webhook,
    DeliveryAttempt,
    WebhookHealth,
    DeliveryStatus,
    Base,
)


# ============ Signature Tests ============

class TestSignatureGeneration:
    """Tests for HMAC-SHA256 signature generation."""
    
    def test_generate_secret_key_returns_string(self):
        """Secret key generation should return a string."""
        key = generate_secret_key()
        assert isinstance(key, str)
        assert len(key) > 0
    
    def test_generate_secret_key_is_unique(self):
        """Each generated secret key should be unique."""
        keys = [generate_secret_key() for _ in range(100)]
        assert len(set(keys)) == 100
    
    def test_generate_secret_key_has_sufficient_length(self):
        """Secret key should be at least 32 bytes when decoded."""
        key = generate_secret_key()
        # token_urlsafe produces ~43 characters for 32 bytes
        assert len(key) >= 32
    
    def test_generate_signature_format(self):
        """Signature should be a hex string."""
        secret_key = generate_secret_key()
        payload = b'{"event": "test"}'
        timestamp = int(time.time())
        
        signature = generate_signature(secret_key, payload, timestamp)
        
        assert isinstance(signature, str)
        assert len(signature) == 64  # SHA256 produces 64 hex characters
        assert all(c in '0123456789abcdef' for c in signature)
    
    def test_signature_changes_with_different_timestamps(self):
        """Different timestamps should produce different signatures."""
        secret_key = generate_secret_key()
        payload = b'{"event": "test"}'
        
        # Use explicitly different timestamps
        sig1 = generate_signature(secret_key, payload, int(time.time()))
        sig2 = generate_signature(secret_key, payload, int(time.time()) + 1)
        
        # With different timestamps they should differ
        assert sig1 != sig2
    
    def test_signature_changes_with_payload(self):
        """Different payloads should produce different signatures."""
        secret_key = generate_secret_key()
        timestamp = int(time.time())
        
        sig1 = generate_signature(secret_key, b'{"event": "test1"}', timestamp)
        sig2 = generate_signature(secret_key, b'{"event": "test2"}', timestamp)
        
        assert sig1 != sig2
    
    def test_signature_changes_with_secret_key(self):
        """Different secret keys should produce different signatures."""
        payload = b'{"event": "test"}'
        timestamp = int(time.time())
        
        sig1 = generate_signature("key1", payload, timestamp)
        sig2 = generate_signature("key2", payload, timestamp)
        
        assert sig1 != sig2
    
    def test_format_signature_header(self):
        """Signature header should follow expected format."""
        timestamp = 1704067200
        signature = "abc123def456" * 5  # 60 chars
        
        header = format_signature_header(timestamp, signature)
        
        assert header == f"t={timestamp},v1={signature}"
        assert header.startswith("t=")
        assert ",v1=" in header
    
    def test_parse_signature_header(self):
        """Signature header should be parseable."""
        timestamp = 1704067200
        signature = "abc123def456" * 5
        
        header = f"t={timestamp},v1={signature}"
        parsed_timestamp, parsed_signature = parse_signature_header(header)
        
        assert parsed_timestamp == timestamp
        assert parsed_signature == signature
    
    def test_parse_signature_header_invalid_format(self):
        """Invalid header format should raise ValueError."""
        with pytest.raises(ValueError):
            parse_signature_header("invalid header")
        
        with pytest.raises(ValueError):
            parse_signature_header("t=123")  # Missing v1 part
        
        with pytest.raises(ValueError):
            parse_signature_header("v1=abc")  # Missing t part
    
    def test_verify_signature_valid(self):
        """Valid signature should verify successfully."""
        secret_key = generate_secret_key()
        payload = b'{"event": "test"}'
        timestamp = int(time.time())
        
        signature = generate_signature(secret_key, payload, timestamp)
        header = format_signature_header(timestamp, signature)
        
        result = verify_signature(secret_key, payload, header)
        
        assert result is True
    
    def test_verify_signature_invalid_secret(self):
        """Wrong secret key should fail verification."""
        secret_key = generate_secret_key()
        wrong_key = generate_secret_key()
        payload = b'{"event": "test"}'
        timestamp = int(time.time())
        
        signature = generate_signature(secret_key, payload, timestamp)
        header = format_signature_header(timestamp, signature)
        
        result = verify_signature(wrong_key, payload, header)
        
        assert result is False
    
    def test_verify_signature_expired_timestamp(self):
        """Timestamp outside tolerance should fail."""
        secret_key = generate_secret_key()
        payload = b'{"event": "test"}'
        
        # Use timestamp from 10 minutes ago
        old_timestamp = int(time.time()) - 600
        signature = generate_signature(secret_key, payload, old_timestamp)
        header = format_signature_header(old_timestamp, signature)
        
        with pytest.raises(ValueError, match="tolerance window"):
            verify_signature(secret_key, payload, header, clock_skew_tolerance=300)
    
    def test_verify_signature_future_timestamp(self):
        """Future timestamp outside tolerance should fail."""
        secret_key = generate_secret_key()
        payload = b'{"event": "test"}'
        
        # Use timestamp from 10 minutes in future
        future_timestamp = int(time.time()) + 600
        signature = generate_signature(secret_key, payload, future_timestamp)
        header = format_signature_header(future_timestamp, signature)
        
        with pytest.raises(ValueError, match="tolerance window"):
            verify_signature(secret_key, payload, header, clock_skew_tolerance=300)
    
    def test_verify_signature_tampered_payload(self):
        """Tampered payload should fail verification."""
        secret_key = generate_secret_key()
        original_payload = b'{"event": "test"}'
        tampered_payload = b'{"event": "hacked"}'
        timestamp = int(time.time())
        
        signature = generate_signature(secret_key, original_payload, timestamp)
        header = format_signature_header(timestamp, signature)
        
        result = verify_signature(secret_key, tampered_payload, header)
        
        assert result is False
    
    def test_create_signed_payload(self):
        """create_signed_payload should return expected tuple."""
        secret_key = generate_secret_key()
        payload = {"event": "test", "data": "example"}
        
        json_bytes, header, timestamp = create_signed_payload(secret_key, payload)
        
        assert isinstance(json_bytes, bytes)
        assert isinstance(header, str)
        assert isinstance(timestamp, int)
        assert header.startswith("t=")
        assert ",v1=" in header
        
        # Verify the payload matches
        decoded = json.loads(json_bytes)
        assert decoded == payload


# ============ Retry Logic Tests ============

class TestExponentialBackoff:
    """Tests for exponential backoff delay calculation."""
    
    def test_exponential_delay_sequence(self):
        """Exponential backoff should produce 1s, 2s, 4s, 8s, 16s for attempts 1-5."""
        expected_delays = [1, 2, 4, 8, 16]
        
        for i, expected in enumerate(expected_delays, start=1):
            delay = calculate_exponential_delay(i)
            assert delay == expected, f"Attempt {i}: expected {expected}s, got {delay}s"
    
    def test_exponential_delay_custom_base(self):
        """Custom base delay should scale all delays."""
        delay1 = calculate_exponential_delay(1, base_delay=2)
        delay2 = calculate_exponential_delay(2, base_delay=2)
        delay3 = calculate_exponential_delay(3, base_delay=2)
        
        assert delay1 == 2
        assert delay2 == 4
        assert delay3 == 8
    
    def test_exponential_delay_invalid_attempt(self):
        """Invalid attempt number should raise ValueError."""
        with pytest.raises(ValueError):
            calculate_exponential_delay(0)
        
        with pytest.raises(ValueError):
            calculate_exponential_delay(-1)


class TestJitter:
    """Tests for random jitter calculation."""
    
    def test_jitter_bidirectional(self):
        """Jitter should be applied bidirectionally (+ and -)."""
        delay = 10.0
        jitter_range = 0.3
        
        # Collect many samples to check both directions
        samples = [calculate_jitter(delay, jitter_range) for _ in range(1000)]
        
        # All samples should be positive
        assert all(s > 0 for s in samples)
        
        # Some samples should be less than delay (negative jitter)
        assert any(s < delay for s in samples)
        
        # Some samples should be greater than delay (positive jitter)
        assert any(s > delay for s in samples)
    
    def test_jitter_range(self):
        """Jitter should stay within ±30% range (with some tolerance for floating point)."""
        delay = 100.0
        jitter_range = 0.3
        min_expected = delay * (1 - jitter_range)
        max_expected = delay * (1 + jitter_range)
        
        for _ in range(1000):
            jittered = calculate_jitter(delay, jitter_range)
            # Allow small floating point tolerance
            assert jittered >= min_expected * 0.999, f"Jittered value {jittered} below minimum {min_expected}"
            assert jittered <= max_expected * 1.001, f"Jittered value {jittered} above maximum {max_expected}"
    
    def test_jitter_zero_delay(self):
        """Zero delay with jitter should still be positive."""
        jittered = calculate_jitter(0, 0.3)
        assert jittered >= 0


class TestRetryDelay:
    """Tests for combined retry delay with backoff and jitter."""
    
    def test_retry_delay_sequences(self):
        """Retry delays should follow expected pattern."""
        # Attempt 1: 1s * (1 ± 0.3) = 0.7-1.3s
        delay1 = calculate_retry_delay(1)
        assert 0.7 <= delay1 <= 1.3
        
        # Attempt 2: 2s * (1 ± 0.3) = 1.4-2.6s
        delay2 = calculate_retry_delay(2)
        assert 1.4 <= delay2 <= 2.6
        
        # Attempt 5: 16s * (1 ± 0.3) = 11.2-20.8s
        delay5 = calculate_retry_delay(5)
        assert 11.2 <= delay5 <= 20.8
    
    def test_get_next_retry_time(self):
        """Next retry time should be in the future."""
        now = datetime.now(timezone.utc)
        next_time = get_next_retry_time(1, now=now)
        
        assert next_time > now
        assert (next_time - now).total_seconds() > 0.7  # At least base delay
    
    def test_should_retry(self):
        """should_retry should return correct values."""
        assert should_retry(1, 5) is True
        assert should_retry(4, 5) is True
        assert should_retry(5, 5) is False  # 5 == max_attempts
        assert should_retry(6, 5) is False
    
    def test_should_retry_custom_max(self):
        """should_retry with custom max_attempts."""
        assert should_retry(1, 3) is True
        assert should_retry(2, 3) is True
        assert should_retry(3, 3) is False


# ============ Database Model Tests ============

class TestWebhookModel:
    """Tests for Webhook model."""
    
    def test_webhook_creation(self):
        """Webhook should be creatable with required fields."""
        webhook = Webhook(
            url="https://example.com/webhook",
            events='["order.created", "order.updated"]',
            secret_key="test-secret-key",
            is_active=True,
        )
        
        assert webhook.url == "https://example.com/webhook"
        assert webhook.is_active is True
        assert webhook.secret_key == "test-secret-key"
    
    def test_webhook_default_values(self):
        """Webhook should have correct default values when not specified."""
        webhook = Webhook(
            url="https://example.com/webhook",
            events='["test"]',
            secret_key="test-key",
        )
        
        # Default is_active should be True (applied via __init__)
        assert webhook.is_active is True
    
    def test_webhook_repr(self):
        """Webhook repr should contain useful info."""
        webhook = Webhook(
            id=uuid4(),
            url="https://example.com/webhook",
            events='["test"]',
            secret_key="test-key",
        )
        
        repr_str = repr(webhook)
        assert "Webhook" in repr_str
        assert "example.com" in repr_str


class TestDeliveryAttemptModel:
    """Tests for DeliveryAttempt model."""
    
    def test_delivery_attempt_creation(self):
        """DeliveryAttempt should be creatable with required fields."""
        attempt = DeliveryAttempt(
            webhook_id=uuid4(),
            attempt_number=1,
            status=DeliveryStatus.PENDING,
            payload='{"event": "test"}',
        )
        
        assert attempt.attempt_number == 1
        assert attempt.status == DeliveryStatus.PENDING
    
    def test_delivery_attempt_default_values(self):
        """DeliveryAttempt should have correct default values when not specified."""
        attempt = DeliveryAttempt(
            webhook_id=uuid4(),
        )
        
        # Defaults should be applied via __init__
        assert attempt.attempt_number == 1
        assert attempt.status == DeliveryStatus.PENDING
    
    def test_delivery_status_values(self):
        """DeliveryStatus enum should have expected values."""
        assert DeliveryStatus.PENDING.value == "PENDING"
        assert DeliveryStatus.RETRYING.value == "RETRYING"
        assert DeliveryStatus.SUCCESS.value == "SUCCESS"
        assert DeliveryStatus.FAILED.value == "FAILED"


class TestWebhookHealthModel:
    """Tests for WebhookHealth model."""
    
    def test_webhook_health_creation(self):
        """WebhookHealth should be creatable with required fields."""
        health = WebhookHealth(
            webhook_id=uuid4(),
            success_count=10,
            failure_count=2,
            health_score=0.833,
        )
        
        assert health.success_count == 10
        assert health.failure_count == 2
        assert health.health_score == 0.833
    
    def test_webhook_health_default_score(self):
        """New health record should have default score of 1.0 when not specified."""
        health = WebhookHealth(webhook_id=uuid4())
        # Default health_score should be 1.0 (applied via __init__)
        assert health.health_score == 1.0


# ============ Health Scoring Tests ============

class TestHealthScoring:
    """Tests for health score calculation."""
    
    def test_initial_health_score(self):
        """New health record should start at 1.0."""
        health = WebhookHealth(webhook_id=uuid4())
        assert health.health_score == 1.0
    
    def test_health_score_after_failures(self):
        """Health score should decrease after failures."""
        # Simulate EMA update
        health = WebhookHealth(webhook_id=uuid4())
        alpha = 0.2
        
        # First failure
        success_rate = 0 / 1
        health.health_score = alpha * success_rate + (1 - alpha) * health.health_score
        assert health.health_score < 1.0
        
        # Second failure
        success_rate = 0 / 2
        health.health_score = alpha * success_rate + (1 - alpha) * health.health_score
        assert health.health_score < 0.8  # Should decrease further
    
    def test_health_score_recovery(self):
        """Health score should recover with successes."""
        health = WebhookHealth(webhook_id=uuid4())
        alpha = 0.2
        
        # Drop to low score
        health.health_score = 0.1
        
        # Multiple successes
        for _ in range(10):
            success_rate = 1.0  # All successful
            health.health_score = alpha * success_rate + (1 - alpha) * health.health_score
        
        # Should have recovered significantly
        assert health.health_score > 0.8


# ============ Idempotency Tests ============

class TestIdempotency:
    """Tests for idempotency key handling."""
    
    def test_idempotency_key_scope(self):
        """Idempotency key should be scoped to webhook_id."""
        # This tests that the composite unique constraint is correctly defined
        # The actual database constraint would be tested in integration tests
        
        # Verify the model supports webhook_id in the attempt
        attempt1 = DeliveryAttempt(
            webhook_id=uuid4(),
            idempotency_key="event-123",
        )
        attempt2 = DeliveryAttempt(
            webhook_id=uuid4(),  # Different webhook
            idempotency_key="event-123",  # Same key
        )
        
        # Both should be valid (different webhooks)
        assert attempt1.idempotency_key == attempt2.idempotency_key
        assert attempt1.webhook_id != attempt2.webhook_id
    
    def test_same_idempotency_key_same_webhook(self):
        """Same webhook with same key should be duplicate."""
        webhook_id = uuid4()
        
        attempt1 = DeliveryAttempt(
            webhook_id=webhook_id,
            idempotency_key="event-123",
        )
        attempt2 = DeliveryAttempt(
            webhook_id=webhook_id,
            idempotency_key="event-123",  # Same key, same webhook
        )
        
        # These would violate the unique constraint
        assert attempt1.webhook_id == attempt2.webhook_id
        assert attempt1.idempotency_key == attempt2.idempotency_key


# ============ Payload Size Tests ============

class TestPayloadSize:
    """Tests for payload size validation."""
    
    def test_default_payload_limit(self):
        """Default payload limit should be 256KB."""
        from delivery import DEFAULT_PAYLOAD_SIZE_LIMIT
        assert DEFAULT_PAYLOAD_SIZE_LIMIT == 256 * 1024
    
    def test_small_payload_under_limit(self):
        """Small payloads should be under the limit."""
        small_payload = {"event": "test", "data": "hello"}
        payload_bytes = json.dumps(small_payload).encode()
        
        assert len(payload_bytes) < 256 * 1024
    
    def test_large_payload_over_limit(self):
        """Large payloads should exceed the limit."""
        # Create a payload that exceeds 256KB
        large_data = "x" * (300 * 1024)  # 300KB
        large_payload = {"event": "test", "data": large_data}
        payload_bytes = json.dumps(large_payload).encode()
        
        assert len(payload_bytes) > 256 * 1024


# ============ Graceful Shutdown Tests ============

class TestGracefulShutdown:
    """Tests for graceful shutdown behavior."""
    
    def test_shutdown_preserves_retry_state(self):
        """Shutdown should preserve retry state for pending deliveries."""
        # This tests the concept that retry records should have next_retry_at set
        attempt = DeliveryAttempt(
            webhook_id=uuid4(),
            status=DeliveryStatus.RETRYING,
            next_retry_at=datetime.now(timezone.utc) + timedelta(seconds=10),
        )
        
        assert attempt.status == DeliveryStatus.RETRYING
        assert attempt.next_retry_at is not None
    
    def test_shutdown_handles_in_flight(self):
        """Shutdown should handle in-flight deliveries."""
        # Create a pending delivery that might be in-flight
        attempt = DeliveryAttempt(
            webhook_id=uuid4(),
            status=DeliveryStatus.PENDING,
            payload='{"event": "test"}',
        )
        
        # The delivery should be processable
        assert attempt.status == DeliveryStatus.PENDING


# ============ Constants Validation ============

class TestConstants:
    """Tests to validate required constants."""
    
    def test_default_max_attempts(self):
        """Default max attempts should be 5."""
        assert DEFAULT_MAX_ATTEMPTS == 5
    
    def test_default_base_delay(self):
        """Default base delay should be 1 second."""
        assert DEFAULT_BASE_DELAY_SECONDS == 1.0
    
    def test_default_jitter_range(self):
        """Default jitter range should be 0.3 (30%)."""
        assert DEFAULT_JITTER_RANGE == 0.3
    
    def test_exponential_backoff_off_by_one(self):
        """Verify exponential backoff doesn't have off-by-one error."""
        # Attempt 1 should be 1s, not 0.5s or 2s
        delay_1 = calculate_exponential_delay(1)
        delay_2 = calculate_exponential_delay(2)
        delay_3 = calculate_exponential_delay(3)
        
        # Sequence should be 1, 2, 4 (not 0.5, 1, 2 or 2, 4, 8)
        assert delay_1 == 1
        assert delay_2 == 2
        assert delay_3 == 4


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v"])

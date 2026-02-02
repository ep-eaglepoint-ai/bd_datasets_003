"""
Webhook signature generation and verification.

This module provides HMAC-SHA256 signature generation with timestamp-based
replay attack prevention. Signatures follow the format:
  t={timestamp},v1={hex_signature}

Where the signature is computed over: {timestamp}.{payload}
"""

import hmac
import hashlib
import secrets
import time
from typing import Tuple


def generate_secret_key() -> str:
    """
    Generate a cryptographically secure secret key for webhook signatures.
    
    Uses secrets.token_urlsafe(32) which produces at least 32 bytes (256 bits)
    of entropy, suitable for HMAC-SHA256 signatures.
    
    Returns:
        A URL-safe base64-encoded string containing 32 random bytes.
    """
    return secrets.token_urlsafe(32)


def generate_signature(secret_key: str, payload: bytes, timestamp: int) -> str:
    """
    Generate HMAC-SHA256 signature for a webhook payload.
    
    The signature is computed over the format: {timestamp}.{payload}
    This prevents replay attacks by including a timestamp that can be
    validated on the receiving end.
    
    Args:
        secret_key: The webhook's secret key for HMAC signing.
        payload: The raw JSON payload bytes.
        timestamp: Unix timestamp to include in signature.
    
    Returns:
        Hex-encoded HMAC-SHA256 signature.
    """
    # Create signature input: timestamp.payload
    signature_input = f"{timestamp}.{payload.decode('utf-8')}"
    
    # Compute HMAC-SHA256
    signature = hmac.new(
        secret_key.encode('utf-8'),
        signature_input.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return signature


def format_signature_header(timestamp: int, signature: str) -> str:
    """
    Format signature header following the standard format.
    
    Format: t={timestamp},v1={signature}
    
    This format supports future signature version upgrades while
    maintaining backward compatibility.
    
    Args:
        timestamp: Unix timestamp.
        signature: Hex-encoded HMAC signature.
    
    Returns:
        Formatted signature header value.
    """
    return f"t={timestamp},v1={signature}"


def parse_signature_header(header: str) -> Tuple[int, str]:
    """
    Parse signature header into timestamp and signature components.
    
    Args:
        header: Signature header value in format "t={timestamp},v1={signature}".
    
    Returns:
        Tuple of (timestamp, signature).
    
    Raises:
        ValueError: If header format is invalid.
    """
    parts = header.split(',')
    if len(parts) != 2:
        raise ValueError("Invalid signature header format")
    
    timestamp_part, signature_part = parts
    
    if not timestamp_part.startswith('t='):
        raise ValueError("Missing timestamp prefix in signature header")
    
    if not signature_part.startswith('v1='):
        raise ValueError("Missing signature version in signature header")
    
    try:
        timestamp = int(timestamp_part[2:])
        signature = signature_part[3:]
    except (ValueError, IndexError):
        raise ValueError("Invalid signature header values")
    
    return timestamp, signature


def verify_signature(
    secret_key: str,
    payload: bytes,
    signature_header: str,
    clock_skew_tolerance: int = 300  # 5 minutes default
) -> bool:
    """
    Verify webhook signature with constant-time comparison and replay protection.
    
    This function:
    1. Parses the signature header to extract timestamp and signature
    2. Validates the timestamp is within the tolerance window (prevents replay attacks)
    3. Computes expected signature using the provided secret key
    4. Uses constant-time comparison to prevent timing attacks
    
    Args:
        secret_key: The webhook's secret key.
        payload: The raw payload bytes received.
        signature_header: The X-Webhook-Signature header value.
        clock_skew_tolerance: Maximum allowed difference in seconds (default: 5 minutes).
    
    Returns:
        True if signature is valid, False otherwise.
    
    Raises:
        ValueError: If header format is invalid or timestamp is outside tolerance window.
    """
    # Parse the signature header
    timestamp, provided_signature = parse_signature_header(signature_header)
    
    # Check timestamp for replay attack prevention
    current_time = int(time.time())
    time_diff = abs(current_time - timestamp)
    
    if time_diff > clock_skew_tolerance:
        raise ValueError(
            f"Signature timestamp outside tolerance window. "
            f"Difference: {time_diff}s, tolerance: {clock_skew_tolerance}s"
        )
    
    # Compute expected signature
    expected_signature = generate_signature(secret_key, payload, timestamp)
    
    # Use constant-time comparison to prevent timing attacks
    return hmac.compare_digest(expected_signature, provided_signature)


def create_signed_payload(secret_key: str, payload: dict) -> Tuple[bytes, str, int]:
    """
    Create a signed payload with headers for webhook delivery.
    
    Args:
        secret_key: The webhook's secret key.
        payload: The payload dictionary to send.
    
    Returns:
        Tuple of (json_bytes, signature_header, timestamp).
    """
    import json
    
    # Serialize payload to bytes
    json_bytes = json.dumps(payload, separators=(',', ':')).encode('utf-8')
    
    # Get current timestamp
    timestamp = int(time.time())
    
    # Generate signature
    signature = generate_signature(secret_key, json_bytes, timestamp)
    
    # Format header
    signature_header = format_signature_header(timestamp, signature)
    
    return json_bytes, signature_header, timestamp

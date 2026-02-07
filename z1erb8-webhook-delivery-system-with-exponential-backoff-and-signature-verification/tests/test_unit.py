import pytest
from app.services.webhook_service import generate_signature
import hmac
import hashlib

def test_generate_signature():
    secret = "mysecret"
    payload = '{"event": "test"}'
    
    expected = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    result = generate_signature(payload, secret)
    assert result == expected

def test_generate_signature_bytes():
    secret = b"mysecret"
    payload = b'{"event": "test"}'
    
    expected = hmac.new(
        secret,
        payload,
        hashlib.sha256
    ).hexdigest()
    
    result = generate_signature(payload, secret)
    assert result == expected

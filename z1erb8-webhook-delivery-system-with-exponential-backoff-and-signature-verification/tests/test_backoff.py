import pytest
from app.services.webhook_service import calculate_next_retry
from app.config import RETRY_DELAYS
from datetime import datetime, timedelta

def test_calculate_next_retry():
    # Test retry delays match config roughly + jitter
    # 1min, 5min, 30min, 2hr, 24hr
    # RETRY_DELAYS = [60, 300, 1800, 7200, 86400]
    
    for i, delay in enumerate(RETRY_DELAYS):
        next_time = calculate_next_retry(i)
        assert next_time is not None
        
        # Calculate diff in seconds
        diff = (next_time - datetime.utcnow()).total_seconds()
        
        # Allow 10% jitter + strict margin
        jitter = delay * 0.1
        assert (delay - jitter - 2) <= diff <= (delay + jitter + 2)

def test_calculate_next_retry_end():
    # After last attempt, should return None
    result = calculate_next_retry(len(RETRY_DELAYS))
    assert result is None

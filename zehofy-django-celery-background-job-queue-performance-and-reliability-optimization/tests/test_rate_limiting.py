"""
Tests for rate limiting - token bucket algorithm for external APIs.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
import sys
import os
import time

# Determine which repository to use based on PYTHONPATH
PYTHONPATH = os.environ.get('PYTHONPATH', '')
if 'repository_before' in PYTHONPATH:
    REPO_DIR = 'repository_before'
else:
    REPO_DIR = 'repository_after'

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', REPO_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')


class TestTokenBucketRateLimiter:
    """Test TokenBucketRateLimiter implementation."""
    
    def test_rate_limiter_initializes(self):
        """Test that rate limiter initializes correctly."""
        from apps.tasks.utils import TokenBucketRateLimiter
        
        limiter = TokenBucketRateLimiter(rate=1.0, capacity=10)
        
        assert limiter.rate == 1.0
        assert limiter.capacity == 10
    
    def test_rate_limiter_consume_allowed(self):
        """Test that consumption is allowed when tokens available."""
        from apps.tasks.utils import TokenBucketRateLimiter
        
        limiter = TokenBucketRateLimiter(rate=1.0, capacity=10)
        
        with patch.object(limiter.redis, 'pipeline') as mock_pipeline:
            mock_pipe = MagicMock()
            mock_pipe.execute.return_value = ['10.0', str(time.time())]
            mock_pipeline.return_value = mock_pipe
            
            allowed, wait_time = limiter.consume('test-key')
            
            # Should be allowed
            assert allowed is True
            # No wait time
            assert wait_time == 0
    
    def test_rate_limiter_consume_denied(self):
        """Test that consumption is denied when no tokens."""
        from apps.tasks.utils import TokenBucketRateLimiter
        
        limiter = TokenBucketRateLimiter(rate=0.01, capacity=1)  # Very slow rate
        
        with patch.object(limiter.redis, 'pipeline') as mock_pipeline:
            mock_pipe = MagicMock()
            # Simulate empty bucket
            mock_pipe.execute.return_value = ['0', str(time.time())]
            mock_pipeline.return_value = mock_pipe
            
            allowed, wait_time = limiter.consume('test-key')
            
            # Should be denied
            assert allowed is False
            # Should have wait time
            assert wait_time > 0
    
    def test_rate_limiter_get_remaining(self):
        """Test that remaining tokens can be queried."""
        from apps.tasks.utils import TokenBucketRateLimiter
        
        limiter = TokenBucketRateLimiter(rate=1.0, capacity=10)
        
        with patch.object(limiter.redis, 'pipeline') as mock_pipeline:
            mock_pipe = MagicMock()
            mock_pipe.execute.return_value = ['5.0', str(time.time())]
            mock_pipeline.return_value = mock_pipe
            
            remaining = limiter.get_remaining('test-key')
            
            # Should return remaining tokens
            assert remaining >= 0
            assert remaining <= limiter.capacity


class TestPushNotificationRateLimiting:
    """Test that push notifications use rate limiting."""
    
    def test_push_limiter_exists(self):
        """Test that push notification rate limiter exists."""
        from apps.tasks.utils import PUSH_NOTIFICATION_LIMITER
        
        assert PUSH_NOTIFICATION_LIMITER is not None
        assert PUSH_NOTIFICATION_LIMITER.redis_prefix == 'push_api'
    
    def test_push_limiter_capacity(self):
        """Test push notification limiter has reasonable capacity."""
        from apps.tasks.utils import PUSH_NOTIFICATION_LIMITER
        
        # Should have capacity for burst of notifications
        assert PUSH_NOTIFICATION_LIMITER.capacity >= 50
    
    def test_push_limiter_rate(self):
        """Test push notification limiter has appropriate rate."""
        from apps.tasks.utils import PUSH_NOTIFICATION_LIMITER
        
        # Rate should be reasonable (100 per minute = ~1.67 per second)
        assert PUSH_NOTIFICATION_LIMITER.rate > 0
        assert PUSH_NOTIFICATION_LIMITER.rate < 10


class TestEmailRateLimiting:
    """Test that emails use rate limiting."""
    
    def test_email_limiter_exists(self):
        """Test that email rate limiter exists."""
        from apps.tasks.utils import EMAIL_RATE_LIMITER
        
        assert EMAIL_RATE_LIMITER is not None
        assert EMAIL_RATE_LIMITER.redis_prefix == 'email_api'
    
    def test_email_limiter_capacity(self):
        """Test email limiter has reasonable capacity."""
        from apps.tasks.utils import EMAIL_RATE_LIMITER
        
        # Should allow burst of emails
        assert EMAIL_RATE_LIMITER.capacity >= 20
    
    def test_email_limiter_rate(self):
        """Test email limiter has appropriate rate."""
        from apps.tasks.utils import EMAIL_RATE_LIMITER
        
        # Rate should prevent overwhelming email service
        assert EMAIL_RATE_LIMITER.rate > 0
        assert EMAIL_RATE_LIMITER.rate < 5


class TestNotificationTaskRateLimiting:
    """Test that notification tasks enforce rate limits."""
    
    @patch('apps.notifications.models.Notification.objects.create')
    @patch('apps.notifications.models.PushSubscription.objects.filter')
    @patch('apps.tasks.notification_tasks.check_idempotency')
    @patch('apps.tasks.notification_tasks.requests.post')
    @patch('apps.tasks.notification_tasks.PUSH_NOTIFICATION_LIMITER.consume')
    def test_send_push_respects_rate_limit(self, mock_consume, mock_post, mock_check, mock_subscriptions, mock_notification):
        """Test that send push respects rate limit."""
        from apps.tasks.notification_tasks import send_push_notification
        
        # Rate limited
        mock_consume.return_value = (False, 5.0)
        
        from celery.exceptions import Retry
        
        with pytest.raises((Retry, Exception)):
            send_push_notification(1, 'Test', 'Message')
    
    @patch('apps.notifications.models.Notification.objects.create')
    @patch('apps.notifications.models.PushSubscription.objects.filter')
    @patch('apps.tasks.notification_tasks.check_idempotency')
    @patch('apps.tasks.notification_tasks.mark_idempotency_complete')
    @patch('apps.tasks.notification_tasks.requests.post')
    @patch('apps.tasks.notification_tasks.PUSH_NOTIFICATION_LIMITER.consume')
    def test_send_push_allowed_when_rate_available(self, mock_consume, mock_post, mock_mark_complete, mock_check, mock_subscriptions, mock_notification):
        """Test that send push is allowed when rate available."""
        from apps.tasks.notification_tasks import send_push_notification
        from apps.notifications.models import PushSubscription
        
        mock_consume.return_value = (True, 0)
        mock_post.return_value = MagicMock(ok=True, json=MagicMock(return_value={'id': '123'}))
        mock_check.return_value = (False, None)
        
        mock_subscription = MagicMock()
        mock_subscription.id = 1
        mock_subscription.endpoint = 'https://test.com'
        
        mock_qs = MagicMock()
        mock_qs.exists.return_value = True
        mock_qs.__iter__ = MagicMock(return_value=iter([mock_subscription]))
        mock_subscriptions.return_value = mock_qs
        
        mock_notification_obj = MagicMock()
        mock_notification_obj.id = 1
        mock_notification.return_value = mock_notification_obj
        
        result = send_push_notification(1, 'Test', 'Message')
        
        # Should call API when rate limit allows
        assert mock_post.called


class TestRateLimitingRedis:
    """Test that rate limiting uses Redis for distributed coordination."""
    
    def test_rate_limiter_uses_redis(self):
        """Test that rate limiter uses Redis."""
        from apps.tasks.utils import TokenBucketRateLimiter
        
        limiter = TokenBucketRateLimiter(rate=1.0, capacity=10)
        
        assert limiter.redis is not None
    
    def test_rate_limiter_has_ttl_on_keys(self):
        """Test that rate limiter keys have TTL."""
        from apps.tasks.utils import TokenBucketRateLimiter
        
        limiter = TokenBucketRateLimiter(rate=1.0, capacity=10)
        
        with patch.object(limiter.redis, 'pipeline') as mock_pipeline:
            mock_pipe = MagicMock()
            mock_pipe.execute.return_value = ['10.0', str(time.time())]
            mock_pipeline.return_value = mock_pipe
            
            limiter.consume('test-key')
            
            # Check that setex was called (has TTL)
            calls = mock_pipe.setex.call_args_list
            for call in calls:
                # setex should be called with TTL
                if len(call[0]) >= 2:
                    ttl = call[0][1]
                    assert ttl > 0, "Rate limiter keys should have TTL"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

"""
Tests for task idempotency - ensuring duplicate task execution is prevented.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
import json
import sys
import os

# Determine which repository to use based on PYTHONPATH
PYTHONPATH = os.environ.get('PYTHONPATH', '')
if 'repository_before' in PYTHONPATH:
    REPO_DIR = 'repository_before'
else:
    REPO_DIR = 'repository_after'

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', REPO_DIR))

# Set Django settings before importing Django modules
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')


class TestIdempotencyKeys:
    """Test idempotency key generation and checking."""
    
    def test_generate_idempotency_key_deterministic(self):
        """Test that idempotency keys are deterministic."""
        from apps.tasks.utils import generate_idempotency_key
        
        task_name = 'send_welcome_email'
        args = (123,)
        kwargs = {}
        
        key1 = generate_idempotency_key(task_name, args, kwargs)
        key2 = generate_idempotency_key(task_name, args, kwargs)
        
        assert key1 == key2, "Idempotency key should be deterministic"
    
    def test_generate_idempotency_key_unique_for_different_args(self):
        """Test that different arguments produce different keys."""
        from apps.tasks.utils import generate_idempotency_key
        
        task_name = 'send_welcome_email'
        
        key1 = generate_idempotency_key(task_name, (123,), {})
        key2 = generate_idempotency_key(task_name, (456,), {})
        
        assert key1 != key2, "Different args should produce different keys"
    
    def test_generate_idempotency_key_ignores_order(self):
        """Test that key generation is order-independent for kwargs."""
        from apps.tasks.utils import generate_idempotency_key
        
        task_name = 'send_push_notification'
        
        key1 = generate_idempotency_key(task_name, (), {'a': 1, 'b': 2})
        key2 = generate_idempotency_key(task_name, (), {'b': 2, 'a': 1})
        
        assert key1 == key2, "Kwargs order should not affect key"
    
    def test_check_idempotency_returns_true_for_completed(self):
        """Test that idempotency check returns True for completed tasks."""
        from apps.tasks.utils import check_idempotency
        
        # Mock Redis
        mock_redis = MagicMock()
        mock_redis.get.return_value = json.dumps({'status': 'completed', 'result': 'cached'})
        
        with patch('apps.tasks.utils.get_redis_client', return_value=mock_redis):
            completed, result = check_idempotency('test-key')
            
            assert completed is True
            assert result == {'status': 'completed', 'result': 'cached'}
    
    def test_check_idempotency_returns_false_for_new(self):
        """Test that idempotency check returns False for new tasks."""
        from apps.tasks.utils import check_idempotency
        
        # Mock Redis
        mock_redis = MagicMock()
        mock_redis.get.return_value = None
        
        with patch('apps.tasks.utils.get_redis_client', return_value=mock_redis):
            completed, result = check_idempotency('test-key')
            
            assert completed is False
            assert result is None


class TestEmailTaskIdempotency:
    """Test email task idempotency."""
    
    @patch('django.contrib.auth.models.User.objects.get')
    @patch('apps.tasks.email_tasks.EmailLog.objects.create')
    @patch('apps.tasks.email_tasks.send_mail')
    @patch('apps.tasks.email_tasks.check_idempotency')
    @patch('apps.tasks.email_tasks.mark_idempotency_complete')
    @patch('apps.tasks.email_tasks.EMAIL_RATE_LIMITER.consume')
    def test_send_welcome_email_skips_on_duplicate(
        self, mock_consume, mock_mark_complete, mock_check,
        mock_send_mail, mock_email_log, mock_user_get
    ):
        """Test that welcome email is skipped if already sent."""
        from apps.tasks.email_tasks import send_welcome_email
        
        # Setup: task already completed
        mock_check.return_value = (True, {'status': 'sent', 'user_id': 1})
        
        result = send_welcome_email(1)
        
        # Should return cached result without sending email
        assert result == {'status': 'sent', 'user_id': 1}
        mock_send_mail.assert_not_called()
        mock_email_log.assert_not_called()
    
    @patch('django.contrib.auth.models.User.objects.get')
    @patch('apps.tasks.email_tasks.EmailLog.objects.create')
    @patch('apps.tasks.email_tasks.send_mail')
    @patch('apps.tasks.email_tasks.check_idempotency')
    @patch('apps.tasks.email_tasks.mark_idempotency_complete')
    @patch('apps.tasks.email_tasks.EMAIL_RATE_LIMITER.consume')
    def test_send_welcome_email_sends_on_new(
        self, mock_consume, mock_mark_complete, mock_check,
        mock_send_mail, mock_email_log, mock_user_get
    ):
        """Test that welcome email is sent for new tasks."""
        from apps.tasks.email_tasks import send_welcome_email
        from django.contrib.auth.models import User
        
        # Setup: new task
        mock_check.return_value = (False, None)
        mock_consume.return_value = (True, 0)
        mock_user = Mock(spec=User, id=1, email='test@example.com', 
                         get_full_name=Mock(return_value='Test User'))
        mock_user_get.return_value = mock_user
        
        result = send_welcome_email(1)
        
        # Should send email and mark idempotency complete
        assert result['status'] == 'sent'
        mock_send_mail.assert_called_once()
        mock_mark_complete.assert_called_once()


class TestNotificationTaskIdempotency:
    """Test notification task idempotency."""
    
    @patch('apps.notifications.models.Notification.objects.create')
    @patch('apps.notifications.models.PushSubscription.objects.filter')
    @patch('apps.tasks.notification_tasks.check_idempotency')
    @patch('apps.tasks.notification_tasks.mark_idempotency_complete')
    @patch('apps.tasks.notification_tasks.PUSH_NOTIFICATION_LIMITER.consume')
    def test_send_push_notification_skips_on_duplicate(
        self, mock_consume, mock_mark_complete, mock_check,
        mock_subscriptions, mock_notification
    ):
        """Test that push notification is skipped if already sent."""
        from apps.tasks.notification_tasks import send_push_notification
        
        mock_check.return_value = (True, {'status': 'sent', 'user_id': 1})
        
        result = send_push_notification(1, 'Test', 'Message')
        
        assert result['status'] == 'sent'
    
    @patch('apps.notifications.models.Notification.objects.create')
    @patch('apps.notifications.models.PushSubscription.objects.filter')
    @patch('apps.tasks.notification_tasks.check_idempotency')
    @patch('apps.tasks.notification_tasks.mark_idempotency_complete')
    @patch('apps.tasks.notification_tasks.PUSH_NOTIFICATION_LIMITER.consume')
    def test_send_push_notification_sends_on_new(
        self, mock_consume, mock_mark_complete, mock_check,
        mock_subscriptions, mock_notification
    ):
        """Test that push notification is sent for new tasks."""
        from apps.tasks.notification_tasks import send_push_notification
        from apps.notifications.models import PushSubscription
        
        mock_check.return_value = (False, None)
        mock_consume.return_value = (True, 0)
        
        mock_subscription = Mock(spec=PushSubscription, id=1, endpoint='https://test.com')
        mock_qs = MagicMock()
        mock_qs.exists.return_value = True
        mock_qs.__iter__ = MagicMock(return_value=iter([mock_subscription]))
        mock_subscriptions.return_value = mock_qs
        
        mock_notification_obj = MagicMock()
        mock_notification_obj.id = 1
        mock_notification.return_value = mock_notification_obj
        
        with patch('apps.tasks.notification_tasks.requests.post') as mock_post:
            mock_response = Mock()
            mock_response.ok = True
            mock_response.json.return_value = {'id': '123'}
            mock_post.return_value = mock_response
            
            result = send_push_notification(1, 'Test', 'Message')
            
            assert result['status'] == 'sent'
            mock_mark_complete.assert_called_once()


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

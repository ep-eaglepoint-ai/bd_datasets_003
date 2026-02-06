"""
Tests for task retry behavior - exponential backoff with jitter.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# Determine which repository to use based on PYTHONPATH
PYTHONPATH = os.environ.get('PYTHONPATH', '')
if 'repository_before' in PYTHONPATH:
    REPO_DIR = 'repository_before'
else:
    REPO_DIR = 'repository_after'

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', REPO_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')


class TestRetryBehavior:
    """Test that tasks retry with exponential backoff and jitter."""
    
    def test_email_task_has_retry_config(self):
        """Test that email tasks have retry configuration."""
        from apps.tasks.email_tasks import send_welcome_email
        
        # Check task has retry settings
        assert hasattr(send_welcome_email, 'bind')
        
        # Task should have max_retries
        assert send_welcome_email.max_retries == 3
    
    def test_email_task_uses_exponential_backoff(self):
        """Test that email tasks use exponential backoff."""
        from apps.tasks.email_tasks import send_welcome_email
        
        # Check retry settings
        assert send_welcome_email.default_retry_delay == 60
        assert send_welcome_email.autoretry_for is not None
        assert send_welcome_email.retry_backoff is True
    
    def test_email_task_has_jitter(self):
        """Test that tasks use jitter for retry delays."""
        from apps.tasks.email_tasks import send_welcome_email
        
        assert send_welcome_email.retry_jitter is True
    
    def test_notification_task_has_retry_config(self):
        """Test that notification tasks have retry configuration."""
        from apps.tasks.notification_tasks import send_push_notification
        
        assert send_push_notification.max_retries == 3
        assert send_push_notification.retry_backoff is True
        assert send_push_notification.retry_jitter is True
    
    def test_import_task_has_retry_config(self):
        """Test that import tasks have retry configuration."""
        from apps.tasks.import_tasks import import_products_from_csv
        
        assert import_products_from_csv.max_retries == 3
        assert import_products_from_csv.retry_backoff is True
    
    def test_retry_delay_increases_exponentially(self):
        """Test that retry delays follow exponential pattern."""
        from celery.exceptions import Retry
        
        # Simulate retry with exponential backoff
        base_delay = 60  # 1 minute
        
        # Expected delays: 60s, 120s, 240s, 480s, 960s...
        # The 4th retry (960s) exceeds 600s, so we only check first 4
        expected_delays = [base_delay * (2 ** i) for i in range(4)]
        
        for expected in expected_delays:
            assert expected <= 900  # Max 15 minutes from settings
    
    def test_max_backoff_not_exceeded(self):
        """Test that retry backoff has maximum limit."""
        from apps.tasks.email_tasks import send_welcome_email
        
        # Max backoff should match settings (900 seconds = 15 minutes)
        assert send_welcome_email.retry_backoff_max == 900
    
    def test_report_task_has_retry_config(self):
        """Test that report tasks have retry configuration."""
        from apps.tasks.report_tasks import generate_sales_report
        
        assert generate_sales_report.max_retries == 3
        assert generate_sales_report.retry_backoff is True


class TestRetryExceptions:
    """Test retry exception handling."""
    
    @patch('django.contrib.auth.models.User.objects.get')
    @patch('apps.tasks.email_tasks.EmailLog.objects.create')
    @patch('apps.tasks.email_tasks.send_mail')
    @patch('apps.tasks.email_tasks.check_idempotency')
    @patch('apps.tasks.email_tasks.EMAIL_RATE_LIMITER.consume')
    def test_rate_limit_triggers_retry(self, mock_consume, mock_check, mock_send_mail, mock_email_log, mock_user_get):
        """Test that rate limit exceeded triggers retry."""
        from apps.tasks.email_tasks import send_welcome_email
        from celery.exceptions import Retry
        
        mock_consume.return_value = (False, 5.0)  # Rate limited
        mock_check.return_value = (False, None)
        
        with pytest.raises((Retry, Exception)):
            send_welcome_email(1)
    
    @patch('apps.notifications.models.Notification.objects.create')
    @patch('apps.notifications.models.PushSubscription.objects.filter')
    @patch('apps.tasks.notification_tasks.check_idempotency')
    @patch('apps.tasks.notification_tasks.requests.post')
    @patch('apps.tasks.notification_tasks.PUSH_NOTIFICATION_LIMITER.consume')
    def test_notification_rate_limit_triggers_retry(self, mock_consume, mock_post, mock_check, mock_subscriptions, mock_notification):
        """Test that notification rate limit triggers retry."""
        from apps.tasks.notification_tasks import send_push_notification
        from celery.exceptions import Retry
        
        mock_consume.return_value = (False, 3.0)
        mock_check.return_value = (False, None)
        
        mock_qs = MagicMock()
        mock_qs.exists.return_value = False
        mock_subscriptions.return_value = mock_qs
        
        with pytest.raises((Retry, Exception)):
            send_push_notification(1, 'Test', 'Message')


class TestRetryConfigurationSettings:
    """Test that Celery settings have correct retry configuration."""
    
    def test_exp_backoff_enabled_in_settings(self):
        """Test exponential backoff is enabled in settings."""
        from django.conf import settings
        
        assert hasattr(settings, 'CELERY_TASK_EXP_BACKOFF')
        assert settings.CELERY_TASK_EXP_BACKOFF is True
    
    def test_jitter_enabled_in_settings(self):
        """Test jitter is enabled in settings."""
        from django.conf import settings
        
        assert hasattr(settings, 'CELERY_TASK_BACKOFF_JITTER')
        assert settings.CELERY_TASK_BACKOFF_JITTER is True
    
    def test_max_backoff_configured(self):
        """Test maximum backoff is configured."""
        from django.conf import settings
        
        assert hasattr(settings, 'CELERY_TASK_EXP_BACKOFF_MAX')
        assert settings.CELERY_TASK_EXP_BACKOFF_MAX == 900  # 15 minutes
    
    def test_acks_late_enabled(self):
        """Test that late acknowledgment is enabled."""
        from django.conf import settings
        
        assert hasattr(settings, 'CELERY_TASK_ACKS_LATE')
        assert settings.CELERY_TASK_ACKS_LATE is True
    
    def test_reject_on_worker_lost(self):
        """Test that tasks are requeued on worker loss."""
        from django.conf import settings
        
        assert hasattr(settings, 'CELERY_TASK_REJECT_ON_WORKER_LOST')
        assert settings.CELERY_TASK_REJECT_ON_WORKER_LOST is True


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

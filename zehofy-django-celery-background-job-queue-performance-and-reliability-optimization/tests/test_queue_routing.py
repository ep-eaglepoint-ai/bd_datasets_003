"""
Tests for task queue routing - priority tasks go to priority queue.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')


class TestQueueRouting:
    """Test that tasks are routed to correct queues."""
    
    def test_email_task_has_priority_queue(self):
        """Test that email tasks use priority queue."""
        from apps.tasks.email_tasks import send_welcome_email
        
        assert send_welcome_email.queue == 'priority'
    
    def test_email_task_has_priority_level(self):
        """Test that email tasks have priority level."""
        from apps.tasks.email_tasks import send_welcome_email
        
        assert hasattr(send_welcome_email, 'priority')
        assert send_welcome_email.priority >= 5
    
    def test_notification_task_has_priority_queue(self):
        """Test that notification tasks use priority queue."""
        from apps.tasks.notification_tasks import send_push_notification
        
        assert send_push_notification.queue == 'priority'
    
    def test_notification_task_has_high_priority(self):
        """Test that notification tasks have high priority."""
        from apps.tasks.notification_tasks import send_push_notification
        
        assert send_push_notification.priority >= 8
    
    def test_import_task_has_bulk_queue(self):
        """Test that import tasks use bulk queue."""
        from apps.tasks.import_tasks import import_products_from_csv
        
        assert import_products_from_csv.queue == 'bulk'
    
    def test_import_task_has_low_priority(self):
        """Test that import tasks have low priority."""
        from apps.tasks.import_tasks import import_products_from_csv
        
        assert import_products_from_csv.priority <= 3
    
    def test_report_task_has_default_queue(self):
        """Test that report tasks use default queue."""
        from apps.tasks.report_tasks import generate_sales_report
        
        assert generate_sales_report.queue == 'default'


class TestCeleryQueueConfiguration:
    """Test that Celery queues are properly configured."""
    
    def test_priority_queue_exists(self):
        """Test that priority queue is configured."""
        from django.conf import settings
        
        queues = settings.CELERY_TASK_QUEUES
        
        # CELERY_TASK_QUEUES is a list of dictionaries
        queue_names = [q['name'] for q in queues]
        assert 'priority' in queue_names
    
    def test_default_queue_exists(self):
        """Test that default queue is configured."""
        from django.conf import settings
        
        queues = settings.CELERY_TASK_QUEUES
        
        queue_names = [q['name'] for q in queues]
        assert 'default' in queue_names
    
    def test_bulk_queue_exists(self):
        """Test that bulk queue is configured."""
        from django.conf import settings
        
        queues = settings.CELERY_TASK_QUEUES
        
        queue_names = [q['name'] for q in queues]
        assert 'bulk' in queue_names
    
    def test_priority_queue_has_max_priority(self):
        """Test that priority queue has max priority setting."""
        from django.conf import settings
        
        for queue in settings.CELERY_TASK_QUEUES:
            if queue['name'] == 'priority':
                assert queue['queue_arguments']['x-max-priority'] == 10
    
    def test_task_routes_configured(self):
        """Test that task routes are configured."""
        from django.conf import settings
        
        assert hasattr(settings, 'CELERY_TASK_ROUTES')
        routes = settings.CELERY_TASK_ROUTES
        
        # Email tasks should route to priority
        assert 'apps.tasks.email_tasks.*' in routes
        assert routes['apps.tasks.email_tasks.*']['queue'] == 'priority'
        
        # Notification tasks should route to priority
        assert 'apps.tasks.notification_tasks.*' in routes
        assert routes['apps.tasks.notification_tasks.*']['queue'] == 'priority'
        
        # Import tasks should route to bulk
        assert 'apps.tasks.import_tasks.*' in routes
        assert routes['apps.tasks.import_tasks.*']['queue'] == 'bulk'


class TestPrefetchMultiplier:
    """Test that prefetch multiplier is set to 1."""
    
    def test_prefetch_multiplier_is_one(self):
        """Test that workers only prefetch one task at a time."""
        from django.conf import settings
        
        assert settings.CELERY_WORKER_PREFETCH_MULTIPLIER == 1


class TestQueuePriorityOrder:
    """Test that priority queue is processed before other queues."""
    
    def test_priority_queue_routing_key(self):
        """Test that priority queue has correct routing key."""
        from django.conf import settings
        
        for queue in settings.CELERY_TASK_QUEUES:
            if queue['name'] == 'priority':
                assert queue['routing_key'] == 'priority'
    
    def test_bulk_queue_routing_key(self):
        """Test that bulk queue has correct routing key."""
        from django.conf import settings
        
        for queue in settings.CELERY_TASK_QUEUES:
            if queue['name'] == 'bulk':
                assert queue['routing_key'] == 'bulk'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

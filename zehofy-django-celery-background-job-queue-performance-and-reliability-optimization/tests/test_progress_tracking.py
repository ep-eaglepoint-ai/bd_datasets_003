"""
Tests for task progress tracking - queryable progress via status endpoint.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
import sys
import os
import json

# Determine which repository to use based on PYTHONPATH
PYTHONPATH = os.environ.get('PYTHONPATH', '')
if 'repository_before' in PYTHONPATH:
    REPO_DIR = 'repository_before'
else:
    REPO_DIR = 'repository_after'

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', REPO_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')


class TestProgressTracker:
    """Test ProgressTracker utility class."""
    
    def test_progress_tracker_initializes(self):
        """Test that ProgressTracker initializes correctly."""
        from apps.tasks.utils import ProgressTracker
        
        tracker = ProgressTracker('test-task-123', total_steps=100)
        
        assert tracker.task_id == 'test-task-123'
        assert tracker.total_steps == 100
    
    def test_progress_tracker_starts(self):
        """Test that progress tracking can be started."""
        from apps.tasks.utils import ProgressTracker
        
        tracker = ProgressTracker('test-task-123', total_steps=100)
        
        with patch.object(tracker.redis, 'hset') as mock_hset:
            with patch.object(tracker.redis, 'expire') as mock_expire:
                tracker.start()
                
                mock_hset.assert_called()
                mock_expire.assert_called()
    
    def test_progress_tracker_updates(self):
        """Test that progress can be updated."""
        from apps.tasks.utils import ProgressTracker
        
        tracker = ProgressTracker('test-task-123', total_steps=100)
        
        with patch.object(tracker.redis, 'hset') as mock_hset:
            percentage = tracker.update(50, 'Halfway done')
            
            assert percentage == 0.5
            mock_hset.assert_called()
    
    def test_progress_tracker_increments(self):
        """Test that progress can be incremented."""
        from apps.tasks.utils import ProgressTracker
        
        tracker = ProgressTracker('test-task-123', total_steps=100)
        
        with patch.object(tracker.redis, 'hget') as mock_hget:
            mock_hget.return_value = '10'
            
            with patch.object(tracker.redis, 'hset') as mock_hset:
                percentage = tracker.increment(10, 'Progress')
                
                assert percentage == 0.2
    
    def test_progress_tracker_completes(self):
        """Test that progress can be marked as complete."""
        from apps.tasks.utils import ProgressTracker
        
        tracker = ProgressTracker('test-task-123', total_steps=100)
        
        with patch.object(tracker.redis, 'hset') as mock_hset:
            tracker.complete({'result': 'success'}, 'Done')
            
            mock_hset.assert_called()
            # Verify status is set to completed
            call_args = mock_hset.call_args
            assert 'status' in call_args[1]['mapping']
    
    def test_progress_tracker_fails(self):
        """Test that progress can be marked as failed."""
        from apps.tasks.utils import ProgressTracker
        
        tracker = ProgressTracker('test-task-123', total_steps=100)
        
        with patch.object(tracker.redis, 'hset') as mock_hset:
            tracker.fail('Something went wrong')
            
            mock_hset.assert_called()
    
    def test_progress_tracker_get_status(self):
        """Test that status can be retrieved."""
        from apps.tasks.utils import ProgressTracker
        
        tracker = ProgressTracker('test-task-123', total_steps=100)
        
        with patch.object(tracker.redis, 'hgetall') as mock_hgetall:
            mock_hgetall.return_value = {
                'current': '50',
                'total': '100',
                'percentage': '50.0',
                'status': 'running'
            }
            
            status = tracker.get_status()
            
            assert status['current'] == 50
            assert status['total'] == 100
            assert status['percentage'] == 50.0
            assert status['status'] == 'running'
    
    def test_progress_tracker_is_complete(self):
        """Test completion check."""
        from apps.tasks.utils import ProgressTracker
        
        tracker = ProgressTracker('test-task-123', total_steps=100)
        
        with patch.object(tracker.redis, 'hget') as mock_hget:
            mock_hget.return_value = 'completed'
            
            assert tracker.is_complete is True
    
    def test_progress_tracker_is_failed(self):
        """Test failure check."""
        from apps.tasks.utils import ProgressTracker
        
        tracker = ProgressTracker('test-task-123', total_steps=100)
        
        with patch.object(tracker.redis, 'hget') as mock_hget:
            mock_hget.return_value = 'failed'
            
            assert tracker.is_failed is True


class TestImportTaskProgressTracking:
    """Test that import tasks track progress."""
    
    def test_import_products_tracks_progress(self):
        """Test that import products task tracks progress."""
        from apps.tasks.import_tasks import import_products_from_csv
        from apps.tasks.import_tasks import ProgressTracker
        from django.contrib.auth.models import User
        
        csv_content = "sku,name,price,stock,category_id\nSKU001,Product 1,10.99,100,1\n"
        
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            f.write(csv_content)
            temp_path = f.name
        
        try:
            with patch('apps.tasks.import_tasks.ProgressTracker') as mock_progress:
                with patch('django.contrib.auth.models.User.objects.get') as mock_user:
                    with patch('apps.tasks.email_tasks.send_mail') as mock_send:
                        with patch('apps.tasks.email_tasks.EmailLog.objects.create') as mock_log:
                            with patch('apps.tasks.email_tasks.EMAIL_RATE_LIMITER.consume') as mock_rate:
                                with patch('apps.tasks.email_tasks.check_idempotency') as mock_check:
                                    with patch('apps.tasks.email_tasks.mark_idempotency_complete'):
                                        mock_rate.return_value = (True, 0)
                                        mock_check.return_value = (False, None)
                                        
                                        # Mock user object
                                        mock_user_obj = MagicMock()
                                        mock_user_obj.id = 1
                                        mock_user_obj.email = 'test@example.com'
                                        mock_user_obj.get_full_name.return_value = 'Test User'
                                        mock_user.return_value = mock_user_obj
                                        
                                        result = import_products_from_csv(temp_path)
                                        
                                        # ProgressTracker should be instantiated
                                        assert mock_progress.called
        finally:
            os.unlink(temp_path)


class TestNotificationTaskProgressTracking:
    """Test that notification tasks track progress."""
    
    def test_batch_notifications_tracks_progress(self):
        """Test that batch notification task tracks progress."""
        from apps.tasks.notification_tasks import send_batch_notifications
        
        with patch('apps.tasks.notification_tasks.send_push_notification') as mock_send:
            with patch('apps.tasks.notification_tasks.ProgressTracker') as mock_progress:
                with patch('apps.tasks.notification_tasks.check_idempotency') as mock_check:
                    with patch('apps.tasks.notification_tasks.PUSH_NOTIFICATION_LIMITER.consume') as mock_consume:
                        mock_consume.return_value = (True, 0)
                        mock_check.return_value = (False, None)
                        mock_send.return_value = {'status': 'sent'}
                        
                        result = send_batch_notifications([1, 2, 3], 'Test', 'Message')
                        
                        assert mock_progress.called


class TestReportTaskProgressTracking:
    """Test that report tasks track progress."""
    
    def test_sales_report_tracks_progress(self):
        """Test that sales report task tracks progress."""
        from apps.tasks.report_tasks import generate_sales_report
        
        with patch('apps.tasks.report_tasks.ReportData.objects') as mock_data:
            with patch('apps.tasks.report_tasks.Report.objects') as mock_report:
                with patch('apps.tasks.report_tasks.ProgressTracker') as mock_progress:
                    # Mock aggregations
                    mock_data.aggregate.return_value = {
                        'total_orders': 0,
                        'total_revenue': 0,
                        'total_quantity': 0
                    }
                    mock_data.filter.return_value.values.return_value.annotate.return_value = []
                    mock_report.create.return_value = MagicMock()
                    
                    result = generate_sales_report('2024-01-01', '2024-12-31')
                    
                    assert mock_progress.called


class TestProgressTrackingRedis:
    """Test that progress is stored in Redis for queryability."""
    
    def test_progress_tracker_uses_redis(self):
        """Test that progress tracker uses Redis for storage."""
        from apps.tasks.utils import ProgressTracker
        
        tracker = ProgressTracker('test-task-123', total_steps=100)
        
        assert tracker.redis is not None
    
    def test_progress_has_ttl(self):
        """Test that progress has TTL for automatic cleanup."""
        from apps.tasks.utils import ProgressTracker
        
        tracker = ProgressTracker('test-task-123', total_steps=100)
        
        # TTL should be set on start
        with patch.object(tracker.redis, 'hset') as mock_hset:
            with patch.object(tracker.redis, 'expire') as mock_expire:
                tracker.start()
                
                # expire should be called with 24 hour TTL
                mock_expire.assert_called_once()
                call_args = mock_expire.call_args
                assert call_args[0][1] == 86400  # 24 hours in seconds


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

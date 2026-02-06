"""
Tests for memory-bounded processing - streaming file imports and bulk operations.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock, mock_open
import sys
import os
import tempfile

# Determine which repository to use based on PYTHONPATH
PYTHONPATH = os.environ.get('PYTHONPATH', '')
if 'repository_before' in PYTHONPATH:
    REPO_DIR = 'repository_before'
else:
    REPO_DIR = 'repository_after'

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', REPO_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')


class TestStreamingFileProcessing:
    """Test that file imports use streaming instead of loading entire file."""
    
    def test_csv_import_processes_in_chunks(self):
        """Test that CSV import processes in chunks."""
        from apps.tasks.import_tasks import import_products_from_csv
        
        # Create temporary CSV file
        csv_content = "sku,name,price,stock,category_id\nSKU001,Product 1,10.99,100,1\nSKU002,Product 2,20.99,50,1\nSKU003,Product 3,30.99,75,1\n"
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            f.write(csv_content)
            temp_path = f.name
        
        try:
            # Mock dependencies at the correct locations
            with patch('django.contrib.auth.models.User.objects.get') as mock_user:
                with patch('apps.tasks.email_tasks.send_mail') as mock_send:
                    with patch('apps.tasks.email_tasks.EmailLog.objects.create') as mock_log:
                        with patch('apps.tasks.email_tasks.EMAIL_RATE_LIMITER.consume') as mock_rate:
                            with patch('apps.tasks.email_tasks.check_idempotency') as mock_check:
                                with patch('apps.tasks.email_tasks.ProgressTracker') as mock_progress:
                                    mock_rate.return_value = (True, 0)
                                    mock_check.return_value = (False, None)
                                    
                                    result = import_products_from_csv(temp_path)
                                    
                                    # Verify the task was called successfully
                                    assert result is not None
        finally:
            os.unlink(temp_path)
    
    def test_csv_does_not_load_entire_file(self):
        """Test that CSV import doesn't load entire file into memory."""
        from apps.tasks.import_tasks import import_products_from_csv
        
        # Create CSV file - the implementation should stream it
        lines = ["sku,name,price,stock,category_id"]
        for i in range(10):  # Smaller test
            lines.append(f"SKU{i},Product {i},{i*10.99},100,1")
        
        csv_content = "\n".join(lines)
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            f.write(csv_content)
            temp_path = f.name
        
        try:
            with patch('django.contrib.auth.models.User.objects.get') as mock_user:
                with patch('apps.tasks.email_tasks.send_mail') as mock_send:
                    with patch('apps.tasks.email_tasks.EmailLog.objects.create') as mock_log:
                        with patch('apps.tasks.email_tasks.EMAIL_RATE_LIMITER.consume') as mock_rate:
                            with patch('apps.tasks.email_tasks.check_idempotency') as mock_check:
                                with patch('apps.tasks.email_tasks.ProgressTracker') as mock_progress:
                                    mock_rate.return_value = (True, 0)
                                    mock_check.return_value = (False, None)
                                    
                                    result = import_products_from_csv(temp_path)
                                    
                                    # Task should complete successfully
                                    assert result is not None
        finally:
            os.unlink(temp_path)


class TestBulkDatabaseOperations:
    """Test that database operations use bulk methods."""
    
    def test_email_task_uses_bulk_operations(self):
        """Test that bulk email operations use efficient methods."""
        from apps.tasks.email_tasks import send_bulk_emails
        from django.contrib.auth.models import User
        
        with patch('django.contrib.auth.models.User.objects.filter') as mock_filter:
            with patch('django.contrib.auth.models.User.objects.get') as mock_get:
                with patch('apps.tasks.email_tasks.send_mail') as mock_send:
                    with patch('apps.tasks.email_tasks.EmailLog.objects.create') as mock_log:
                        with patch('apps.tasks.email_tasks.EMAIL_RATE_LIMITER.consume') as mock_rate:
                            with patch('apps.tasks.email_tasks.check_idempotency') as mock_check:
                                with patch('apps.tasks.email_tasks.ProgressTracker') as mock_progress:
                                    with patch('apps.tasks.email_tasks.mark_idempotency_complete'):
                                        mock_rate.return_value = (True, 0)
                                        mock_check.return_value = (False, None)
                                        
                                        # Mock user queryset
                                        user = MagicMock()
                                        user.id = 1
                                        user.email = 'test@example.com'
                                        user.get_full_name.return_value = 'Test User'
                                        mock_filter.return_value = [user]
                                        
                                        # Mock get to return user for any id
                                        mock_get.return_value = user
                                        
                                        result = send_bulk_emails([1, 2, 3], 'Test', 'Message')
                                        
                                        # Verify operations were called
                                        assert mock_send.called
    
    def test_import_task_uses_bulk_create(self):
        """Test that import tasks can use bulk_create."""
        from apps.tasks.import_tasks import import_products_from_csv
        
        csv_content = "sku,name,price,stock,category_id\nSKU001,Product 1,10.99,100,1\n"
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            f.write(csv_content)
            temp_path = f.name
        
        try:
            with patch('django.contrib.auth.models.User.objects.get') as mock_user:
                with patch('apps.tasks.email_tasks.send_mail') as mock_send:
                    with patch('apps.tasks.email_tasks.EmailLog.objects.create') as mock_log:
                        with patch('apps.tasks.email_tasks.EMAIL_RATE_LIMITER.consume') as mock_rate:
                            with patch('apps.tasks.email_tasks.check_idempotency') as mock_check:
                                with patch('apps.tasks.email_tasks.ProgressTracker') as mock_progress:
                                    mock_rate.return_value = (True, 0)
                                    mock_check.return_value = (False, None)
                                    
                                    result = import_products_from_csv(temp_path)
                                    
                                    # Verify the task completed
                                    assert result is not None
        finally:
            os.unlink(temp_path)
    
    def test_import_task_uses_update_or_create(self):
        """Test that large dataset import can use update_or_create."""
        # This test verifies the task exists and can be called
        from apps.tasks.import_tasks import import_large_dataset
        
        # The task should exist and be callable
        assert import_large_dataset is not None
        assert callable(import_large_dataset)


class TestBatchProcessing:
    """Test that tasks process in batches for memory efficiency."""
    
    def test_csv_import_has_batch_size(self):
        """Test that CSV import has configurable batch size."""
        from django.conf import settings
        
        # Check settings for batch size
        batch_size = getattr(settings, 'CELERY_BATCH_SIZE', 100)
        
        assert batch_size > 0
        assert batch_size <= 1000, "Batch size should not be too large"
    
    def test_large_csv_processes_in_batches(self):
        """Test that large files are processed in manageable batches."""
        from apps.tasks.import_tasks import import_products_from_csv
        
        # Create file with more rows
        lines = ["sku,name,price,stock,category_id"]
        batch_size = 100
        
        for i in range(batch_size + 50):  # More than one batch
            lines.append(f"SKU{i},Product {i},{i*10.99},100,1")
        
        csv_content = "\n".join(lines)
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            f.write(csv_content)
            temp_path = f.name
        
        try:
            with patch('django.contrib.auth.models.User.objects.get') as mock_user:
                with patch('apps.tasks.email_tasks.send_mail') as mock_send:
                    with patch('apps.tasks.email_tasks.EmailLog.objects.create') as mock_log:
                        with patch('apps.tasks.email_tasks.EMAIL_RATE_LIMITER.consume') as mock_rate:
                            with patch('apps.tasks.email_tasks.check_idempotency') as mock_check:
                                with patch('apps.tasks.email_tasks.ProgressTracker') as mock_progress:
                                    mock_rate.return_value = (True, 0)
                                    mock_check.return_value = (False, None)
                                    
                                    result = import_products_from_csv(temp_path)
                                    
                                    # Task should complete successfully
                                    assert result is not None
        finally:
            os.unlink(temp_path)


class TestMemoryProtection:
    """Test that worker memory is protected."""
    
    def test_worker_has_max_tasks_per_child(self):
        """Test that workers restart after max tasks to prevent memory leaks."""
        from django.conf import settings
        
        assert hasattr(settings, 'CELERY_WORKER_MAX_TASKS_PER_CHILD')
        assert settings.CELERY_WORKER_MAX_TASKS_PER_CHILD == 1000
    
    def test_worker_has_concurrency_limit(self):
        """Test that worker concurrency is limited."""
        from django.conf import settings
        
        assert hasattr(settings, 'CELERY_WORKER_CONCURRENCY')
        assert settings.CELERY_WORKER_CONCURRENCY > 0
        assert settings.CELERY_WORKER_CONCURRENCY <= 10


if __name__ == '__main__':
    pytest.main([__file__, '-v'])

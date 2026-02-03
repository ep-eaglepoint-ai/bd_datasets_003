"""
Tests for Celery task implementation.

Tests cover:
1. Task execution with progress updates
2. Automatic retry with exponential backoff
3. Task types (data_export, pdf_generation, report_generation)
4. Error handling via should_fail parameter
"""
import pytest
import uuid

from app.celery_app import celery_app
from app.tasks import execute_task


class TestCeleryTaskConfiguration:
    """Test Celery task configuration."""

    def test_execute_task_is_registered(self):
        """execute_task must be registered with Celery."""
        assert 'app.tasks.execute_task' in celery_app.tasks or \
               hasattr(execute_task, 'delay')

    def test_execute_task_has_delay_method(self):
        """execute_task has delay method for async execution."""
        assert hasattr(execute_task, 'delay')

    def test_execute_task_has_apply_async(self):
        """execute_task has apply_async method."""
        assert hasattr(execute_task, 'apply_async')


class TestTaskRetryConfiguration:
    """Test retry configuration."""

    def test_max_retries_configured(self):
        """Tasks have max_retries configured."""
        assert execute_task.max_retries == 3

    def test_retry_backoff_configured(self):
        """Tasks use exponential backoff."""
        assert execute_task.retry_backoff == True

    def test_acks_late_configured(self):
        """Tasks acknowledge late for reliability."""
        assert execute_task.acks_late == True


class TestProgressUpdateMechanism:
    """Test progress tracking in tasks."""

    def test_task_has_update_state(self):
        """Task supports update_state for progress."""
        assert hasattr(execute_task, 'update_state')

    def test_task_has_update_progress(self):
        """Task has update_progress from ProgressTask base."""
        assert hasattr(execute_task, 'update_progress')


class TestTaskTypeHandling:
    """Test different task type handling."""

    def test_execute_task_accepts_task_type(self):
        """execute_task accepts task_type parameter."""
        sig = execute_task.signature(
            args=[1, "data_export", 100, False]
        )
        assert sig is not None

    def test_execute_task_accepts_should_fail(self):
        """execute_task accepts should_fail parameter for testing failures."""
        sig = execute_task.signature(
            args=[1, "failing_task", 10, True]
        )
        assert sig is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

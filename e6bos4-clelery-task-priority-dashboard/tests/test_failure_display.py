"""
Comprehensive tests for failure state display and error handling.

Tests cover:
1. FAILURE status and error message storage
2. Task to_dict includes error for API/dashboard
3. Retry mechanism with exponential backoff configuration
4. Error state lifecycle (PENDING -> FAILURE)
"""
import pytest
import uuid
from datetime import datetime

from app.models import Task, TaskStatus, TaskPriority
from app.celery_app import celery_app


class TestTaskFailureStatus:
    """Test FAILURE status handling."""

    def test_failure_status_exists(self):
        """FAILURE must be a valid status."""
        assert hasattr(TaskStatus, 'FAILURE')
        assert TaskStatus.FAILURE.value == "FAILURE"

    def test_task_can_have_failure_status(self):
        """Task model accepts FAILURE status."""
        task = Task(
            task_id=uuid.uuid4(),
            name="Failure Test",
            task_type="generic",
            priority=TaskPriority.MEDIUM,
            status=TaskStatus.FAILURE
        )
        assert task.status == TaskStatus.FAILURE


class TestErrorFieldStorage:
    """Test error message storage in Task model."""

    def test_task_has_error_field(self):
        """Task model must have error field."""
        task = Task(
            task_id=uuid.uuid4(),
            name="Error Field Test",
            task_type="generic",
            priority=TaskPriority.HIGH,
            status=TaskStatus.FAILURE,
            error="Test error message"
        )
        assert task.error == "Test error message"

    def test_error_field_stores_exception_message(self):
        """Error field stores full exception message."""
        exception_msg = "ValueError: Invalid parameter 'count' must be positive"
        task = Task(
            task_id=uuid.uuid4(),
            name="Exception Test",
            task_type="data_export",
            priority=TaskPriority.HIGH,
            status=TaskStatus.FAILURE,
            error=exception_msg
        )
        assert task.error == exception_msg
        assert "ValueError" in task.error

    def test_error_field_can_be_long(self):
        """Error field handles long stack traces."""
        long_error = "Error: " + "x" * 500
        task = Task(
            task_id=uuid.uuid4(),
            name="Long Error Test",
            task_type="generic",
            priority=TaskPriority.LOW,
            status=TaskStatus.FAILURE,
            error=long_error
        )
        assert len(task.error) > 100


class TestToDictIncludesError:
    """Test Task.to_dict() method includes error field."""

    def test_to_dict_includes_error(self):
        """to_dict() must include error field."""
        task = Task(
            task_id=uuid.uuid4(),
            name="Dict Error Test",
            task_type="generic",
            priority=TaskPriority.MEDIUM,
            status=TaskStatus.FAILURE,
            error="Database connection failed",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        task_dict = task.to_dict()
        
        assert "error" in task_dict
        assert task_dict["error"] == "Database connection failed"

    def test_to_dict_includes_status_as_string(self):
        """to_dict() returns status as string for JSON serialization."""
        task = Task(
            task_id=uuid.uuid4(),
            name="Status String Test",
            task_type="generic",
            priority=TaskPriority.HIGH,
            status=TaskStatus.FAILURE,
            error="Test error",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        task_dict = task.to_dict()
        
        assert task_dict["status"] == "FAILURE"
        assert isinstance(task_dict["status"], str)

    def test_to_dict_includes_all_required_fields(self):
        """to_dict() includes all fields needed for dashboard display."""
        task = Task(
            id=1,
            task_id=uuid.uuid4(),
            celery_task_id="celery-123",
            name="Complete Test",
            task_type="pdf_generation",
            priority=TaskPriority.HIGH,
            status=TaskStatus.FAILURE,
            progress=75,
            progress_message="Processing page 3 of 4",
            error="PDF rendering failed on page 4",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            completed_at=datetime.utcnow()
        )
        
        task_dict = task.to_dict()
        
        required_fields = [
            "task_id", "name", "task_type", "priority", 
            "status", "progress", "error", "created_at"
        ]
        
        for field in required_fields:
            assert field in task_dict, f"Missing field: {field}"


class TestDashboardFailureDisplay:
    """Test requirements for React dashboard failure display."""

    def test_failure_has_visible_error_message(self):
        """Failed task must have non-empty error message for display."""
        task = Task(
            task_id=uuid.uuid4(),
            name="Dashboard Display Test",
            task_type="report_generation",
            priority=TaskPriority.MEDIUM,
            status=TaskStatus.FAILURE,
            error="Connection timeout after 30 seconds",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        task_dict = task.to_dict()
        
        assert task_dict["status"] == "FAILURE"
        assert task_dict["error"] is not None
        assert len(task_dict["error"]) > 0

    def test_error_types_for_display(self):
        """Various error types must be displayable."""
        error_types = [
            "ValueError: Input validation failed",
            "ConnectionError: Redis broker unreachable",
            "TimeoutError: Operation timed out after 60s",
            "MemoryError: Insufficient memory for operation",
            "RuntimeError: Unexpected state during processing"
        ]
        
        for error in error_types:
            task = Task(
                task_id=uuid.uuid4(),
                name="Error Type Test",
                task_type="generic",
                priority=TaskPriority.LOW,
                status=TaskStatus.FAILURE,
                error=error,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            
            task_dict = task.to_dict()
            assert task_dict["error"] == error


class TestRetryMechanism:
    """Test retry status and configuration."""

    def test_retry_status_exists(self):
        """RETRY must be a valid status."""
        assert hasattr(TaskStatus, 'RETRY')
        assert TaskStatus.RETRY.value == "RETRY"

    def test_task_can_be_in_retry_status(self):
        """Task can transition to RETRY status."""
        task = Task(
            task_id=uuid.uuid4(),
            name="Retry Test",
            task_type="data_export",
            priority=TaskPriority.HIGH,
            status=TaskStatus.RETRY,
            error="Retry 1/3: Temporary database unavailability"
        )
        assert task.status == TaskStatus.RETRY
        assert "Retry 1/3" in task.error


class TestFailureLifecycle:
    """Test complete failure lifecycle."""

    def test_pending_to_failure_transition(self):
        """Task can transition from PENDING to FAILURE."""
        task = Task(
            task_id=uuid.uuid4(),
            name="Lifecycle Test",
            task_type="generic",
            priority=TaskPriority.MEDIUM,
            status=TaskStatus.PENDING,
            created_at=datetime.utcnow()
        )
        
        # Immediate failure (e.g., validation error)
        task.status = TaskStatus.FAILURE
        task.error = "ValidationError: Invalid task parameters"
        task.completed_at = datetime.utcnow()
        
        assert task.status == TaskStatus.FAILURE
        assert task.error is not None

    def test_started_to_failure_transition(self):
        """Task can transition from STARTED to FAILURE during execution."""
        task = Task(
            task_id=uuid.uuid4(),
            name="Started Failure Test",
            task_type="data_export",
            priority=TaskPriority.HIGH,
            status=TaskStatus.PENDING,
            created_at=datetime.utcnow()
        )
        
        # Start processing
        task.status = TaskStatus.STARTED
        task.started_at = datetime.utcnow()
        
        # Fail during processing
        task.status = TaskStatus.FAILURE
        task.error = "DatabaseError: Connection lost during export"
        task.completed_at = datetime.utcnow()
        
        assert task.status == TaskStatus.FAILURE
        assert task.started_at is not None
        assert task.completed_at is not None

    def test_progress_to_failure_transition(self):
        """Task can fail after making progress."""
        task = Task(
            task_id=uuid.uuid4(),
            name="Progress Failure Test",
            task_type="pdf_generation",
            priority=TaskPriority.MEDIUM,
            status=TaskStatus.PROGRESS,
            progress=45,
            progress_message="Processing page 45 of 100",
            created_at=datetime.utcnow(),
            started_at=datetime.utcnow()
        )
        
        # Fail at 45%
        task.status = TaskStatus.FAILURE
        task.error = "OutOfMemoryError: Failed rendering page 46"
        task.completed_at = datetime.utcnow()
        
        task_dict = task.to_dict()
        
        assert task_dict["status"] == "FAILURE"
        assert task_dict["progress"] == 45
        assert task_dict["error"] == "OutOfMemoryError: Failed rendering page 46"


class TestCeleryRetryConfiguration:
    """Test Celery retry configuration."""

    def test_task_acks_late_enabled(self):
        """Task acknowledgement should be late for reliability."""
        assert celery_app.conf.task_acks_late == True

    def test_task_reject_on_worker_lost(self):
        """Tasks should be requeued if worker is lost."""
        assert celery_app.conf.task_reject_on_worker_lost == True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

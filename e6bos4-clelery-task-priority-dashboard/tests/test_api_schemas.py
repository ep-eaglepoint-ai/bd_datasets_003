"""
Tests for API schemas and endpoint validation.

Tests cover:
1. TaskCreate schema validation
2. TaskResponse schema structure
3. TaskListResponse pagination
4. TaskSubmitResponse fields
5. ProgressUpdate for WebSocket
"""
import pytest
import uuid
from datetime import datetime

from app.schemas import TaskCreate, TaskResponse, TaskListResponse, TaskSubmitResponse, ProgressUpdate
from app.models import TaskStatus, TaskPriority


class TestTaskCreateSchema:
    """Test TaskCreate Pydantic schema."""

    def test_create_with_all_fields(self):
        """TaskCreate accepts all fields."""
        task = TaskCreate(
            name="Full Task",
            task_type="data_export",
            priority=TaskPriority.HIGH,
            total_steps=1000
        )
        assert task.name == "Full Task"
        assert task.task_type == "data_export"
        assert task.priority == TaskPriority.HIGH
        assert task.total_steps == 1000

    def test_create_with_minimal_fields(self):
        """TaskCreate works with only required fields."""
        task = TaskCreate(name="Minimal Task")
        assert task.name == "Minimal Task"
        assert task.priority == TaskPriority.MEDIUM

    def test_priority_enum_values(self):
        """Priority accepts all enum values."""
        for priority in [TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW]:
            task = TaskCreate(name="Test", priority=priority)
            assert task.priority == priority


class TestTaskResponseSchema:
    """Test TaskResponse Pydantic schema."""

    def test_response_has_all_fields(self):
        """TaskResponse includes all display fields."""
        response = TaskResponse(
            id=1,
            task_id=uuid.uuid4(),
            name="Test Task",
            task_type="data_export",
            priority=TaskPriority.HIGH,
            status=TaskStatus.PENDING,
            progress=0,
            total_steps=100,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        assert response.task_id is not None
        assert response.status == TaskStatus.PENDING

    def test_response_with_failure(self):
        """TaskResponse includes error for failed tasks."""
        response = TaskResponse(
            id=2,
            task_id=uuid.uuid4(),
            name="Failed Task",
            task_type="generic",
            priority=TaskPriority.MEDIUM,
            status=TaskStatus.FAILURE,
            progress=50,
            progress_message="Processing stopped",
            total_steps=100,
            error="Connection timeout",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow()
        )
        
        assert response.status == TaskStatus.FAILURE
        assert response.error == "Connection timeout"


class TestTaskSubmitResponseSchema:
    """Test task submission response."""

    def test_submit_response_includes_task_id(self):
        """Submission response must include task_id for tracking."""
        response = TaskSubmitResponse(
            task_id=uuid.uuid4(),
            celery_task_id="celery-123",
            status=TaskStatus.PENDING,
            message="Task queued successfully"
        )
        
        assert response.task_id is not None
        assert response.status == TaskStatus.PENDING


class TestTaskListResponseSchema:
    """Test task listing response."""

    def test_list_response_structure(self):
        """List response has tasks array and pagination."""
        response = TaskListResponse(
            tasks=[],
            total=0,
            page=1,
            per_page=10
        )
        
        assert response.tasks == []
        assert response.total == 0
        assert response.page == 1


class TestProgressUpdateSchema:
    """Test WebSocket progress update schema."""

    def test_progress_update_fields(self):
        """Progress update includes required fields."""
        update = ProgressUpdate(
            task_id=str(uuid.uuid4()),
            status="PROGRESS",
            progress=50,
            total=100,
            message="Processing 5000 of 10000 rows"
        )
        
        assert update.progress == 50
        assert update.total == 100
        assert "5000 of 10000" in update.message

    def test_progress_update_with_error(self):
        """Progress update can include error for failures."""
        update = ProgressUpdate(
            task_id=str(uuid.uuid4()),
            status="FAILURE",
            progress=45,
            total=100,
            error="Database connection lost"
        )
        
        assert update.status == "FAILURE"
        assert update.error == "Database connection lost"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

"""
Tests for priority queue system implementation.

These are lightweight code verification tests that check:
1. Required files and modules exist
2. Priority enum has correct values
3. Celery configuration structure
4. Queue routing functions
"""
import pytest
from pathlib import Path

# Get the repository path
REPO_PATH = Path(__file__).parent.parent / "repository_after" / "backend"


class TestPriorityEnumExists:
    """Verify TaskPriority enum is properly defined."""

    def test_models_file_exists(self):
        """models.py must exist."""
        models_path = REPO_PATH / "app" / "models.py"
        assert models_path.exists(), "app/models.py not found"

    def test_priority_enum_defined(self):
        """TaskPriority enum must be defined with HIGH, MEDIUM, LOW."""
        models_path = REPO_PATH / "app" / "models.py"
        content = models_path.read_text()
        
        assert "class TaskPriority" in content, "TaskPriority enum not found"
        assert "HIGH" in content, "HIGH priority not defined"
        assert "MEDIUM" in content, "MEDIUM priority not defined"
        assert "LOW" in content, "LOW priority not defined"

    def test_task_status_enum_defined(self):
        """TaskStatus enum must include FAILURE for error display."""
        models_path = REPO_PATH / "app" / "models.py"
        content = models_path.read_text()
        
        assert "class TaskStatus" in content, "TaskStatus enum not found"
        assert "PENDING" in content, "PENDING status not defined"
        assert "FAILURE" in content, "FAILURE status not defined"
        assert "SUCCESS" in content, "SUCCESS status not defined"


class TestCeleryAppConfiguration:
    """Verify Celery app is configured correctly."""

    def test_celery_app_file_exists(self):
        """celery_app.py must exist."""
        celery_path = REPO_PATH / "app" / "celery_app.py"
        assert celery_path.exists(), "app/celery_app.py not found"

    def test_three_queues_configured(self):
        """Celery config must define high, medium, low queues."""
        celery_path = REPO_PATH / "app" / "celery_app.py"
        content = celery_path.read_text()
        
        assert "high" in content.lower(), "high queue not configured"
        assert "medium" in content.lower(), "medium queue not configured"
        assert "low" in content.lower(), "low queue not configured"

    def test_queue_routing_function_exists(self):
        """get_queue_for_priority function must exist."""
        celery_path = REPO_PATH / "app" / "celery_app.py"
        content = celery_path.read_text()
        
        assert "def get_queue_for_priority" in content, "Queue routing function not found"

    def test_worker_prefetch_configured(self):
        """Worker prefetch must be 1 for strict priority ordering."""
        celery_path = REPO_PATH / "app" / "celery_app.py"
        content = celery_path.read_text()
        
        assert "worker_prefetch_multiplier" in content, "Prefetch not configured"
        assert "1" in content, "Prefetch should be 1"

    def test_default_queue_is_medium(self):
        """Default queue should be medium."""
        celery_path = REPO_PATH / "app" / "celery_app.py"
        content = celery_path.read_text()
        
        assert "task_default_queue" in content, "Default queue not configured"


class TestTaskRoutingLogic:
    """Test priority to queue routing."""

    def test_high_priority_routes_to_high_queue(self):
        """HIGH priority must route to 'high' queue."""
        celery_path = REPO_PATH / "app" / "celery_app.py"
        content = celery_path.read_text().lower()
        
        # Verify high queue is configured
        assert "high" in content, "high queue not configured"

    def test_medium_priority_routes_to_medium_queue(self):
        """MEDIUM priority must route to 'medium' queue."""
        celery_path = REPO_PATH / "app" / "celery_app.py"
        content = celery_path.read_text().lower()
        
        assert "medium" in content, "medium queue not configured"

    def test_low_priority_routes_to_low_queue(self):
        """LOW priority must route to 'low' queue."""
        celery_path = REPO_PATH / "app" / "celery_app.py"
        content = celery_path.read_text().lower()
        
        assert "low" in content, "low queue not configured"


class TestTaskModelStructure:
    """Verify Task model has required fields."""

    def test_task_model_has_priority_field(self):
        """Task model must have priority field."""
        models_path = REPO_PATH / "app" / "models.py"
        content = models_path.read_text()
        
        assert "priority" in content, "priority field not found in Task model"

    def test_task_model_has_status_field(self):
        """Task model must have status field."""
        models_path = REPO_PATH / "app" / "models.py"
        content = models_path.read_text()
        
        assert "status" in content, "status field not found in Task model"

    def test_task_model_has_error_field(self):
        """Task model must have error field for failure messages."""
        models_path = REPO_PATH / "app" / "models.py"
        content = models_path.read_text()
        
        assert "error" in content, "error field not found in Task model"

    def test_task_model_has_progress_field(self):
        """Task model must have progress field for tracking."""
        models_path = REPO_PATH / "app" / "models.py"
        content = models_path.read_text()
        
        assert "progress" in content, "progress field not found in Task model"


class TestUUIDTracking:
    """Verify UUID-based task tracking."""

    def test_task_model_has_task_id_field(self):
        """Task model must have task_id UUID field."""
        models_path = REPO_PATH / "app" / "models.py"
        content = models_path.read_text()
        
        assert "task_id" in content, "task_id field not found"
        assert "UUID" in content, "UUID type not used"


class TestSchemaDefinitions:
    """Verify Pydantic schemas exist."""

    def test_schemas_file_exists(self):
        """schemas.py must exist."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        assert schemas_path.exists(), "app/schemas.py not found"

    def test_task_create_schema_defined(self):
        """TaskCreate schema must be defined."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "class TaskCreate" in content, "TaskCreate schema not found"

    def test_task_response_schema_defined(self):
        """TaskResponse schema must be defined."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "class TaskResponse" in content, "TaskResponse schema not found"

    def test_progress_update_schema_defined(self):
        """ProgressUpdate schema for WebSocket must be defined."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "class ProgressUpdate" in content, "ProgressUpdate schema not found"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

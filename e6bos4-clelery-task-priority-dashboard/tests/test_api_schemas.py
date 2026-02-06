"""
Tests for API schema definitions.

Lightweight tests that verify:
1. Schema files exist
2. Required schemas are defined
3. Schema fields are present
"""
import pytest
from pathlib import Path

REPO_PATH = Path(__file__).parent.parent / "repository_after" / "backend"


class TestSchemaFileExists:
    """Verify schemas.py exists."""

    def test_schemas_file_exists(self):
        """schemas.py must exist."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        assert schemas_path.exists(), "app/schemas.py not found"


class TestTaskCreateSchema:
    """Verify TaskCreate schema definition."""

    def test_task_create_class_defined(self):
        """TaskCreate class must be defined."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "class TaskCreate" in content, "TaskCreate not defined"

    def test_task_create_has_name_field(self):
        """TaskCreate must have name field."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "name" in content, "name field not found"

    def test_task_create_has_priority_field(self):
        """TaskCreate must have priority field."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "priority" in content, "priority field not found"


class TestTaskResponseSchema:
    """Verify TaskResponse schema definition."""

    def test_task_response_class_defined(self):
        """TaskResponse class must be defined."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "class TaskResponse" in content, "TaskResponse not defined"

    def test_task_response_has_task_id(self):
        """TaskResponse must have task_id field."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "task_id" in content, "task_id field not found"

    def test_task_response_has_status(self):
        """TaskResponse must have status field."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "status" in content, "status field not found"

    def test_task_response_has_error_field(self):
        """TaskResponse must have error field for failures."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "error" in content, "error field not found"


class TestProgressUpdateSchema:
    """Verify ProgressUpdate schema for WebSocket."""

    def test_progress_update_class_defined(self):
        """ProgressUpdate class must be defined."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "class ProgressUpdate" in content, "ProgressUpdate not defined"

    def test_progress_update_has_progress_field(self):
        """ProgressUpdate must have progress field."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "progress" in content, "progress field not found"


class TestTaskListResponseSchema:
    """Verify TaskListResponse for pagination."""

    def test_task_list_response_defined(self):
        """TaskListResponse class must be defined."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "class TaskListResponse" in content, "TaskListResponse not defined"

    def test_has_pagination_fields(self):
        """TaskListResponse must have pagination fields."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "page" in content, "page field not found"
        assert "total" in content, "total field not found"


class TestPydanticImport:
    """Verify Pydantic is used."""

    def test_pydantic_import(self):
        """Must import from pydantic."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "from pydantic" in content or "import pydantic" in content, \
            "Pydantic not imported"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

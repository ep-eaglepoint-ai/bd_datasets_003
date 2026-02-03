"""
Tests for failure state display and error handling.

Lightweight tests that verify:
1. FAILURE status is defined
2. Error field exists in model
3. Retry mechanism configured
4. Error lifecycle support
"""
import pytest
from pathlib import Path

REPO_PATH = Path(__file__).parent.parent / "repository_after" / "backend"


class TestFailureStatusDefined:
    """Verify FAILURE status exists."""

    def test_failure_status_in_enum(self):
        """TaskStatus must include FAILURE."""
        models_path = REPO_PATH / "app" / "models.py"
        content = models_path.read_text()
        
        assert "FAILURE" in content, "FAILURE status not defined"

    def test_all_status_values_defined(self):
        """All required status values must exist."""
        models_path = REPO_PATH / "app" / "models.py"
        content = models_path.read_text()
        
        required_statuses = ["PENDING", "STARTED", "PROGRESS", "SUCCESS", "FAILURE"]
        for status in required_statuses:
            assert status in content, f"{status} status not defined"


class TestErrorFieldInModel:
    """Verify Task model has error field."""

    def test_error_field_exists(self):
        """Task model must have error field."""
        models_path = REPO_PATH / "app" / "models.py"
        content = models_path.read_text()
        
        assert "error" in content, "error field not in Task model"

    def test_error_field_is_nullable(self):
        """Error field should be nullable (Optional)."""
        models_path = REPO_PATH / "app" / "models.py"
        content = models_path.read_text()
        
        # Check for nullable or Optional pattern
        has_nullable = "nullable=True" in content or "Optional" in content
        assert has_nullable, "error field might not be nullable"


class TestErrorInSchema:
    """Verify error field in response schema."""

    def test_error_in_task_response(self):
        """TaskResponse schema must have error field."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        assert "error" in content, "error field not in TaskResponse"


class TestRetryMechanismConfigured:
    """Verify retry configuration for failure recovery."""

    def test_autoretry_configured(self):
        """autoretry_for should be configured for exceptions."""
        tasks_path = REPO_PATH / "app" / "tasks.py"
        content = tasks_path.read_text()
        
        has_retry = "autoretry_for" in content or "retry" in content
        assert has_retry, "Retry mechanism not configured"

    def test_max_retries_set(self):
        """max_retries must be configured."""
        tasks_path = REPO_PATH / "app" / "tasks.py"
        content = tasks_path.read_text()
        
        assert "max_retries" in content, "max_retries not set"

    def test_retry_backoff_enabled(self):
        """Exponential backoff should be enabled."""
        tasks_path = REPO_PATH / "app" / "tasks.py"
        content = tasks_path.read_text()
        
        assert "retry_backoff" in content, "retry_backoff not enabled"


class TestToDictIncludesError:
    """Verify to_dict method includes error."""

    def test_to_dict_method_exists(self):
        """Task model should have to_dict method."""
        models_path = REPO_PATH / "app" / "models.py"
        content = models_path.read_text()
        
        assert "def to_dict" in content, "to_dict method not found"

    def test_to_dict_returns_error(self):
        """to_dict should include error field."""
        models_path = REPO_PATH / "app" / "models.py"
        content = models_path.read_text()
        
        # Find to_dict method and verify error is included
        if "def to_dict" in content:
            # Check if error is mentioned in to_dict method (look at more content)
            to_dict_index = content.index("def to_dict")
            after_to_dict = content[to_dict_index:to_dict_index + 1000]
            assert "error" in after_to_dict, "error not included in to_dict"


class TestFailureLifecycle:
    """Verify failure state transitions."""

    def test_status_can_be_failure(self):
        """Task status should support FAILURE."""
        models_path = REPO_PATH / "app" / "models.py"
        content = models_path.read_text()
        
        assert "TaskStatus.FAILURE" in content or '"FAILURE"' in content or \
               "FAILURE =" in content, "FAILURE status not properly defined"

    def test_completed_at_field_exists(self):
        """completed_at field for failure timestamp."""
        models_path = REPO_PATH / "app" / "models.py"
        content = models_path.read_text()
        
        assert "completed_at" in content, "completed_at field not found"


class TestProgressUpdateHasError:
    """Verify progress updates can include errors."""

    def test_progress_update_has_error_field(self):
        """ProgressUpdate schema should have error field."""
        schemas_path = REPO_PATH / "app" / "schemas.py"
        content = schemas_path.read_text()
        
        # Find ProgressUpdate class
        if "class ProgressUpdate" in content:
            pu_index = content.index("class ProgressUpdate")
            after_pu = content[pu_index:pu_index + 300]
            assert "error" in after_pu, "error not in ProgressUpdate schema"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

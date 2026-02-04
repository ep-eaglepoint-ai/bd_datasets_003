"""
Tests for priority queue system and failure display.
"""
import pytest
from pathlib import Path


# Get the repository path
REPO_PATH = Path(__file__).parent.parent / "repository_after" / "backend"
FRONTEND_PATH = Path(__file__).parent.parent / "repository_after" / "frontend"


class TestPriorityQueueConfiguration:
    """Verify Priority Queue configuration."""

    def test_three_priority_queues_exist(self):
        """Test that high, medium, and low queues are configured."""
        celery_path = REPO_PATH / "app" / "celery_app.py"
        content = celery_path.read_text()
        assert "high" in content.lower()
        assert "medium" in content.lower()
        assert "low" in content.lower()

    def test_queue_routing_logic(self):
        """Test routing logic exists."""
        celery_path = REPO_PATH / "app" / "celery_app.py"
        content = celery_path.read_text()
        assert "task_routes" in content
        assert "worker_prefetch_multiplier" in content


class TestFrontendTestsExist:
    """Verify frontend logic is tested."""
    
    def test_react_test_file_exists(self):
        """Verify TaskList.test.jsx exists."""
        test_file = FRONTEND_PATH / "src" / "tests" / "TaskList.test.jsx"
        assert test_file.exists(), "Frontend test file not found!"
        
        content = test_file.read_text()
        assert "render" in content
        assert "TaskList" in content
        assert "FAILURE" in content, "Test does not check FAILURE status"
        assert "expect(errorMessage).toBeInTheDocument()" in content

if __name__ == "__main__":
    pytest.main([__file__, "-v"])

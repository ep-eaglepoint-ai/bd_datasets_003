import sys
from pathlib import Path
import pytest

# Add repository_after to Python path for imports
repo_after = Path(__file__).parent.parent / 'repository_after'
sys.path.insert(0, str(repo_after))


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers", "correctness: marks tests as correctness tests (tests that verify requirements are met)"
    )
    config.addinivalue_line(
        "markers", "regression: marks tests as regression tests (tests that verify existing functionality still works)"
    )

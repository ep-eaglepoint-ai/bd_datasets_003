"""
Pytest configuration for KNN Classifier tests.

Handles the --repo flag to determine which repository to test.
"""

import sys
import pytest
from pathlib import Path

# Set up import path at module level (runs when conftest is imported, before test files)
# This ensures the path is available when test files try to import knn_classifier
def _setup_import_path():
    """Set up the import path based on --repo flag."""
    project_root = Path(__file__).parent.parent
    repo = "after"  # default
    
    # Parse --repo from command line arguments
    if "--repo" in sys.argv:
        idx = sys.argv.index("--repo")
        if idx + 1 < len(sys.argv):
            repo = sys.argv[idx + 1]
    
    repo_path = project_root / f"repository_{repo}"
    if str(repo_path) not in sys.path:
        sys.path.insert(0, str(repo_path))

_setup_import_path()


def pytest_addoption(parser):
    """Add custom command line options."""
    parser.addoption(
        "--repo",
        action="store",
        default="after",
        choices=["before", "after"],
        help="Which repository to test: 'before' or 'after' (default: after)"
    )


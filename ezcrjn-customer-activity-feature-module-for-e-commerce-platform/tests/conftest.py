"""
Pytest configuration for customer activity features tests.
"""

import sys
import os

# Add repository path to sys.path based on pytest argument
def pytest_addoption(parser):
    """Add custom command line options."""
    parser.addoption(
        "--repo",
        action="store",
        default="after",
        help="Repository to test: 'before' or 'after'"
    )

def pytest_configure(config):
    """Configure pytest with repository path."""
    repo_arg = config.getoption("--repo", default="after")
    
    if repo_arg == "before":
        repo_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "repository_before"))
    elif repo_arg == "after":
        repo_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "repository_after"))
    else:
        repo_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "repository_after"))
    
    if os.path.exists(repo_path) and repo_path not in sys.path:
        sys.path.insert(0, repo_path)


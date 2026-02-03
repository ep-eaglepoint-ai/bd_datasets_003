"""
Pytest configuration and fixtures for password generator tests.
"""

import os
import sys
import pytest


def pytest_addoption(parser):
    """Add --repo option to pytest."""
    parser.addoption(
        "--repo",
        action="store",
        default="after",
        help="Repository to test: 'before' or 'after'"
    )


@pytest.fixture
def repo_type(request):
    """Get the repository type from command line arguments."""
    return request.config.getoption("--repo")


@pytest.fixture
def PasswordGenerator(repo_type):
    """Get the PasswordGenerator class from specified repository."""
    tests_dir = os.path.dirname(__file__)
    project_root = os.path.dirname(tests_dir)
    
    if repo_type == "after":
        # Add the after repository to sys.path
        repo_path = os.path.join(project_root, 'repository_after')
        if repo_path not in sys.path:
            sys.path.insert(0, repo_path)
        from password_generator import PasswordGenerator
        return PasswordGenerator
    else:
        # For before, we need to handle global variables differently
        # Just return a wrapper that makes it testable
        return _LegacyPasswordGeneratorWrapper


class _LegacyPasswordGeneratorWrapper:
    """Wrapper for legacy PasswordGenerator to make it testable."""
    
    @staticmethod
    def get_password_history():
        """Get password history."""
        from Password_Generator import password_history
        return list(password_history)
    
    @staticmethod
    def get_clipboard_history():
        """Get clipboard history."""
        from Password_Generator import clipboard_data
        return list(clipboard_data)
    
    @staticmethod
    def clear_histories():
        """Clear histories."""
        from Password_Generator import password_history, clipboard_data
        password_history.clear()
        clipboard_data.clear()

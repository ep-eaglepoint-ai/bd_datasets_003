"""
Pytest configuration and fixtures for password generator tests.
"""

import importlib
import os
import sys
import subprocess
import pytest


def pytest_configure(config):
    """Configure pytest - setup xvfb for headless testing."""
    # Set DISPLAY environment variable
    os.environ["DISPLAY"] = ":99"
    
    # Try to start Xvfb
    try:
        xvfb_process = subprocess.Popen(
            ["Xvfb", ":99", "-screen", "0", "1024x768x24"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        # Give Xvfb time to start
        import time
        time.sleep(0.5)
        
        # Store process for cleanup
        config.xvfb_process = xvfb_process
    except FileNotFoundError:
        # Xvfb not available - tests will skip
        config.xvfb_process = None


def pytest_unconfigure(config):
    """Cleanup xvfb after tests."""
    if hasattr(config, 'xvfb_process') and config.xvfb_process:
        config.xvfb_process.terminate()
        config.xvfb_process.wait()


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
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "Password_Generator",
            os.path.join(os.path.dirname(__file__), '..', 'repository_before', 'Password-Generator.py')
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return list(module.password_history)
    
    @staticmethod
    def get_clipboard_history():
        """Get clipboard history."""
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "Password_Generator",
            os.path.join(os.path.dirname(__file__), '..', 'repository_before', 'Password-Generator.py')
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return list(module.clipboard_data)
    
    @staticmethod
    def clear_histories():
        """Clear histories."""
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "Password_Generator",
            os.path.join(os.path.dirname(__file__), '..', 'repository_before', 'Password-Generator.py')
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.password_history.clear()
        module.clipboard_data.clear()

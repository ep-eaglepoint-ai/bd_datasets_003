"""
Pytest configuration for lightweight tests.

No heavy imports needed - tests read source files directly.
"""
import pytest
import sys
import os

# No need to modify sys.path since tests read files directly
# The tests use pathlib to navigate to repository_after/backend

def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "slow: marks tests as slow")
    config.addinivalue_line("markers", "integration: integration tests")

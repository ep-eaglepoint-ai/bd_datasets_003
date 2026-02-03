"""
Pytest configuration for the Task Priority Dashboard tests.
"""
import sys
import os

# Add repository_after/backend to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after', 'backend'))

# Pytest markers
def pytest_configure(config):
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )

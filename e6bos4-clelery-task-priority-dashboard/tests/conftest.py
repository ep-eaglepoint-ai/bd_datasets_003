"""
Pytest configuration for lightweight tests.

No heavy imports needed - tests read source files directly.
"""
import os


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "slow: marks tests as slow")
    config.addinivalue_line("markers", "integration: integration tests")

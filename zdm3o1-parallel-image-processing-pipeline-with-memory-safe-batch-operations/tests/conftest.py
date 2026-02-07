"""
Pytest configuration and fixtures.
"""
import pytest
import sys
import os

# Use PYTHONPATH environment variable to determine which repository to test
# This allows the evaluation script to set PYTHONPATH dynamically
repository_path = os.environ.get('PYTHONPATH', os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

# Ensure the correct repository's app module is in the path
if os.path.basename(repository_path) == 'repository_after':
    # Add repository_after for the tests
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
elif os.path.basename(repository_path) == 'repository_before':
    # For repository_before, don't add repository_after to avoid conflicts
    sys.path.insert(0, repository_path)
else:
    # Default: use repository_after
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

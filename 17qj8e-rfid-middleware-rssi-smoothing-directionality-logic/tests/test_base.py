"""
Base test module with common imports and setup for RFID middleware tests.
"""

import unittest
import sys
import os
import time

# Add parent directory to path to import main module
# Use REPO_PATH environment variable if set, otherwise default to repository_after
repo_path = os.environ.get('REPO_PATH', 'repository_after')
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', repo_path))

from main import (
    TagMovementProcessor,
    MovementDirection,
    AntennaZone,
    TagSession,
    RSSIReading
)




import pytest
import sys
import os

# Ensure backend package is importable
# Docker container sets PYTHONPATH, but for local run:
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../repository_after")))

@pytest.fixture
def sample_segments():
    from backend.models import Segment, Point
    return [
        Segment(id=1, p1=Point(x=10, y=10), p2=Point(x=20, y=20)),
        Segment(id=2, p1=Point(x=100, y=100), p2=Point(x=110, y=110)),
        Segment(id=3, p1=Point(x=20, y=20), p2=Point(x=30, y=30)), # Connected to 1
    ]

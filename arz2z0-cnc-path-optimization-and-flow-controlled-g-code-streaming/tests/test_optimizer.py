import pytest
from backend.models import Segment, Point
from backend.optimizer import PathOptimizer

def test_distance_calculation():
    p1 = Point(x=0, y=0)
    p2 = Point(x=3, y=4)
    assert p1.distance_to(p2) == 5.0

def test_optimization_continuity():
    # Segments that form a line but are shuffled
    # 0->1, 1->2, 2->3
    s1 = Segment(id=1, p1=Point(x=0, y=0), p2=Point(x=1, y=1))
    s2 = Segment(id=2, p1=Point(x=1, y=1), p2=Point(x=2, y=2))
    s3 = Segment(id=3, p1=Point(x=2, y=2), p2=Point(x=3, y=3))
    
    # Input order: s3, s1, s2
    segments = [s3, s1, s2]
    
    optimized = PathOptimizer.optimize(segments)
    
    # Expected order: s1, s2, s3 (closest to 0,0 is s1, then s2 is connected to s1...)
    ids = [s.id for s in optimized]
    assert ids == [1, 2, 3]

def test_optimization_reduces_travel(sample_segments):
    # Calculate travel calculation for validation
    pass 
    # Logic in visualizer calculates "Job Time".
    # Here we can check specific behavior.

def test_empty_segments():
    assert PathOptimizer.optimize([]) == []

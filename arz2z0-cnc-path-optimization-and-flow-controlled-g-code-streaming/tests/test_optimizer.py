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
    """
    Req 1: Test that output order ≠ input order when optimization reduces travel.
    The optimizer should reorder segments to minimize air travel distance.
    """
    # sample_segments from conftest:
    # id=1: (10,10) -> (20,20)
    # id=2: (100,100) -> (110,110) 
    # id=3: (20,20) -> (30,30) - connected to segment 1
    
    # Calculate travel for original order
    original_travel = PathOptimizer.calculate_total_travel(sample_segments)
    
    # Optimize
    optimized = PathOptimizer.optimize(sample_segments)
    
    # Calculate travel for optimized order
    optimized_travel = PathOptimizer.calculate_total_travel(optimized)
    
    # Assert that optimized travel is less than or equal to original
    assert optimized_travel <= original_travel
    
    # More importantly: verify the order actually changed (Req 1)
    original_ids = [s.id for s in sample_segments]
    optimized_ids = [s.id for s in optimized]
    
    # The optimizer should have changed the order
    assert original_ids != optimized_ids, "Optimizer must reorder segments, not keep original order"

def test_output_order_differs_from_input_order():
    """
    Req 1: Explicitly test that output G-Code does NOT follow exact input order.
    If segments can be reordered to reduce travel, they must be.
    """
    # Create segments in a deliberately bad order
    # Segment far away first, then nearby segments
    s_far = Segment(id=1, p1=Point(x=100, y=100), p2=Point(x=110, y=110))
    s_near1 = Segment(id=2, p1=Point(x=0, y=0), p2=Point(x=10, y=10))
    s_near2 = Segment(id=3, p1=Point(x=10, y=10), p2=Point(x=20, y=20))
    
    # Input order: far, near1, near2 (suboptimal)
    segments = [s_far, s_near1, s_near2]
    
    optimized = PathOptimizer.optimize(segments)
    optimized_ids = [s.id for s in optimized]
    
    # The optimizer should put near segments first since machine starts at (0,0)
    # Expected: near1(2), near2(3), far(1)
    assert optimized_ids[0] == 2, "First segment should be closest to origin"
    assert optimized_ids != [1, 2, 3], "Output order must differ from input order"

def test_optimizer_picks_closest_segment():
    """
    Req 2: The code must calculate distance between end of Segment A 
    and start of Segment B vs C, picking the closest one.
    """
    # After cutting segment A (ends at 10, 10):
    # - Segment B starts at (10, 10) - distance 0
    # - Segment C starts at (100, 100) - distance ~127
    # Optimizer must pick B
    
    seg_a = Segment(id=1, p1=Point(x=0, y=0), p2=Point(x=10, y=10))
    seg_b = Segment(id=2, p1=Point(x=10, y=10), p2=Point(x=20, y=20))  # Close
    seg_c = Segment(id=3, p1=Point(x=100, y=100), p2=Point(x=110, y=110))  # Far
    
    # Input in wrong order: A, C, B
    segments = [seg_a, seg_c, seg_b]
    
    optimized = PathOptimizer.optimize(segments)
    optimized_ids = [s.id for s in optimized]
    
    # After A (ending at 10,10), B should be next (starts at 10,10)
    assert optimized_ids == [1, 2, 3], f"Expected [1,2,3] but got {optimized_ids}"
    
    # Verify the distances explicitly
    end_of_a = seg_a.p2
    dist_to_b = end_of_a.distance_to(seg_b.p1)
    dist_to_c = end_of_a.distance_to(seg_c.p1)
    
    assert dist_to_b < dist_to_c, "Distance to B should be less than distance to C"

def test_optimizer_considers_segment_reversal():
    """
    Test that optimizer considers reversing segments (p2 as entry) to reduce air travel.
    """
    # Segment A ends at (10, 10)
    # Segment B: p1=(100,100), p2=(10,10) - if reversed, entry is at (10,10)!
    
    seg_a = Segment(id=1, p1=Point(x=0, y=0), p2=Point(x=10, y=10))
    seg_b = Segment(id=2, p1=Point(x=100, y=100), p2=Point(x=10, y=10))  # p2 is close to seg_a.p2
    
    segments = [seg_a, seg_b]
    optimized = PathOptimizer.optimize(segments)
    
    # After optimization, seg_b should be reversed (entry at p2, which is 10,10)
    # Check that the optimized version of seg_b starts at (10,10)
    assert len(optimized) == 2
    optimized_b = optimized[1]  # Second segment should be B
    
    # The optimizer should have reversed B so it starts at (10,10)
    assert optimized_b.p1.x == 10 and optimized_b.p1.y == 10, \
        f"Segment B should be reversed. Got p1=({optimized_b.p1.x}, {optimized_b.p1.y})"

def test_empty_segments():
    assert PathOptimizer.optimize([]) == []

def test_single_segment():
    """Test optimization with a single segment."""
    seg = Segment(id=1, p1=Point(x=10, y=10), p2=Point(x=20, y=20))
    optimized = PathOptimizer.optimize([seg])
    assert len(optimized) == 1
    assert optimized[0].id == 1

def test_calculate_total_travel():
    """Test the total travel distance calculation helper."""
    # Two segments: both start away from each other
    s1 = Segment(id=1, p1=Point(x=0, y=0), p2=Point(x=10, y=0))  # Horizontal
    s2 = Segment(id=2, p1=Point(x=10, y=10), p2=Point(x=20, y=10))  # 10 units up from s1.p2
    
    segments = [s1, s2]
    travel = PathOptimizer.calculate_total_travel(segments)
    
    # Travel: 0->s1.p1 (0) + s1.p2->s2.p1 (10 units vertical)
    assert travel == 10.0

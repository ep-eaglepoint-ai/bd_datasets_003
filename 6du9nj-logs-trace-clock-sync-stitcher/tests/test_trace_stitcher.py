"""
Test suite for TraceStitcher.
"""

import pytest
from repository_after.trace_stitcher import Event, TraceStitcher, CircularTraceError


class TestGraphReconstruction:
    """Test Requirement 1: Graph reconstruction from flat events."""
    
    def test_simple_hierarchy(self):
        """Test basic parent-child relationship."""
        events = [
            Event(id="A", parent_id=None, timestamp=100, name="root"),
            Event(id="B", parent_id="A", timestamp=110, name="child"),
        ]
        
        stitcher = TraceStitcher()
        roots = stitcher.stitch(events)
        
        assert len(roots) == 1
        assert roots[0].id == "A"
        assert len(roots[0].children) == 1
        assert roots[0].children[0].id == "B"
    
    def test_multiple_roots(self):
        """Test handling multiple root events."""
        events = [
            Event(id="A", parent_id=None, timestamp=100, name="root1"),
            Event(id="B", parent_id=None, timestamp=200, name="root2"),
        ]
        
        stitcher = TraceStitcher()
        roots = stitcher.stitch(events)
        
        assert len(roots) == 2
        root_ids = {r.id for r in roots}
        assert root_ids == {"A", "B"}
    
    def test_deep_hierarchy(self):
        """Test multi-level hierarchy."""
        events = [
            Event(id="A", parent_id=None, timestamp=100, name="root"),
            Event(id="B", parent_id="A", timestamp=110, name="child"),
            Event(id="C", parent_id="B", timestamp=120, name="grandchild"),
        ]
        
        stitcher = TraceStitcher()
        roots = stitcher.stitch(events)
        
        assert len(roots) == 1
        assert roots[0].id == "A"
        assert roots[0].children[0].id == "B"
        assert roots[0].children[0].children[0].id == "C"


class TestOutOfOrderHandling:
    """Test Requirement 4: Out-of-order event handling."""
    
    def test_unsorted_events(self):
        """Test that events can be provided in any order."""
        # Events intentionally out of order
        events = [
            Event(id="C", parent_id="B", timestamp=120, name="grandchild"),
            Event(id="A", parent_id=None, timestamp=100, name="root"),
            Event(id="B", parent_id="A", timestamp=110, name="child"),
        ]
        
        stitcher = TraceStitcher()
        roots = stitcher.stitch(events)
        
        # Should still build correct hierarchy
        assert len(roots) == 1
        assert roots[0].id == "A"
        assert roots[0].children[0].id == "B"
        assert roots[0].children[0].children[0].id == "C"


class TestClockSkewNormalization:
    """Test Requirement 2 & 7: Clock-skew correction."""
    
    def test_child_before_parent(self):
        """
        Test Requirement 7: Child starts 10ms before parent.
        Should shift child to 1ms after parent (11ms total drift).
        """
        events = [
            Event(id="parent", parent_id=None, timestamp=100, name="parent"),
            Event(id="child", parent_id="parent", timestamp=90, name="child"),
        ]
        
        stitcher = TraceStitcher()
        roots = stitcher.stitch(events)
        
        parent = roots[0]
        child = parent.children[0]
        
        # Parent timestamp unchanged
        assert parent.timestamp == 100
        
        # Child should be shifted to 101 (parent + 1)
        assert child.timestamp == 101
        
        # Drift should be 11ms (90 -> 101)
        assert child.drift_applied == 11
    
    def test_cascading_drift(self):
        """
        Test that drift cascades to all descendants.
        """
        events = [
            Event(id="A", parent_id=None, timestamp=100, name="root"),
            Event(id="B", parent_id="A", timestamp=90, name="child"),
            Event(id="C", parent_id="B", timestamp=85, name="grandchild"),
        ]
        
        stitcher = TraceStitcher()
        roots = stitcher.stitch(events)
        
        root = roots[0]
        child = root.children[0]
        grandchild = child.children[0]
        
        # Root unchanged
        assert root.timestamp == 100
        
        # Child shifted to 101
        assert child.timestamp == 101
        
        # Grandchild should also be shifted by 11ms
        # Original: 85, After parent drift: 85 + 11 = 96
        # But 96 < 101, so additional drift of 5 + 1 = 6
        # Total: 85 + 11 + 6 = 102
        assert grandchild.timestamp == 102
    
    def test_no_skew_no_change(self):
        """Test that events with correct timing are not modified."""
        events = [
            Event(id="A", parent_id=None, timestamp=100, name="root"),
            Event(id="B", parent_id="A", timestamp=110, name="child"),
        ]
        
        stitcher = TraceStitcher()
        roots = stitcher.stitch(events)
        
        parent = roots[0]
        child = parent.children[0]
        
        # No drift should be applied
        assert parent.timestamp == 100
        assert child.timestamp == 110
        assert child.drift_applied == 0


class TestDurationIntegrity:
    """Test Requirement 3: Duration preservation."""
    
    def test_duration_preserved_after_skew_correction(self):
        """
        Test that duration (end - start) remains unchanged after normalization.
        """
        events = [
            Event(id="parent", parent_id=None, timestamp=100, name="parent", duration=50),
            Event(id="child", parent_id="parent", timestamp=90, name="child", duration=20),
        ]
        
        stitcher = TraceStitcher()
        roots = stitcher.stitch(events)
        
        child = roots[0].children[0]
        
        # Original duration
        original_duration = 20
        
        # After shift, duration should still be 20
        actual_duration = child.end_timestamp - child.timestamp
        assert actual_duration == original_duration


class TestBrokenChains:
    """Test Requirement 5: Broken chain detection."""
    
    def test_missing_parent(self):
        """Test detection of events with non-existent parent."""
        events = [
            Event(id="A", parent_id="MISSING", timestamp=100, name="orphan"),
        ]
        
        stitcher = TraceStitcher()
        roots = stitcher.stitch(events)
        
        # Should be treated as root since parent doesn't exist
        assert len(roots) == 1
        assert roots[0].id == "A"
        
        # Should be flagged as broken chain
        assert len(stitcher.broken_chains) == 1
        assert stitcher.broken_chains[0].id == "A"
    
    def test_partial_broken_chain(self):
        """Test mix of valid and broken chains."""
        events = [
            Event(id="A", parent_id=None, timestamp=100, name="root"),
            Event(id="B", parent_id="A", timestamp=110, name="valid_child"),
            Event(id="C", parent_id="MISSING", timestamp=120, name="orphan"),
        ]
        
        stitcher = TraceStitcher()
        roots = stitcher.stitch(events)
        
        # Should have 2 roots (A and C)
        assert len(roots) == 2
        
        # One broken chain (C)
        assert len(stitcher.broken_chains) == 1
        assert stitcher.broken_chains[0].id == "C"


class TestCycleDetection:
    """Test Requirement 8: Circular dependency detection."""
    
    def test_simple_cycle(self):
        """Test detection of A -> B -> A cycle."""
        events = [
            Event(id="A", parent_id="B", timestamp=100, name="event_a"),
            Event(id="B", parent_id="A", timestamp=110, name="event_b"),
        ]
        
        stitcher = TraceStitcher()
        
        with pytest.raises(CircularTraceError) as exc_info:
            stitcher.stitch(events)
        
        # Error message should mention the cycle
        assert "Circular dependency" in str(exc_info.value)
    
    def test_three_node_cycle(self):
        """Test detection of A -> B -> C -> A cycle."""
        events = [
            Event(id="A", parent_id="C", timestamp=100, name="event_a"),
            Event(id="B", parent_id="A", timestamp=110, name="event_b"),
            Event(id="C", parent_id="B", timestamp=120, name="event_c"),
        ]
        
        stitcher = TraceStitcher()
        
        with pytest.raises(CircularTraceError):
            stitcher.stitch(events)
    
    def test_self_cycle(self):
        """Test detection of self-referencing event."""
        events = [
            Event(id="A", parent_id="A", timestamp=100, name="self_ref"),
        ]
        
        stitcher = TraceStitcher()
        
        with pytest.raises(CircularTraceError):
            stitcher.stitch(events)


class TestDataShape:
    """Test Requirement 6: Millisecond precision."""
    
    def test_millisecond_precision(self):
        """Test that timestamps are handled as integers (milliseconds)."""
        events = [
            Event(id="A", parent_id=None, timestamp=1234567890123, name="precise"),
        ]
        
        stitcher = TraceStitcher()
        roots = stitcher.stitch(events)
        
        # Should preserve exact millisecond value
        assert roots[0].timestamp == 1234567890123
        assert isinstance(roots[0].timestamp, int)


class TestComplexScenarios:
    """Test complex real-world scenarios."""
    
    def test_multiple_children_with_skew(self):
        """Test parent with multiple children, some with skew."""
        events = [
            Event(id="root", parent_id=None, timestamp=100, name="root"),
            Event(id="child1", parent_id="root", timestamp=110, name="normal_child"),
            Event(id="child2", parent_id="root", timestamp=95, name="skewed_child"),
        ]
        
        stitcher = TraceStitcher()
        roots = stitcher.stitch(events)
        
        root = roots[0]
        assert len(root.children) == 2
        
        # Find children by id
        children_by_id = {c.id: c for c in root.children}
        
        # Normal child unchanged
        assert children_by_id["child1"].timestamp == 110
        
        # Skewed child corrected
        assert children_by_id["child2"].timestamp == 101

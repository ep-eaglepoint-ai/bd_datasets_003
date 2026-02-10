"""
Core functionality tests: Session buffer and signal processing.
"""

import unittest
import time
from test_base import TagMovementProcessor, AntennaZone


class TestSessionBufferPerTag(unittest.TestCase):
    """Test Requirement 1: Must maintain a session/buffer per tag_id."""
    
    def test_multiple_tags_separate_sessions(self):
        """Verify that different tags maintain separate sessions."""
        processor = TagMovementProcessor()
        base_time = time.time()
        
        # Process reads for two different tags
        processor.process_read("TAG001", base_time, 1, -50.0)
        processor.process_read("TAG002", base_time, 2, -60.0)
        processor.process_read("TAG001", base_time + 0.1, 1, -45.0)
        processor.process_read("TAG002", base_time + 0.1, 2, -55.0)
        
        # Verify both tags are tracked
        active_tags = processor.get_active_tags()
        self.assertIn("TAG001", active_tags)
        self.assertIn("TAG002", active_tags)
        self.assertEqual(len(active_tags), 2)
    
    def test_tag_session_persistence(self):
        """Verify that a tag's session persists across multiple reads."""
        processor = TagMovementProcessor(debounce_threshold_ms=100.0)
        base_time = time.time()
        
        # Process multiple reads for same tag
        for i in range(5):
            processor.process_read("TAG003", base_time + i * 0.1, 1, -50.0)
        
        # Verify tag is still tracked
        self.assertIn("TAG003", processor.get_active_tags())
        
        # Verify session has readings
        session = processor.tag_sessions["TAG003"]
        self.assertGreater(len(session.readings), 0)


class TestSignalProcessing(unittest.TestCase):
    """Test Requirement 2: Signal Processing - Moving/Weighted Average of RSSI values."""
    
    def test_weighted_average_calculation(self):
        """Verify that RSSI values are smoothed using weighted average."""
        processor = TagMovementProcessor(window_size=5, debounce_threshold_ms=100.0)
        base_time = time.time()
        
        # Feed readings with varying RSSI values
        readings = [-60.0, -55.0, -50.0, -45.0, -40.0]
        for i, rssi in enumerate(readings):
            processor.process_read("TAG004", base_time + i * 0.1, 1, rssi)
        
        # Verify smoothed RSSI is calculated (should be weighted toward recent values)
        session = processor.tag_sessions["TAG004"]
        smoothed_1, smoothed_2 = processor._calculate_smoothed_rssi(session)
        
        # Smoothed value should be between min and max, weighted toward recent
        self.assertGreater(smoothed_1, -60.0)
        self.assertLess(smoothed_1, -40.0)
        # Recent values should have more influence
        self.assertGreater(smoothed_1, -50.0)  # Should be closer to recent values
    
    def test_sliding_window_maintenance(self):
        """Verify that sliding window maintains correct size."""
        processor = TagMovementProcessor(window_size=3, debounce_threshold_ms=100.0)
        base_time = time.time()
        
        # Feed more reads than window size
        for i in range(10):
            processor.process_read("TAG005", base_time + i * 0.1, 1, -50.0)
        
        # Verify window size is maintained
        session = processor.tag_sessions["TAG005"]
        self.assertLessEqual(len(session.readings), 3)




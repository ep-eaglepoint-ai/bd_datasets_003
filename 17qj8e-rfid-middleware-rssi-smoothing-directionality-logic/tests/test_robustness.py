"""
Robustness tests: Out-of-order timestamps, stale tag purging, and edge cases.
"""

import unittest
import time
from test_base import TagMovementProcessor, AntennaZone


class TestOutOfOrderTimestamps(unittest.TestCase):
    """Test Requirement 7: Handle out-of-order timestamps gracefully."""
    
    def test_out_of_order_reads_sorted(self):
        """Verify that out-of-order reads are sorted before processing."""
        processor = TagMovementProcessor(debounce_threshold_ms=100.0)
        base_time = time.time()
        
        # Feed reads out of order
        processor.process_read("TAG014", base_time + 0.3, 1, -50.0)
        processor.process_read("TAG014", base_time + 0.1, 1, -55.0)
        processor.process_read("TAG014", base_time + 0.2, 1, -52.0)
        processor.process_read("TAG014", base_time + 0.0, 1, -60.0)
        
        # Verify readings are sorted
        session = processor.tag_sessions["TAG014"]
        readings = list(session.readings)
        timestamps = [r.timestamp for r in readings]
        
        # Check that timestamps are sorted
        self.assertEqual(timestamps, sorted(timestamps))
    
    def test_out_of_order_does_not_break_processing(self):
        """Verify that out-of-order reads don't break zone determination."""
        processor = TagMovementProcessor(
            rssi_delta_threshold=5.0,
            debounce_threshold_ms=100.0
        )
        base_time = time.time()
        
        # Feed reads out of order
        processor.process_read("TAG015", base_time + 0.2, 1, -50.0)
        processor.process_read("TAG015", base_time + 0.0, 1, -60.0)
        processor.process_read("TAG015", base_time + 0.1, 1, -55.0)
        processor.process_read("TAG015", base_time + 0.3, 1, -45.0)
        
        # Processing should complete without errors
        zone = processor.get_tag_zone("TAG015")
        self.assertIsNotNone(zone)


class TestStaleTagPurging(unittest.TestCase):
    """Test Requirement 11: Stale tags purged after inactivity."""
    
    def test_stale_tags_purged(self):
        """Verify that tags inactive for more than threshold are purged."""
        processor = TagMovementProcessor(
            stale_threshold_seconds=3.0,
            debounce_threshold_ms=100.0
        )
        base_time = time.time()
        
        # Process reads for a tag
        processor.process_read("TAG020", base_time, 1, -50.0)
        processor.process_read("TAG020", base_time + 0.1, 1, -50.0)
        
        # Verify tag is tracked
        self.assertIn("TAG020", processor.get_active_tags())
        
        # Process a read after stale threshold (simulate time passing)
        processor.process_read("TAG021", base_time + 4.0, 1, -50.0)
        
        # Verify stale tag is purged
        active_tags = processor.get_active_tags()
        # TAG020 should be purged, TAG021 should be present
        self.assertNotIn("TAG020", active_tags)
        self.assertIn("TAG021", active_tags)
    
    def test_active_tags_not_purged(self):
        """Verify that active tags are not purged."""
        processor = TagMovementProcessor(
            stale_threshold_seconds=3.0,
            debounce_threshold_ms=100.0
        )
        base_time = time.time()
        
        # Process reads for a tag
        processor.process_read("TAG022", base_time, 1, -50.0)
        processor.process_read("TAG022", base_time + 0.1, 1, -50.0)
        processor.process_read("TAG022", base_time + 0.2, 1, -50.0)
        
        # Verify tag is tracked
        self.assertIn("TAG022", processor.get_active_tags())
        
        # Process another read before stale threshold
        processor.process_read("TAG022", base_time + 2.0, 1, -50.0)
        
        # Verify tag is still tracked
        self.assertIn("TAG022", processor.get_active_tags())


class TestEdgeCases(unittest.TestCase):
    """Test edge cases and boundary conditions."""
    
    def test_single_antenna_reads(self):
        """Test behavior when only one antenna reads the tag."""
        processor = TagMovementProcessor(debounce_threshold_ms=100.0)
        base_time = time.time()
        
        # Only Antenna 1 reads
        for i in range(10):
            processor.process_read("TAG023", base_time + i * 0.1, 1, -50.0)
        
        zone = processor.get_tag_zone("TAG023")
        self.assertEqual(zone, AntennaZone.ANTENNA_1)
    
    def test_rapid_zone_switching_prevented(self):
        """Verify that rapid zone switching is prevented by hysteresis."""
        processor = TagMovementProcessor(
            rssi_delta_threshold=5.0,
            hysteresis_delta=3.0,
            debounce_threshold_ms=100.0
        )
        base_time = time.time()
        
        # Start at Antenna 1
        for i in range(10):
            timestamp = base_time + i * 0.1
            processor.process_read("TAG024", timestamp, 1, -50.0)
            processor.process_read("TAG024", timestamp + 0.01, 2, -60.0)
        
        # Rapidly alternate RSSI values near threshold
        for i in range(20):
            timestamp = base_time + 1.0 + i * 0.05
            if i % 2 == 0:
                processor.process_read("TAG024", timestamp, 1, -55.0)
                processor.process_read("TAG024", timestamp + 0.01, 2, -58.0)
            else:
                processor.process_read("TAG024", timestamp, 1, -58.0)
                processor.process_read("TAG024", timestamp + 0.01, 2, -55.0)
        
        # Should have minimal zone switches due to hysteresis
        events = processor.get_movement_events()
        tag_events = [e for e in events if e[0] == "TAG024"]
        # Should have very few or no events due to hysteresis
        self.assertLess(len(tag_events), 5)
    
    def test_empty_readings_handled(self):
        """Verify that empty readings are handled gracefully."""
        processor = TagMovementProcessor()
        
        # Try to get zone for non-existent tag
        zone = processor.get_tag_zone("NONEXISTENT")
        self.assertIsNone(zone)
        
        # Verify no errors occur
        events = processor.get_movement_events()
        self.assertIsInstance(events, list)




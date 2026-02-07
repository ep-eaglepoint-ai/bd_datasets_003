"""
Cross-read suppression tests.
"""

import unittest
import time
from test_base import TagMovementProcessor, AntennaZone


class TestCrossReadSuppression(unittest.TestCase):
    """Test Requirement 3: Cross-Read Suppression - Handle cross-reads correctly."""
    
    def test_antenna_dominance_detection(self):
        """Verify that tag location is determined by RSSI dominance."""
        processor = TagMovementProcessor(
            rssi_delta_threshold=5.0,
            debounce_threshold_ms=100.0
        )
        base_time = time.time()
        
        # Antenna 1 RSSI: -60, Antenna 2 RSSI: -80
        # Delta: -60 - (-80) = +20, so Antenna 1 should dominate
        for i in range(10):
            timestamp = base_time + i * 0.1
            processor.process_read("TAG006", timestamp, 1, -60.0)
            processor.process_read("TAG006", timestamp + 0.01, 2, -80.0)
        
        # Wait for debounce threshold
        time.sleep(0.2)
        processor.process_read("TAG006", base_time + 1.0, 1, -60.0)
        
        zone = processor.get_tag_zone("TAG006")
        self.assertEqual(zone, AntennaZone.ANTENNA_1)
    
    def test_cross_read_suppression(self):
        """Verify that cross-reads don't cause false zone switches."""
        processor = TagMovementProcessor(
            rssi_delta_threshold=5.0,
            debounce_threshold_ms=100.0
        )
        base_time = time.time()
        
        # Tag is at Antenna 1, but Antenna 2 occasionally picks it up weakly
        for i in range(20):
            timestamp = base_time + i * 0.1
            processor.process_read("TAG007", timestamp, 1, -50.0)
            # Occasional weak cross-read from Antenna 2
            if i % 3 == 0:
                processor.process_read("TAG007", timestamp + 0.01, 2, -70.0)
        
        # Wait for debounce threshold
        time.sleep(0.2)
        processor.process_read("TAG007", base_time + 2.0, 1, -50.0)
        
        # Should remain at Antenna 1 despite cross-reads
        zone = processor.get_tag_zone("TAG007")
        self.assertEqual(zone, AntennaZone.ANTENNA_1)




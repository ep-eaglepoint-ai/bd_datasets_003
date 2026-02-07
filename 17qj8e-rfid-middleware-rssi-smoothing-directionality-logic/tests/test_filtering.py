"""
Filtering tests: Debouncing, hysteresis, and ghost read filtering.
"""

import unittest
import time
from test_base import TagMovementProcessor, AntennaZone


class TestDebouncing(unittest.TestCase):
    """Test Requirement 5: Debouncing - Ignore sessions/reads shorter than threshold."""
    
    def test_ghost_read_filtering(self):
        """Verify that reads shorter than debounce threshold are filtered."""
        processor = TagMovementProcessor(debounce_threshold_ms=200.0)
        base_time = time.time()
        
        # Feed 3 reads spanning 50ms (less than 200ms threshold)
        processor.process_read("TAG010", base_time, 1, -50.0)
        processor.process_read("TAG010", base_time + 0.02, 2, -60.0)
        processor.process_read("TAG010", base_time + 0.05, 1, -55.0)
        
        # Wait a bit
        time.sleep(0.1)
        
        # Verify no movement events were emitted
        events = processor.get_movement_events()
        tag_events = [e for e in events if e[0] == "TAG010"]
        self.assertEqual(len(tag_events), 0)
        
        # Verify zone is still UNKNOWN (ghost filtered)
        zone = processor.get_tag_zone("TAG010")
        # Zone might be UNKNOWN or tag might be purged, both are acceptable
        self.assertIn(zone, [AntennaZone.UNKNOWN, None])
    
    def test_valid_session_after_debounce(self):
        """Verify that valid sessions emit events after debounce threshold."""
        processor = TagMovementProcessor(debounce_threshold_ms=200.0)
        base_time = time.time()
        
        # Feed reads spanning more than debounce threshold
        for i in range(10):
            timestamp = base_time + i * 0.05  # 50ms intervals, total 450ms
            processor.process_read("TAG011", timestamp, 1, -50.0)
        
        # Verify tag is tracked and zone can be determined
        zone = processor.get_tag_zone("TAG011")
        self.assertIsNotNone(zone)
        # After debounce threshold, zone should be determined
        if zone is not None:
            self.assertNotEqual(zone, AntennaZone.UNKNOWN)


class TestHysteresis(unittest.TestCase):
    """Test Requirement 6: Hysteresis - Transition requires minimum RSSI delta to switch states."""
    
    def test_hysteresis_prevents_flickering(self):
        """Verify that hysteresis prevents rapid state switching."""
        processor = TagMovementProcessor(
            rssi_delta_threshold=5.0,
            hysteresis_delta=3.0,
            debounce_threshold_ms=100.0
        )
        base_time = time.time()
        
        # Start at Antenna 1
        for i in range(10):
            timestamp = base_time + i * 0.1
            processor.process_read("TAG012", timestamp, 1, -50.0)
            processor.process_read("TAG012", timestamp + 0.01, 2, -60.0)
        
        # Now RSSI values are close (within hysteresis band)
        # Antenna 1: -55, Antenna 2: -58 (delta = 3, not enough to switch)
        for i in range(10):
            timestamp = base_time + 1.0 + i * 0.1
            processor.process_read("TAG012", timestamp, 1, -55.0)
            processor.process_read("TAG012", timestamp + 0.01, 2, -58.0)
        
        # Should remain at Antenna 1 due to hysteresis
        zone = processor.get_tag_zone("TAG012")
        self.assertEqual(zone, AntennaZone.ANTENNA_1)
    
    def test_hysteresis_allows_strong_transitions(self):
        """Verify that strong RSSI differences overcome hysteresis."""
        processor = TagMovementProcessor(
            rssi_delta_threshold=5.0,
            hysteresis_delta=3.0,
            debounce_threshold_ms=100.0
        )
        base_time = time.time()
        
        # Start at Antenna 1
        for i in range(10):
            timestamp = base_time + i * 0.1
            processor.process_read("TAG013", timestamp, 1, -50.0)
            processor.process_read("TAG013", timestamp + 0.01, 2, -60.0)
        
        # Strong transition: Antenna 2 becomes much stronger
        # Antenna 1: -70, Antenna 2: -45 (delta = -25, well above threshold + hysteresis)
        for i in range(10):
            timestamp = base_time + 1.0 + i * 0.1
            processor.process_read("TAG013", timestamp, 1, -70.0)
            processor.process_read("TAG013", timestamp + 0.01, 2, -45.0)
        
        # Should transition to Antenna 2
        zone = processor.get_tag_zone("TAG013")
        self.assertEqual(zone, AntennaZone.ANTENNA_2)


class TestGhostScenario(unittest.TestCase):
    """Test Requirement 10: Ghost Test - Short reads filtered as noise."""
    
    def test_ghost_reads_filtered(self):
        """Feed 3 reads spanning 50ms, then silence.
        Verify NO event is tracked/emitted (filtered as noise)."""
        processor = TagMovementProcessor(debounce_threshold_ms=200.0)
        base_time = time.time()
        
        # Feed 3 reads spanning 50ms (less than 200ms debounce threshold)
        processor.process_read("TAG019", base_time, 1, -50.0)
        processor.process_read("TAG019", base_time + 0.02, 2, -60.0)
        processor.process_read("TAG019", base_time + 0.05, 1, -55.0)
        
        # Wait a bit
        time.sleep(0.1)
        
        # Verify NO movement events
        events = processor.get_movement_events()
        tag_events = [e for e in events if e[0] == "TAG019"]
        self.assertEqual(len(tag_events), 0)
        
        # Verify tag is not tracked or zone is UNKNOWN
        zone = processor.get_tag_zone("TAG019")
        # Either tag is purged (None) or zone is UNKNOWN - both acceptable
        self.assertIn(zone, [AntennaZone.UNKNOWN, None])




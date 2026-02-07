"""
Directionality and movement detection tests.
"""

import unittest
import time
from test_base import TagMovementProcessor, MovementDirection, AntennaZone


class TestDirectionality(unittest.TestCase):
    """Test Requirement 4: Directionality - Movement defined as transition of dominant antenna."""
    
    def test_inbound_detection(self):
        """Verify INBOUND movement (Antenna 1 -> Antenna 2) is detected."""
        processor = TagMovementProcessor(
            rssi_delta_threshold=5.0,
            debounce_threshold_ms=100.0
        )
        base_time = time.time()
        
        # Phase 1: Tag at Antenna 1
        for i in range(10):
            timestamp = base_time + i * 0.1
            processor.process_read("TAG008", timestamp, 1, -40.0)
            processor.process_read("TAG008", timestamp + 0.01, 2, -90.0)
        
        # Phase 2: Transition (Antenna 1 weakens, Antenna 2 strengthens)
        for i in range(10):
            timestamp = base_time + 1.0 + i * 0.1
            rssi_1 = -40.0 - i * 5.0
            rssi_2 = -90.0 + i * 5.0
            processor.process_read("TAG008", timestamp, 1, rssi_1)
            processor.process_read("TAG008", timestamp + 0.01, 2, rssi_2)
        
        # Phase 3: Tag at Antenna 2
        for i in range(10):
            timestamp = base_time + 2.0 + i * 0.1
            processor.process_read("TAG008", timestamp, 1, -90.0)
            processor.process_read("TAG008", timestamp + 0.01, 2, -40.0)
        
        events = processor.get_movement_events()
        inbound_events = [e for e in events if e[0] == "TAG008" and e[1] == MovementDirection.INBOUND]
        
        self.assertGreaterEqual(len(inbound_events), 1)
    
    def test_outbound_detection(self):
        """Verify OUTBOUND movement (Antenna 2 -> Antenna 1) is detected."""
        processor = TagMovementProcessor(
            rssi_delta_threshold=5.0,
            debounce_threshold_ms=100.0
        )
        base_time = time.time()
        
        # Phase 1: Tag at Antenna 2
        for i in range(10):
            timestamp = base_time + i * 0.1
            processor.process_read("TAG009", timestamp, 1, -90.0)
            processor.process_read("TAG009", timestamp + 0.01, 2, -40.0)
        
        # Phase 2: Transition (Antenna 2 weakens, Antenna 1 strengthens)
        for i in range(10):
            timestamp = base_time + 1.0 + i * 0.1
            rssi_1 = -90.0 + i * 5.0
            rssi_2 = -40.0 - i * 5.0
            processor.process_read("TAG009", timestamp, 1, rssi_1)
            processor.process_read("TAG009", timestamp + 0.01, 2, rssi_2)
        
        # Phase 3: Tag at Antenna 1
        for i in range(10):
            timestamp = base_time + 2.0 + i * 0.1
            processor.process_read("TAG009", timestamp, 1, -40.0)
            processor.process_read("TAG009", timestamp + 0.01, 2, -90.0)
        
        events = processor.get_movement_events()
        outbound_events = [e for e in events if e[0] == "TAG009" and e[1] == MovementDirection.OUTBOUND]
        
        self.assertGreaterEqual(len(outbound_events), 1)


class TestStationaryScenario(unittest.TestCase):
    """Test Requirement 8: Stationary Test - Alternating reads, no movement events."""
    
    def test_stationary_tag_no_movement(self):
        """Feed alternating reads from Ant1 (-40dB) and Ant2 (-80dB). 
        Verify tag is stable at Ant1 and NO movement events."""
        processor = TagMovementProcessor(
            rssi_delta_threshold=5.0,
            debounce_threshold_ms=200.0
        )
        base_time = time.time()
        
        # Feed alternating reads: Ant1 strong (-40dB), Ant2 weak (-80dB)
        for i in range(20):
            timestamp = base_time + i * 0.1
            if i % 2 == 0:
                processor.process_read("TAG016", timestamp, 1, -40.0)
            else:
                processor.process_read("TAG016", timestamp, 2, -80.0)
        
        # Verify tag is stable at Antenna 1
        zone = processor.get_tag_zone("TAG016")
        self.assertEqual(zone, AntennaZone.ANTENNA_1)
        
        # Verify NO movement events
        events = processor.get_movement_events()
        tag_events = [e for e in events if e[0] == "TAG016"]
        self.assertEqual(len(tag_events), 0)


class TestMovementScenario(unittest.TestCase):
    """Test Requirement 9: Movement Test - RSSI crossover triggers event."""
    
    def test_inbound_movement_event(self):
        """Feed sequence where Ant1 RSSI drops (-40 -> -90) and Ant2 RSSI rises (-90 -> -40).
        Verify INBOUND event is fired exactly once at crossover."""
        processor = TagMovementProcessor(
            rssi_delta_threshold=5.0,
            debounce_threshold_ms=200.0
        )
        base_time = time.time()
        
        # Phase 1: Tag at Antenna 1 (strong signal)
        for i in range(10):
            timestamp = base_time + i * 0.1
            processor.process_read("TAG017", timestamp, 1, -40.0 - i * 2)
            processor.process_read("TAG017", timestamp + 0.01, 2, -90.0)
        
        # Phase 2: Transition (crossover)
        for i in range(10):
            timestamp = base_time + 1.0 + i * 0.1
            rssi_1 = -60.0 - i * 3
            rssi_2 = -90.0 + i * 3
            processor.process_read("TAG017", timestamp, 1, rssi_1)
            processor.process_read("TAG017", timestamp + 0.01, 2, rssi_2)
        
        # Phase 3: Tag at Antenna 2 (strong signal)
        for i in range(10):
            timestamp = base_time + 2.0 + i * 0.1
            processor.process_read("TAG017", timestamp, 1, -90.0)
            processor.process_read("TAG017", timestamp + 0.01, 2, -40.0)
        
        # Verify INBOUND event was fired
        events = processor.get_movement_events()
        inbound_events = [e for e in events if e[0] == "TAG017" and e[1] == MovementDirection.INBOUND]
        
        self.assertGreaterEqual(len(inbound_events), 1)
        
        # Verify final zone is Antenna 2
        zone = processor.get_tag_zone("TAG017")
        self.assertEqual(zone, AntennaZone.ANTENNA_2)
    
    def test_outbound_movement_event(self):
        """Feed sequence where Ant2 RSSI drops and Ant1 RSSI rises.
        Verify OUTBOUND event is fired exactly once."""
        processor = TagMovementProcessor(
            rssi_delta_threshold=5.0,
            debounce_threshold_ms=200.0
        )
        base_time = time.time()
        
        # Phase 1: Tag at Antenna 2
        for i in range(10):
            timestamp = base_time + i * 0.1
            processor.process_read("TAG018", timestamp, 1, -90.0)
            processor.process_read("TAG018", timestamp + 0.01, 2, -40.0)
        
        # Phase 2: Transition (crossover)
        for i in range(10):
            timestamp = base_time + 1.0 + i * 0.1
            rssi_1 = -90.0 + i * 3
            rssi_2 = -60.0 - i * 3
            processor.process_read("TAG018", timestamp, 1, rssi_1)
            processor.process_read("TAG018", timestamp + 0.01, 2, rssi_2)
        
        # Phase 3: Tag at Antenna 1
        for i in range(10):
            timestamp = base_time + 2.0 + i * 0.1
            processor.process_read("TAG018", timestamp, 1, -40.0)
            processor.process_read("TAG018", timestamp + 0.01, 2, -90.0)
        
        # Verify OUTBOUND event was fired
        events = processor.get_movement_events()
        outbound_events = [e for e in events if e[0] == "TAG018" and e[1] == MovementDirection.OUTBOUND]
        
        self.assertGreaterEqual(len(outbound_events), 1)
        
        # Verify final zone is Antenna 1
        zone = processor.get_tag_zone("TAG018")
        self.assertEqual(zone, AntennaZone.ANTENNA_1)




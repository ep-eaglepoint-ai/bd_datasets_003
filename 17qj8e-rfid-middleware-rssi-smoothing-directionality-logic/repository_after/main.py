"""
RFID Middleware Service: RSSI Smoothing & Directionality Logic
"""

from collections import deque
from enum import Enum
from typing import Tuple, Optional, List, Dict
from dataclasses import dataclass, field
import time


class MovementDirection(Enum):
    """Enumeration for movement direction events."""
    INBOUND = "INBOUND"  # Antenna 1 (Door) -> Antenna 2 (Interior)
    OUTBOUND = "OUTBOUND"  # Antenna 2 (Interior) -> Antenna 1 (Door)


class AntennaZone(Enum):
    """Enumeration for antenna zones."""
    ANTENNA_1 = 1  # Dock Door
    ANTENNA_2 = 2  # Warehouse Interior
    UNKNOWN = 0  # Undetermined or transitioning


@dataclass
class RSSIReading:
    """Represents a single RSSI reading from an antenna."""
    timestamp: float
    antenna_id: int
    rssi: float


@dataclass
class TagSession:
    """Maintains state and readings for a single RFID tag."""
    tag_id: str
    readings: deque = field(default_factory=deque)  # Sliding window of RSSIReading objects
    current_zone: AntennaZone = AntennaZone.UNKNOWN
    previous_zone: AntennaZone = AntennaZone.UNKNOWN
    first_read_time: Optional[float] = None
    last_read_time: Optional[float] = None
    
    def add_reading(self, timestamp: float, antenna_id: int, rssi: float):
        """Add a new reading and update timestamps."""
        reading = RSSIReading(timestamp, antenna_id, rssi)
        self.readings.append(reading)
        
        if self.first_read_time is None:
            self.first_read_time = timestamp
        self.last_read_time = timestamp
    
    def get_duration(self) -> float:
        """Get the duration of this tag session in seconds."""
        if self.first_read_time is None or self.last_read_time is None:
            return 0.0
        return self.last_read_time - self.first_read_time
    
    def is_stale(self, current_time: float, stale_threshold: float = 3.0) -> bool:
        """Check if this tag session is stale (no reads for threshold seconds)."""
        if self.last_read_time is None:
            return True
        return (current_time - self.last_read_time) > stale_threshold


class TagMovementProcessor:
    def __init__(
        self,
        window_size: int = 10,
        rssi_delta_threshold: float = 5.0,
        debounce_threshold_ms: float = 200.0,
        hysteresis_delta: float = 3.0,
        stale_threshold_seconds: float = 3.0,
        weight_decay: float = 0.9
    ):
        self.window_size = window_size
        self.rssi_delta_threshold = rssi_delta_threshold
        self.debounce_threshold_ms = debounce_threshold_ms / 1000.0  # Convert to seconds
        self.hysteresis_delta = hysteresis_delta
        self.stale_threshold_seconds = stale_threshold_seconds
        self.weight_decay = weight_decay
        
        # Dictionary mapping tag_id to TagSession
        self.tag_sessions: Dict[str, TagSession] = {}
        
        # List of detected movement events
        self.movement_events: List[Tuple[str, MovementDirection, float]] = []
    
    def process_read(self, tag_id: str, timestamp: float, antenna_id: int, rssi: float):
        # Purge stale tags before processing
        self._purge_stale_tags(timestamp)
        
        # Get or create tag session
        if tag_id not in self.tag_sessions:
            self.tag_sessions[tag_id] = TagSession(tag_id)
        
        session = self.tag_sessions[tag_id]
        
        # Add reading to session
        session.add_reading(timestamp, antenna_id, rssi)
        
        # Maintain sliding window size
        while len(session.readings) > self.window_size:
            session.readings.popleft()
        
        # Sort readings by timestamp to handle out-of-order reads
        sorted_readings = sorted(session.readings, key=lambda r: r.timestamp)
        session.readings = deque(sorted_readings)
        
        # Only process if we have enough readings and session is long enough
        if len(session.readings) < 2:
            return
        
        # Calculate smoothed RSSI for each antenna
        smoothed_rssi_1, smoothed_rssi_2 = self._calculate_smoothed_rssi(session)
        
        # Determine current zone based on RSSI dominance
        new_zone = self._determine_zone(
            smoothed_rssi_1,
            smoothed_rssi_2,
            session.current_zone
        )
        
        # Check debounce threshold - only process zone changes if session is long enough
        session_duration = session.get_duration()
        
        if session_duration >= self.debounce_threshold_ms:
            # Session is long enough - process zone changes and emit events
            if new_zone != session.current_zone:
                # Zone changed - check if this is a valid movement event
                if session.current_zone != AntennaZone.UNKNOWN:
                    # Determine movement direction
                    direction = self._determine_direction(session.current_zone, new_zone)
                    if direction:
                        self.movement_events.append((tag_id, direction, timestamp))
                
                session.previous_zone = session.current_zone
                session.current_zone = new_zone
            elif session.current_zone == AntennaZone.UNKNOWN:
                # First time determining zone after debounce threshold - set it
                session.current_zone = new_zone
        # else: Session too short - don't update zone or emit events (potential ghost)
        #       Keep tracking reads, but zone remains UNKNOWN until debounce threshold is met
    
    def _calculate_smoothed_rssi(self, session: TagSession) -> Tuple[float, float]:
        """
        Calculate weighted average RSSI for each antenna using sliding window.
        
        Returns:
            Tuple of (smoothed_rssi_antenna_1, smoothed_rssi_antenna_2)
        """
        readings = list(session.readings)
        
        if not readings:
            return (float('-inf'), float('-inf'))
        
        # Separate readings by antenna
        antenna_1_readings = [r for r in readings if r.antenna_id == 1]
        antenna_2_readings = [r for r in readings if r.antenna_id == 2]
        
        # Calculate weighted average for antenna 1
        smoothed_1 = self._weighted_average(antenna_1_readings)
        
        # Calculate weighted average for antenna 2
        smoothed_2 = self._weighted_average(antenna_2_readings)
        
        return (smoothed_1, smoothed_2)
    
    def _weighted_average(self, readings: List[RSSIReading]) -> float:
        
        if not readings:
            return float('-inf')
        
        if len(readings) == 1:
            return readings[0].rssi
        
        # Calculate weights with exponential decay (most recent = highest weight)
        total_weight = 0.0
        weighted_sum = 0.0
        
        for i, reading in enumerate(readings):
            # Weight decreases exponentially for older readings
            weight = self.weight_decay ** (len(readings) - 1 - i)
            weighted_sum += reading.rssi * weight
            total_weight += weight
        
        return weighted_sum / total_weight if total_weight > 0 else float('-inf')
    
    def _determine_zone(
        self,
        smoothed_rssi_1: float,
        smoothed_rssi_2: float,
        current_zone: AntennaZone
    ) -> AntennaZone:
        
        # Handle case where one antenna has no readings
        if smoothed_rssi_1 == float('-inf') and smoothed_rssi_2 == float('-inf'):
            return AntennaZone.UNKNOWN
        
        if smoothed_rssi_1 == float('-inf'):
            return AntennaZone.ANTENNA_2
        
        if smoothed_rssi_2 == float('-inf'):
            return AntennaZone.ANTENNA_1
        
        # Calculate RSSI difference
        rssi_delta = smoothed_rssi_1 - smoothed_rssi_2
        
        # Apply hysteresis: require larger delta to switch states
        if current_zone == AntennaZone.ANTENNA_1:
            # Currently at antenna 1, require stronger signal to switch to antenna 2
            threshold = self.rssi_delta_threshold + self.hysteresis_delta
            if rssi_delta < -threshold:
                return AntennaZone.ANTENNA_2
            else:
                return AntennaZone.ANTENNA_1
        
        elif current_zone == AntennaZone.ANTENNA_2:
            # Currently at antenna 2, require stronger signal to switch to antenna 1
            threshold = self.rssi_delta_threshold + self.hysteresis_delta
            if rssi_delta > threshold:
                return AntennaZone.ANTENNA_1
            else:
                return AntennaZone.ANTENNA_2
        
        else:
            # Unknown state - use base threshold
            if rssi_delta > self.rssi_delta_threshold:
                return AntennaZone.ANTENNA_1
            elif rssi_delta < -self.rssi_delta_threshold:
                return AntennaZone.ANTENNA_2
            else:
                return AntennaZone.UNKNOWN
    
    def _determine_direction(
        self,
        from_zone: AntennaZone,
        to_zone: AntennaZone
    ) -> Optional[MovementDirection]:
        
        if from_zone == AntennaZone.ANTENNA_1 and to_zone == AntennaZone.ANTENNA_2:
            return MovementDirection.INBOUND  # Door -> Interior
        elif from_zone == AntennaZone.ANTENNA_2 and to_zone == AntennaZone.ANTENNA_1:
            return MovementDirection.OUTBOUND  # Interior -> Door
        else:
            return None
    
    def _purge_stale_tags(self, current_time: float):
        """Remove tags that haven't been read for more than stale_threshold_seconds."""
        stale_tags = [
            tag_id for tag_id, session in self.tag_sessions.items()
            if session.is_stale(current_time, self.stale_threshold_seconds)
        ]
        
        for tag_id in stale_tags:
            del self.tag_sessions[tag_id]
    
    def get_movement_events(self) -> List[Tuple[str, MovementDirection, float]]:
        
        return self.movement_events.copy()
    
    def get_active_tags(self) -> List[str]:
        
        return list(self.tag_sessions.keys())
    
    def get_tag_zone(self, tag_id: str) -> Optional[AntennaZone]:
       
        if tag_id in self.tag_sessions:
            return self.tag_sessions[tag_id].current_zone
        return None


# Example usage and test functions
if __name__ == "__main__":
    # Initialize processor
    processor = TagMovementProcessor(
        window_size=10,
        rssi_delta_threshold=5.0,
        debounce_threshold_ms=200.0,
        hysteresis_delta=3.0,
        stale_threshold_seconds=3.0
    )
    
    # Test 1: Stationary Test - Alternating reads from Ant1 (-40dB) and Ant2 (-80dB)
    # Expected: Tag stable at Ant1, NO movement events
    print("=== Stationary Test ===")
    base_time = time.time()
    for i in range(20):
        timestamp = base_time + i * 0.1
        if i % 2 == 0:
            processor.process_read("TAG001", timestamp, 1, -40.0)
        else:
            processor.process_read("TAG001", timestamp, 2, -80.0)
    
    events = processor.get_movement_events()
    zone = processor.get_tag_zone("TAG001")
    print(f"Zone: {zone}")
    print(f"Movement events: {len(events)}")
    print(f"Expected: AntennaZone.ANTENNA_1, 0 events")
    print()
    
    # Reset for next test
    processor = TagMovementProcessor()
    
    # Test 2: Movement Test - Ant1 RSSI drops, Ant2 RSSI rises
    # Expected: INBOUND event fired exactly once at crossover
    print("=== Movement Test (Inbound) ===")
    base_time = time.time()
    
    # Phase 1: Tag at Antenna 1 (strong signal)
    for i in range(10):
        timestamp = base_time + i * 0.1
        processor.process_read("TAG002", timestamp, 1, -40.0 - i * 2)
        processor.process_read("TAG002", timestamp + 0.01, 2, -90.0)
    
    # Phase 2: Transition (crossover)
    for i in range(10):
        timestamp = base_time + 1.0 + i * 0.1
        rssi_1 = -60.0 - i * 3
        rssi_2 = -90.0 + i * 3
        processor.process_read("TAG002", timestamp, 1, rssi_1)
        processor.process_read("TAG002", timestamp + 0.01, 2, rssi_2)
    
    # Phase 3: Tag at Antenna 2 (strong signal)
    for i in range(10):
        timestamp = base_time + 2.0 + i * 0.1
        processor.process_read("TAG002", timestamp, 1, -90.0)
        processor.process_read("TAG002", timestamp + 0.01, 2, -40.0)
    
    events = processor.get_movement_events()
    zone = processor.get_tag_zone("TAG002")
    print(f"Zone: {zone}")
    print(f"Movement events: {len(events)}")
    for tag_id, direction, ts in events:
        print(f"  {tag_id}: {direction.value} at {ts}")
    print(f"Expected: 1 INBOUND event")
    print()
    
    # Reset for next test
    processor = TagMovementProcessor()
    
    # Test 3: Ghost Test - 3 reads spanning 50ms
    # Expected: NO event tracked/emitted
    print("=== Ghost Test ===")
    base_time = time.time()
    processor.process_read("TAG003", base_time, 1, -50.0)
    processor.process_read("TAG003", base_time + 0.02, 2, -60.0)
    processor.process_read("TAG003", base_time + 0.05, 1, -55.0)
    
    # Wait a bit to ensure no more processing
    time.sleep(0.1)
    
    events = processor.get_movement_events()
    active_tags = processor.get_active_tags()
    print(f"Active tags: {active_tags}")
    print(f"Movement events: {len(events)}")
    print(f"Expected: 0 events, tag may be purged or filtered")
    print()


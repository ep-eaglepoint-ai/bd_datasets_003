"""
Data models for the RecurringScheduler system.

This module defines all the core data structures used for recurring event
scheduling with DST-aware timezone handling and bitwise conflict detection.
"""

from dataclasses import dataclass, field
from datetime import datetime, date, timedelta
from enum import Enum
from typing import List, Optional, Set, Dict
from zoneinfo import ZoneInfo


class Frequency(Enum):
    """Recurrence frequency types."""
    DAILY = "daily"
    WEEKLY = "weekly"


class DayOfWeek(Enum):
    """Days of the week (ISO weekday: Monday=1, Sunday=7)."""
    MONDAY = 1
    TUESDAY = 2
    WEDNESDAY = 3
    THURSDAY = 4
    FRIDAY = 5
    SATURDAY = 6
    SUNDAY = 7

    @classmethod
    def from_string(cls, day_str: str) -> "DayOfWeek":
        """Convert string representation to DayOfWeek."""
        mapping = {
            "mon": cls.MONDAY, "monday": cls.MONDAY,
            "tue": cls.TUESDAY, "tuesday": cls.TUESDAY,
            "wed": cls.WEDNESDAY, "wednesday": cls.WEDNESDAY,
            "thu": cls.THURSDAY, "thursday": cls.THURSDAY,
            "fri": cls.FRIDAY, "friday": cls.FRIDAY,
            "sat": cls.SATURDAY, "saturday": cls.SATURDAY,
            "sun": cls.SUNDAY, "sunday": cls.SUNDAY,
        }
        return mapping[day_str.lower()]


@dataclass
class RecurrenceRule:
    """
    Defines a recurrence pattern for scheduling.
    
    Attributes:
        frequency: The recurrence frequency (DAILY or WEEKLY)
        interval: How often the pattern repeats (e.g., every 2 weeks)
        by_day: Specific days of the week (for WEEKLY frequency)
        start_time_hour: Hour of the meeting in local time (0-23)
        start_time_minute: Minute of the meeting in local time (0-59)
        timezone: The timezone for the meeting (e.g., "America/New_York")
        duration_minutes: Duration of the meeting in minutes
    """
    frequency: Frequency
    interval: int = 1
    by_day: Optional[List[DayOfWeek]] = None
    start_time_hour: int = 9
    start_time_minute: int = 0
    timezone: str = "America/New_York"
    duration_minutes: int = 60

    def __post_init__(self):
        if self.interval < 1:
            raise ValueError("Interval must be at least 1")
        if not 0 <= self.start_time_hour <= 23:
            raise ValueError("Hour must be between 0 and 23")
        if not 0 <= self.start_time_minute <= 59:
            raise ValueError("Minute must be between 0 and 59")
        if self.duration_minutes < 1:
            raise ValueError("Duration must be at least 1 minute")
        # Validate timezone
        ZoneInfo(self.timezone)


@dataclass
class EventInstance:
    """
    A single concrete occurrence of a recurring event.
    
    All times are stored in UTC for consistency.
    
    Attributes:
        local_date: The date of the event in the local timezone
        start_utc: The start time in UTC
        end_utc: The end time in UTC
        local_start_hour: The start hour in local time (for verification)
        local_start_minute: The start minute in local time (for verification)
    """
    local_date: date
    start_utc: datetime
    end_utc: datetime
    local_start_hour: int
    local_start_minute: int

    def __post_init__(self):
        # Ensure UTC times have tzinfo
        if self.start_utc.tzinfo is None or self.end_utc.tzinfo is None:
            raise ValueError("UTC times must be timezone-aware")


@dataclass
class ConflictedDate:
    """
    Represents a date where a scheduling conflict exists.
    
    Attributes:
        date: The date of the conflict
        conflicting_user_ids: Set of user IDs that have conflicts on this date
    """
    date: date
    conflicting_user_ids: Set[str] = field(default_factory=set)


@dataclass
class SeriesFeasibility:
    """
    The result of evaluating a recurring meeting series.
    
    Attributes:
        total_occurrences: Total number of potential occurrences
        valid_dates: List of dates where all attendees are available
        conflicted_dates: List of dates with conflicts, including who is busy
        valid_instances: List of EventInstance objects for valid dates
    """
    total_occurrences: int
    valid_dates: List[date]
    conflicted_dates: List[ConflictedDate]
    valid_instances: List[EventInstance] = field(default_factory=list)

    @property
    def feasibility_ratio(self) -> float:
        """Ratio of valid dates to total occurrences."""
        if self.total_occurrences == 0:
            return 0.0
        return len(self.valid_dates) / self.total_occurrences


class AvailabilityMatrix:
    """
    Binary representation of availability using bitmasks for O(1) conflict detection.
    
    Each bit represents a 15-minute time slot. The bitmask covers only the
    evaluation window, not the entire epoch, for memory efficiency.
    
    The matrix uses a bytearray internally where each byte represents
    8 consecutive 15-minute slots (2 hours).
    """
    
    SLOT_MINUTES = 15  # Each slot is 15 minutes
    SLOTS_PER_HOUR = 60 // SLOT_MINUTES  # 4 slots per hour
    SLOTS_PER_DAY = 24 * SLOTS_PER_HOUR  # 96 slots per day
    
    def __init__(self, user_id: str, window_start: datetime, window_end: datetime):
        """
        Initialize availability matrix for a user within a time window.
        
        Args:
            user_id: Unique identifier for the user
            window_start: Start of the evaluation window (UTC)
            window_end: End of the evaluation window (UTC)
        """
        self.user_id = user_id
        
        # Ensure times are UTC
        if window_start.tzinfo is None:
            window_start = window_start.replace(tzinfo=ZoneInfo("UTC"))
        if window_end.tzinfo is None:
            window_end = window_end.replace(tzinfo=ZoneInfo("UTC"))
            
        self.window_start = window_start
        self.window_end = window_end
        
        # Calculate total slots needed
        total_minutes = int((window_end - window_start).total_seconds() / 60)
        self.total_slots = (total_minutes + self.SLOT_MINUTES - 1) // self.SLOT_MINUTES
        
        # Initialize bytearray for the bitmask
        # Each byte holds 8 slots, round up
        num_bytes = (self.total_slots + 7) // 8
        self._availability = bytearray(num_bytes)
        
        # By default, all slots are available (bits = 0 means busy, 1 means available)
        # We'll use 1 = available, 0 = busy
        for i in range(num_bytes):
            self._availability[i] = 0xFF  # All available
        
        # Clear extra bits at the end that are beyond total_slots
        if self.total_slots % 8 != 0:
            last_byte_idx = num_bytes - 1
            valid_bits = self.total_slots % 8
            mask = (1 << valid_bits) - 1
            self._availability[last_byte_idx] &= mask

    def _datetime_to_slot(self, dt: datetime) -> int:
        """Convert a datetime to a slot index."""
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=ZoneInfo("UTC"))
        
        # Convert to UTC if not already
        dt_utc = dt.astimezone(ZoneInfo("UTC"))
        
        delta = dt_utc - self.window_start
        minutes = int(delta.total_seconds() / 60)
        slot = minutes // self.SLOT_MINUTES
        
        return max(0, min(slot, self.total_slots - 1))

    def _slot_to_datetime(self, slot: int) -> datetime:
        """Convert a slot index to a datetime."""
        minutes = slot * self.SLOT_MINUTES
        return self.window_start + timedelta(minutes=minutes)

    def mark_busy(self, start: datetime, end: datetime) -> None:
        """
        Mark a time range as busy (unavailable).
        
        The end time is exclusive - a meeting from 9:00-9:30 marks 9:00 and 9:15
        as busy, but not the 9:30 slot.
        
        Args:
            start: Start of busy period (UTC)
            end: End of busy period (UTC), exclusive
        """
        start_slot = self._datetime_to_slot(start)
        end_slot = self._datetime_to_slot(end)
        
        # End is exclusive, so don't include end_slot if it's exactly on slot boundary
        if end == self._slot_to_datetime(end_slot):
            end_slot = max(start_slot, end_slot - 1)
        
        # Mark all slots from start to end as busy (set bits to 0)
        for slot in range(start_slot, min(end_slot + 1, self.total_slots)):
            byte_idx = slot // 8
            bit_idx = slot % 8
            self._availability[byte_idx] &= ~(1 << bit_idx)

    def mark_available(self, start: datetime, end: datetime) -> None:
        """
        Mark a time range as available.
        
        Args:
            start: Start of available period (UTC)
            end: End of available period (UTC)
        """
        start_slot = self._datetime_to_slot(start)
        end_slot = self._datetime_to_slot(end)
        
        for slot in range(start_slot, min(end_slot + 1, self.total_slots)):
            byte_idx = slot // 8
            bit_idx = slot % 8
            self._availability[byte_idx] |= (1 << bit_idx)

    def is_available(self, start: datetime, end: datetime) -> bool:
        """
        Check if a time range is available using bitwise operations.
        
        This is O(1) for small ranges as it uses direct bit manipulation.
        
        Args:
            start: Start of period to check (UTC)
            end: End of period to check (UTC)
            
        Returns:
            True if the entire range is available, False otherwise
        """
        start_slot = self._datetime_to_slot(start)
        end_slot = self._datetime_to_slot(end)
        
        # For the range, we need end_slot to be inclusive of the last moment
        # but not the slot after
        if end == self._slot_to_datetime(end_slot):
            end_slot = max(start_slot, end_slot - 1)
        
        # Check all slots using bitwise AND
        for slot in range(start_slot, min(end_slot + 1, self.total_slots)):
            byte_idx = slot // 8
            bit_idx = slot % 8
            if not (self._availability[byte_idx] & (1 << bit_idx)):
                return False
        
        return True

    def get_busy_slots_mask(self, start: datetime, end: datetime) -> int:
        """
        Get a bitmask representing busy slots in a range.
        
        Returns an integer where each bit represents a slot's busy status.
        
        Args:
            start: Start of period (UTC)
            end: End of period (UTC)
            
        Returns:
            Integer bitmask (1 = busy, 0 = available for this return value)
        """
        start_slot = self._datetime_to_slot(start)
        end_slot = self._datetime_to_slot(end)
        
        result = 0
        for i, slot in enumerate(range(start_slot, min(end_slot + 1, self.total_slots))):
            byte_idx = slot // 8
            bit_idx = slot % 8
            if not (self._availability[byte_idx] & (1 << bit_idx)):
                result |= (1 << i)
        
        return result

    @property
    def raw_availability(self) -> bytearray:
        """Get the raw availability bytearray for inspection/testing."""
        return self._availability

    def __repr__(self) -> str:
        return f"AvailabilityMatrix(user_id={self.user_id}, slots={self.total_slots})"

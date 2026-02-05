"""
RecurringScheduler - Core scheduling engine with DST-aware expansion.

This module implements the main scheduling logic that:
1. Expands recurrence rules into concrete event instances
2. Properly handles Wall Clock Time vs Absolute Time (DST transitions)
3. Uses bitwise operations for O(1) conflict detection
"""

from datetime import datetime, date, timedelta, time
from typing import List, Dict, Optional, Set
from zoneinfo import ZoneInfo

from .models import (
    Frequency,
    DayOfWeek,
    RecurrenceRule,
    EventInstance,
    AvailabilityMatrix,
    SeriesFeasibility,
    ConflictedDate,
)


class RecurringScheduler:
    """
    High-performance scheduler for recurring events with DST-aware expansion.
    
    This class handles the critical challenge of "Wall Clock Time" versus
    "Absolute Time" - ensuring that a meeting defined as "09:00 AM New York"
    stays at 09:00 AM local time throughout the year, even across DST transitions.
    
    Key features:
    - Manual recurrence expansion (no external libraries)
    - DST-aware UTC conversion using zoneinfo
    - Bitwise conflict detection via AvailabilityMatrix
    - Support for Daily/Weekly frequency with intervals and ByDay rules
    - Proper handling of leap years (Feb 29th)
    """

    def __init__(self):
        """Initialize the RecurringScheduler."""
        pass

    def expand_recurrence(
        self,
        rule: RecurrenceRule,
        window_start: date,
        window_end: date,
    ) -> List[EventInstance]:
        """
        Expand a recurrence rule into concrete event instances.
        
        This method calculates each instance's naive local time independently
        before converting to UTC, ensuring correct handling of DST transitions.
        
        Args:
            rule: The recurrence rule defining the pattern
            window_start: Start date of the evaluation window
            window_end: End date of the evaluation window (inclusive)
            
        Returns:
            List of EventInstance objects with UTC times
        """
        instances = []
        tz = ZoneInfo(rule.timezone)
        utc = ZoneInfo("UTC")
        
        if rule.frequency == Frequency.DAILY:
            instances = self._expand_daily(rule, window_start, window_end, tz, utc)
        elif rule.frequency == Frequency.WEEKLY:
            instances = self._expand_weekly(rule, window_start, window_end, tz, utc)
        
        return instances

    def _expand_daily(
        self,
        rule: RecurrenceRule,
        window_start: date,
        window_end: date,
        tz: ZoneInfo,
        utc: ZoneInfo,
    ) -> List[EventInstance]:
        """
        Expand a daily recurrence pattern.
        
        For daily patterns with interval > 1, events occur every N days.
        """
        instances = []
        current_date = window_start
        day_count = 0
        
        while current_date <= window_end:
            # Only include if day_count is divisible by interval
            if day_count % rule.interval == 0:
                instance = self._create_instance(
                    current_date, rule, tz, utc
                )
                if instance is not None:
                    instances.append(instance)
            
            current_date += timedelta(days=1)
            day_count += 1
        
        return instances

    def _expand_weekly(
        self,
        rule: RecurrenceRule,
        window_start: date,
        window_end: date,
        tz: ZoneInfo,
        utc: ZoneInfo,
    ) -> List[EventInstance]:
        """
        Expand a weekly recurrence pattern.
        
        For weekly patterns:
        - If by_day is specified, events occur on those specific days
        - If by_day is not specified, events occur on the same day as window_start
        - Interval determines how many weeks between occurrences
        """
        instances = []
        
        # Determine which days of the week to include
        if rule.by_day:
            target_weekdays = {day.value for day in rule.by_day}
        else:
            # Default to the weekday of window_start
            target_weekdays = {window_start.isoweekday()}
        
        # Find the first week's Monday
        first_monday = window_start - timedelta(days=window_start.isoweekday() - 1)
        
        current_week_monday = first_monday
        week_count = 0
        
        while current_week_monday <= window_end:
            # Only process this week if it matches the interval
            if week_count % rule.interval == 0:
                # Check each day of this week
                for day_offset in range(7):
                    current_date = current_week_monday + timedelta(days=day_offset)
                    
                    # Skip dates outside the window
                    if current_date < window_start or current_date > window_end:
                        continue
                    
                    # Check if this day is in our target weekdays
                    if current_date.isoweekday() in target_weekdays:
                        instance = self._create_instance(
                            current_date, rule, tz, utc
                        )
                        if instance is not None:
                            instances.append(instance)
            
            current_week_monday += timedelta(days=7)
            week_count += 1
        
        # Sort by date
        instances.sort(key=lambda x: x.local_date)
        
        return instances

    def _create_instance(
        self,
        local_date: date,
        rule: RecurrenceRule,
        tz: ZoneInfo,
        utc: ZoneInfo,
    ) -> Optional[EventInstance]:
        """
        Create an EventInstance for a specific date.
        
        This is the critical method that handles DST-aware conversion.
        We create the naive local datetime first, then convert to UTC,
        ensuring the local time remains constant regardless of DST.
        
        Args:
            local_date: The date of the event
            rule: The recurrence rule
            tz: The local timezone
            utc: UTC timezone
            
        Returns:
            EventInstance with UTC times, or None if date is invalid
        """
        # Validate the date (e.g., Feb 29 in non-leap years)
        try:
            # Create naive local datetime
            naive_local = datetime(
                local_date.year,
                local_date.month,
                local_date.day,
                rule.start_time_hour,
                rule.start_time_minute,
                0,
            )
        except ValueError:
            # Invalid date (e.g., Feb 29 in non-leap year)
            return None
        
        # Convert to timezone-aware local time
        # Using fold=0 for the first occurrence of ambiguous times
        local_dt = naive_local.replace(tzinfo=tz)
        
        # Handle DST transition edge cases
        # During "fall back", there are two possible times with the same wall clock
        # We use fold=0 (the first occurrence, before DST ends)
        # During "spring forward", some times don't exist
        # The zoneinfo library handles this automatically
        
        # Convert to UTC - this is where DST is properly applied
        start_utc = local_dt.astimezone(utc)
        
        # Calculate end time
        end_utc = start_utc + timedelta(minutes=rule.duration_minutes)
        
        # Verify the local time (for testing purposes)
        # Convert back to local to confirm the time is correct
        local_start_check = start_utc.astimezone(tz)
        
        return EventInstance(
            local_date=local_date,
            start_utc=start_utc,
            end_utc=end_utc,
            local_start_hour=local_start_check.hour,
            local_start_minute=local_start_check.minute,
        )

    def check_availability(
        self,
        instances: List[EventInstance],
        attendee_matrices: Dict[str, AvailabilityMatrix],
    ) -> SeriesFeasibility:
        """
        Check availability for all instances against attendee matrices.
        
        Uses bitwise operations for O(1) conflict detection per slot.
        
        Args:
            instances: List of EventInstance objects to check
            attendee_matrices: Dictionary mapping user_id to AvailabilityMatrix
            
        Returns:
            SeriesFeasibility object with valid and conflicted dates
        """
        valid_dates: List[date] = []
        conflicted_dates: List[ConflictedDate] = []
        valid_instances: List[EventInstance] = []
        
        for instance in instances:
            conflicting_users: Set[str] = set()
            
            # Check each attendee's availability
            for user_id, matrix in attendee_matrices.items():
                if not matrix.is_available(instance.start_utc, instance.end_utc):
                    conflicting_users.add(user_id)
            
            if conflicting_users:
                conflicted_dates.append(ConflictedDate(
                    date=instance.local_date,
                    conflicting_user_ids=conflicting_users,
                ))
            else:
                valid_dates.append(instance.local_date)
                valid_instances.append(instance)
        
        return SeriesFeasibility(
            total_occurrences=len(instances),
            valid_dates=valid_dates,
            conflicted_dates=conflicted_dates,
            valid_instances=valid_instances,
        )

    def evaluate_series(
        self,
        rule: RecurrenceRule,
        window_start: date,
        window_end: date,
        attendee_matrices: Dict[str, AvailabilityMatrix],
    ) -> SeriesFeasibility:
        """
        Evaluate the feasibility of a meeting series.
        
        This is the main entry point that combines recurrence expansion
        and availability checking.
        
        Args:
            rule: The recurrence rule defining the meeting pattern
            window_start: Start date of the evaluation window
            window_end: End date of the evaluation window (inclusive)
            attendee_matrices: Dictionary mapping user_id to AvailabilityMatrix
            
        Returns:
            SeriesFeasibility object with complete analysis
        """
        # Expand the recurrence rule into concrete instances
        instances = self.expand_recurrence(rule, window_start, window_end)
        
        # Check availability for all instances
        return self.check_availability(instances, attendee_matrices)

    @staticmethod
    def is_leap_year(year: int) -> bool:
        """Check if a year is a leap year."""
        return (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0)

    @staticmethod
    def days_in_month(year: int, month: int) -> int:
        """Get the number of days in a month."""
        if month in (1, 3, 5, 7, 8, 10, 12):
            return 31
        elif month in (4, 6, 9, 11):
            return 30
        elif month == 2:
            return 29 if RecurringScheduler.is_leap_year(year) else 28
        else:
            raise ValueError(f"Invalid month: {month}")

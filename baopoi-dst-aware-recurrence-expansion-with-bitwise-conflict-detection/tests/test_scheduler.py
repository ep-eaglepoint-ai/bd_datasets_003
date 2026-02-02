"""
Comprehensive tests for the RecurringScheduler system.

These tests validate:
1. DST-aware timezone handling (wall clock time stays constant)
2. UTC conversion correctness
3. Daily/Weekly frequency with intervals and ByDay rules
4. No usage of dateutil.rrule
5. Binary bitmask representation for availability
6. 15-minute slot alignment
7. Conflict detection identifying specific users
8. Feb 29th leap year handling
9. zoneinfo.ZoneInfo usage for offset calculations
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo

from repository_after.models import (
    Frequency,
    DayOfWeek,
    RecurrenceRule,
    EventInstance,
    AvailabilityMatrix,
    SeriesFeasibility,
    ConflictedDate,
)
from repository_after.scheduler import RecurringScheduler


class TestDSTAwareExpansion:
    """Test that instances remain at local time across DST boundaries."""

    def test_daily_recurrence_maintains_local_time_across_dst_spring_forward(self):
        """
        Requirement 1: Instances must remain at '09:00' local time throughout 
        the year, even across DST boundaries.
        
        Test spring forward (March 2024: DST starts March 10).
        """
        scheduler = RecurringScheduler()
        rule = RecurrenceRule(
            frequency=Frequency.DAILY,
            interval=1,
            start_time_hour=9,
            start_time_minute=0,
            timezone="America/New_York",
            duration_minutes=60,
        )
        
        # March 8-12, 2024 covers DST transition
        window_start = date(2024, 3, 8)
        window_end = date(2024, 3, 12)
        
        instances = scheduler.expand_recurrence(rule, window_start, window_end)
        
        assert len(instances) == 5
        
        # All instances must have local_start_hour = 9
        for instance in instances:
            assert instance.local_start_hour == 9, \
                f"Instance on {instance.local_date} has local hour {instance.local_start_hour}, expected 9"
            assert instance.local_start_minute == 0

    def test_daily_recurrence_maintains_local_time_across_dst_fall_back(self):
        """
        Requirement 1: Instances must remain at '09:00' local time.
        
        Test fall back (November 2024: DST ends November 3).
        """
        scheduler = RecurringScheduler()
        rule = RecurrenceRule(
            frequency=Frequency.DAILY,
            interval=1,
            start_time_hour=9,
            start_time_minute=0,
            timezone="America/New_York",
            duration_minutes=60,
        )
        
        # November 1-5, 2024 covers DST transition
        window_start = date(2024, 11, 1)
        window_end = date(2024, 11, 5)
        
        instances = scheduler.expand_recurrence(rule, window_start, window_end)
        
        assert len(instances) == 5
        
        # All instances must have local_start_hour = 9
        for instance in instances:
            assert instance.local_start_hour == 9, \
                f"Instance on {instance.local_date} has local hour {instance.local_start_hour}, expected 9"

    def test_utc_offset_changes_across_dst(self):
        """
        Verify that UTC times reflect different offsets before/after DST.
        
        Before DST (EST): UTC-5
        After DST (EDT): UTC-4
        """
        scheduler = RecurringScheduler()
        rule = RecurrenceRule(
            frequency=Frequency.DAILY,
            interval=1,
            start_time_hour=9,
            start_time_minute=0,
            timezone="America/New_York",
            duration_minutes=60,
        )
        
        # March 9 (before spring forward) and March 11 (after spring forward)
        window_start = date(2024, 3, 9)
        window_end = date(2024, 3, 11)
        
        instances = scheduler.expand_recurrence(rule, window_start, window_end)
        
        # March 9: EST (UTC-5), so 9:00 AM local = 14:00 UTC
        march_9 = next(i for i in instances if i.local_date == date(2024, 3, 9))
        assert march_9.start_utc.hour == 14  # 9 + 5 = 14
        
        # March 11: EDT (UTC-4), so 9:00 AM local = 13:00 UTC
        march_11 = next(i for i in instances if i.local_date == date(2024, 3, 11))
        assert march_11.start_utc.hour == 13  # 9 + 4 = 13


class TestUTCStorage:
    """Test that all times are stored in UTC (Requirement 2)."""

    def test_event_instances_have_utc_times(self):
        """Requirement 2: Final output instances must be stored in UTC."""
        scheduler = RecurringScheduler()
        rule = RecurrenceRule(
            frequency=Frequency.DAILY,
            interval=1,
            start_time_hour=9,
            start_time_minute=0,
            timezone="America/New_York",
            duration_minutes=60,
        )
        
        instances = scheduler.expand_recurrence(
            rule,
            date(2024, 6, 1),
            date(2024, 6, 5),
        )
        
        utc = ZoneInfo("UTC")
        for instance in instances:
            assert instance.start_utc.tzinfo is not None
            assert instance.end_utc.tzinfo is not None
            # Verify they're actually UTC
            assert instance.start_utc.astimezone(utc) == instance.start_utc
            assert instance.end_utc.astimezone(utc) == instance.end_utc


class TestFrequencyAndInterval:
    """Test Frequency (Daily/Weekly), Interval, and ByDay (Requirement 3)."""

    def test_daily_frequency_with_interval_1(self):
        """Daily frequency with interval 1 creates instance every day."""
        scheduler = RecurringScheduler()
        rule = RecurrenceRule(
            frequency=Frequency.DAILY,
            interval=1,
            start_time_hour=10,
            start_time_minute=30,
            timezone="America/New_York",
            duration_minutes=30,
        )
        
        instances = scheduler.expand_recurrence(
            rule,
            date(2024, 1, 1),
            date(2024, 1, 7),
        )
        
        assert len(instances) == 7
        dates = [i.local_date for i in instances]
        for i in range(7):
            assert date(2024, 1, 1) + timedelta(days=i) in dates

    def test_daily_frequency_with_interval_2(self):
        """Daily frequency with interval 2 creates instance every other day."""
        scheduler = RecurringScheduler()
        rule = RecurrenceRule(
            frequency=Frequency.DAILY,
            interval=2,
            start_time_hour=10,
            start_time_minute=0,
            timezone="America/New_York",
            duration_minutes=30,
        )
        
        instances = scheduler.expand_recurrence(
            rule,
            date(2024, 1, 1),
            date(2024, 1, 10),
        )
        
        # Days 1, 3, 5, 7, 9 = 5 instances
        assert len(instances) == 5
        expected_dates = [date(2024, 1, d) for d in [1, 3, 5, 7, 9]]
        actual_dates = [i.local_date for i in instances]
        assert actual_dates == expected_dates

    def test_weekly_frequency_with_by_day(self):
        """Weekly frequency with ByDay (Mon/Wed) creates instances on those days."""
        scheduler = RecurringScheduler()
        rule = RecurrenceRule(
            frequency=Frequency.WEEKLY,
            interval=1,
            by_day=[DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY],
            start_time_hour=9,
            start_time_minute=0,
            timezone="America/New_York",
            duration_minutes=60,
        )
        
        # January 2024: Mon 1, Wed 3, Mon 8, Wed 10, Mon 15, Wed 17
        instances = scheduler.expand_recurrence(
            rule,
            date(2024, 1, 1),
            date(2024, 1, 17),
        )
        
        assert len(instances) == 6
        for instance in instances:
            assert instance.local_date.isoweekday() in [1, 3]  # Mon=1, Wed=3

    def test_weekly_frequency_with_interval_2(self):
        """Weekly frequency with interval 2 creates instances every other week."""
        scheduler = RecurringScheduler()
        rule = RecurrenceRule(
            frequency=Frequency.WEEKLY,
            interval=2,
            by_day=[DayOfWeek.MONDAY],
            start_time_hour=9,
            start_time_minute=0,
            timezone="America/New_York",
            duration_minutes=60,
        )
        
        # January 2024: Mondays are 1, 8, 15, 22, 29
        # With interval 2, we get 1, 15, 29
        instances = scheduler.expand_recurrence(
            rule,
            date(2024, 1, 1),
            date(2024, 1, 31),
        )
        
        assert len(instances) == 3
        expected_dates = [date(2024, 1, 1), date(2024, 1, 15), date(2024, 1, 29)]
        actual_dates = [i.local_date for i in instances]
        assert actual_dates == expected_dates


class TestNoDateutilRrule:
    """Verify no usage of dateutil.rrule (Requirement 4)."""

    def test_no_dateutil_import(self):
        """Requirement 4: Usage of dateutil.rrule is an automatic failure."""
        import repository_after.scheduler as scheduler_module
        import repository_after.models as models_module
        
        # Check that dateutil is not in the modules
        scheduler_source = open(scheduler_module.__file__).read()
        models_source = open(models_module.__file__).read()
        
        assert "dateutil" not in scheduler_source, "dateutil found in scheduler.py"
        assert "rrule" not in scheduler_source, "rrule found in scheduler.py"
        assert "dateutil" not in models_source, "dateutil found in models.py"
        assert "rrule" not in models_source, "rrule found in models.py"


class TestBitmaskAvailability:
    """Test binary bitmask representation for availability (Requirement 5)."""

    def test_availability_matrix_uses_bytearray(self):
        """Requirement 5: AvailabilityMatrix must use binary representation."""
        utc = ZoneInfo("UTC")
        window_start = datetime(2024, 1, 1, 0, 0, 0, tzinfo=utc)
        window_end = datetime(2024, 1, 2, 0, 0, 0, tzinfo=utc)
        
        matrix = AvailabilityMatrix("user1", window_start, window_end)
        
        # Verify it uses bytearray internally
        assert isinstance(matrix.raw_availability, bytearray)

    def test_availability_matrix_not_datetime_list(self):
        """Requirement 5: Using lists of datetime objects for checking conflicts is a failure."""
        utc = ZoneInfo("UTC")
        window_start = datetime(2024, 1, 1, 0, 0, 0, tzinfo=utc)
        window_end = datetime(2024, 1, 2, 0, 0, 0, tzinfo=utc)
        
        matrix = AvailabilityMatrix("user1", window_start, window_end)
        
        # Check that the internal structure is not a list of datetimes
        # It should be a bytearray
        assert not isinstance(matrix._availability, list)

    def test_bitwise_conflict_detection(self):
        """Test that conflict detection uses bitwise operations."""
        utc = ZoneInfo("UTC")
        window_start = datetime(2024, 1, 1, 0, 0, 0, tzinfo=utc)
        window_end = datetime(2024, 1, 2, 0, 0, 0, tzinfo=utc)
        
        matrix = AvailabilityMatrix("user1", window_start, window_end)
        
        # Mark 9:00-10:00 as busy
        busy_start = datetime(2024, 1, 1, 9, 0, 0, tzinfo=utc)
        busy_end = datetime(2024, 1, 1, 10, 0, 0, tzinfo=utc)
        matrix.mark_busy(busy_start, busy_end)
        
        # Check availability uses bitwise operations (returns bool)
        is_avail = matrix.is_available(busy_start, busy_end)
        assert isinstance(is_avail, bool)
        assert is_avail is False
        
        # Get busy slots mask returns integer (bitmask)
        mask = matrix.get_busy_slots_mask(busy_start, busy_end)
        assert isinstance(mask, int)
        assert mask > 0  # Should have some busy bits set


class TestSlotAlignment:
    """Test 15-minute slot alignment (Requirement 6)."""

    def test_15_minute_slot_alignment(self):
        """Requirement 6: System must map timestamps to 15-minute alignment."""
        utc = ZoneInfo("UTC")
        window_start = datetime(2024, 1, 1, 0, 0, 0, tzinfo=utc)
        window_end = datetime(2024, 1, 1, 1, 0, 0, tzinfo=utc)
        
        matrix = AvailabilityMatrix("user1", window_start, window_end)
        
        # 1 hour = 4 slots of 15 minutes each
        assert matrix.SLOT_MINUTES == 15
        assert matrix.SLOTS_PER_HOUR == 4
        
        # Total slots for 1 hour should be 4
        assert matrix.total_slots == 4

    def test_slot_alignment_for_one_day(self):
        """Test that one day has 96 slots (24 hours * 4 slots/hour)."""
        utc = ZoneInfo("UTC")
        window_start = datetime(2024, 1, 1, 0, 0, 0, tzinfo=utc)
        window_end = datetime(2024, 1, 2, 0, 0, 0, tzinfo=utc)
        
        matrix = AvailabilityMatrix("user1", window_start, window_end)
        
        assert matrix.SLOTS_PER_DAY == 96
        assert matrix.total_slots == 96


class TestConflictUserIdentification:
    """Test identification of conflicting users (Requirement 7)."""

    def test_identifies_conflicting_users(self):
        """Requirement 7: Must identify exactly who is busy on a conflicted date."""
        scheduler = RecurringScheduler()
        utc = ZoneInfo("UTC")
        
        # Create a simple rule
        rule = RecurrenceRule(
            frequency=Frequency.DAILY,
            interval=1,
            start_time_hour=9,
            start_time_minute=0,
            timezone="UTC",
            duration_minutes=60,
        )
        
        # Create window
        window_start = date(2024, 1, 1)
        window_end = date(2024, 1, 3)
        
        # Create availability matrices
        window_start_dt = datetime(2024, 1, 1, 0, 0, 0, tzinfo=utc)
        window_end_dt = datetime(2024, 1, 4, 0, 0, 0, tzinfo=utc)
        
        user1_matrix = AvailabilityMatrix("user1", window_start_dt, window_end_dt)
        user2_matrix = AvailabilityMatrix("user2", window_start_dt, window_end_dt)
        
        # User1 is busy on Jan 1, 9:00-10:00
        user1_matrix.mark_busy(
            datetime(2024, 1, 1, 9, 0, 0, tzinfo=utc),
            datetime(2024, 1, 1, 10, 0, 0, tzinfo=utc),
        )
        
        # User2 is busy on Jan 2, 9:00-10:00
        user2_matrix.mark_busy(
            datetime(2024, 1, 2, 9, 0, 0, tzinfo=utc),
            datetime(2024, 1, 2, 10, 0, 0, tzinfo=utc),
        )
        
        # Evaluate series
        feasibility = scheduler.evaluate_series(
            rule,
            window_start,
            window_end,
            {"user1": user1_matrix, "user2": user2_matrix},
        )
        
        # Jan 1 conflict should identify user1
        jan1_conflict = next(
            (c for c in feasibility.conflicted_dates if c.date == date(2024, 1, 1)),
            None
        )
        assert jan1_conflict is not None
        assert "user1" in jan1_conflict.conflicting_user_ids
        
        # Jan 2 conflict should identify user2
        jan2_conflict = next(
            (c for c in feasibility.conflicted_dates if c.date == date(2024, 1, 2)),
            None
        )
        assert jan2_conflict is not None
        assert "user2" in jan2_conflict.conflicting_user_ids
        
        # Jan 3 should be valid (no conflicts)
        assert date(2024, 1, 3) in feasibility.valid_dates


class TestLeapYear:
    """Test Feb 29th handling (Requirement 8)."""

    def test_feb_29_in_leap_year(self):
        """Requirement 8: Logic must handle Feb 29th correctly if range includes it."""
        scheduler = RecurringScheduler()
        
        # 2024 is a leap year
        assert scheduler.is_leap_year(2024)
        
        rule = RecurrenceRule(
            frequency=Frequency.DAILY,
            interval=1,
            start_time_hour=9,
            start_time_minute=0,
            timezone="America/New_York",
            duration_minutes=60,
        )
        
        # Feb 28 - Mar 1, 2024 (includes Feb 29)
        instances = scheduler.expand_recurrence(
            rule,
            date(2024, 2, 28),
            date(2024, 3, 1),
        )
        
        assert len(instances) == 3
        dates = [i.local_date for i in instances]
        assert date(2024, 2, 28) in dates
        assert date(2024, 2, 29) in dates  # Leap day
        assert date(2024, 3, 1) in dates

    def test_feb_29_not_in_non_leap_year(self):
        """Test that Feb 29 is not generated in non-leap years."""
        scheduler = RecurringScheduler()
        
        # 2023 is not a leap year
        assert not scheduler.is_leap_year(2023)
        
        rule = RecurrenceRule(
            frequency=Frequency.DAILY,
            interval=1,
            start_time_hour=9,
            start_time_minute=0,
            timezone="America/New_York",
            duration_minutes=60,
        )
        
        # Feb 28 - Mar 1, 2023 (no Feb 29)
        instances = scheduler.expand_recurrence(
            rule,
            date(2023, 2, 28),
            date(2023, 3, 1),
        )
        
        assert len(instances) == 2
        dates = [i.local_date for i in instances]
        assert date(2023, 2, 28) in dates
        assert date(2023, 3, 1) in dates
        # Feb 29 should not exist in a non-leap year
        # (date(2023, 2, 29) would raise ValueError, so we just check count)


class TestZoneInfoUsage:
    """Test zoneinfo.ZoneInfo usage (Requirement 9)."""

    def test_uses_zoneinfo_for_offset_calculations(self):
        """Requirement 9: Must use zoneinfo.ZoneInfo for offset calculations."""
        # Check that zoneinfo is imported in the modules
        import repository_after.scheduler as scheduler_module
        import repository_after.models as models_module
        
        scheduler_source = open(scheduler_module.__file__).read()
        models_source = open(models_module.__file__).read()
        
        assert "from zoneinfo import ZoneInfo" in scheduler_source
        assert "from zoneinfo import ZoneInfo" in models_source

    def test_recurrence_rule_validates_timezone(self):
        """Test that RecurrenceRule validates timezone using ZoneInfo."""
        # Valid timezone should work
        rule = RecurrenceRule(
            frequency=Frequency.DAILY,
            timezone="America/New_York",
        )
        assert rule.timezone == "America/New_York"
        
        # Invalid timezone should raise
        with pytest.raises(Exception):  # ZoneInfo raises KeyError or similar
            RecurrenceRule(
                frequency=Frequency.DAILY,
                timezone="Invalid/Timezone",
            )


class TestBitmaskRangeCoverage:
    """Test that bitmask covers the range, not the whole epoch (Requirement 10)."""

    def test_bitmask_covers_only_window(self):
        """Requirement 10: The bitmask should ideally cover the range, not the whole epoch."""
        utc = ZoneInfo("UTC")
        
        # Create a 1-day window
        window_start = datetime(2024, 6, 15, 0, 0, 0, tzinfo=utc)
        window_end = datetime(2024, 6, 16, 0, 0, 0, tzinfo=utc)
        
        matrix = AvailabilityMatrix("user1", window_start, window_end)
        
        # 1 day = 96 slots
        assert matrix.total_slots == 96
        
        # Bytearray size should be 96/8 = 12 bytes
        assert len(matrix.raw_availability) == 12
        
        # Not the entire year (365 * 96 slots = 35040 slots)
        assert matrix.total_slots < 35040


class TestSeriesFeasibility:
    """Test SeriesFeasibility output structure."""

    def test_series_feasibility_structure(self):
        """Test that SeriesFeasibility contains all required fields."""
        scheduler = RecurringScheduler()
        utc = ZoneInfo("UTC")
        
        rule = RecurrenceRule(
            frequency=Frequency.DAILY,
            interval=1,
            start_time_hour=9,
            start_time_minute=0,
            timezone="UTC",
            duration_minutes=60,
        )
        
        window_start = date(2024, 1, 1)
        window_end = date(2024, 1, 5)
        
        window_start_dt = datetime(2024, 1, 1, 0, 0, 0, tzinfo=utc)
        window_end_dt = datetime(2024, 1, 6, 0, 0, 0, tzinfo=utc)
        
        user_matrix = AvailabilityMatrix("user1", window_start_dt, window_end_dt)
        user_matrix.mark_busy(
            datetime(2024, 1, 2, 9, 0, 0, tzinfo=utc),
            datetime(2024, 1, 2, 10, 0, 0, tzinfo=utc),
        )
        
        feasibility = scheduler.evaluate_series(
            rule,
            window_start,
            window_end,
            {"user1": user_matrix},
        )
        
        # Check structure
        assert hasattr(feasibility, 'total_occurrences')
        assert hasattr(feasibility, 'valid_dates')
        assert hasattr(feasibility, 'conflicted_dates')
        assert hasattr(feasibility, 'valid_instances')
        
        # Check values
        assert feasibility.total_occurrences == 5
        assert len(feasibility.valid_dates) == 4
        assert len(feasibility.conflicted_dates) == 1
        assert feasibility.conflicted_dates[0].date == date(2024, 1, 2)


class TestDayOfWeekConversion:
    """Test DayOfWeek enum and conversion."""

    def test_day_of_week_from_string(self):
        """Test converting string to DayOfWeek."""
        assert DayOfWeek.from_string("mon") == DayOfWeek.MONDAY
        assert DayOfWeek.from_string("Monday") == DayOfWeek.MONDAY
        assert DayOfWeek.from_string("wed") == DayOfWeek.WEDNESDAY
        assert DayOfWeek.from_string("FRIDAY") == DayOfWeek.FRIDAY

    def test_day_of_week_values(self):
        """Test DayOfWeek ISO weekday values."""
        assert DayOfWeek.MONDAY.value == 1
        assert DayOfWeek.SUNDAY.value == 7


class TestEdgeCases:
    """Test various edge cases."""

    def test_single_day_window(self):
        """Test with a single-day window."""
        scheduler = RecurringScheduler()
        rule = RecurrenceRule(
            frequency=Frequency.DAILY,
            interval=1,
            start_time_hour=9,
            start_time_minute=0,
            timezone="America/New_York",
            duration_minutes=60,
        )
        
        instances = scheduler.expand_recurrence(
            rule,
            date(2024, 6, 15),
            date(2024, 6, 15),
        )
        
        assert len(instances) == 1
        assert instances[0].local_date == date(2024, 6, 15)

    def test_full_year_expansion(self):
        """Test expanding for a full year."""
        scheduler = RecurringScheduler()
        rule = RecurrenceRule(
            frequency=Frequency.DAILY,
            interval=1,
            start_time_hour=9,
            start_time_minute=0,
            timezone="America/New_York",
            duration_minutes=60,
        )
        
        # Full year 2024 (leap year = 366 days)
        instances = scheduler.expand_recurrence(
            rule,
            date(2024, 1, 1),
            date(2024, 12, 31),
        )
        
        assert len(instances) == 366
        
        # All should be at 9:00 local time
        for instance in instances:
            assert instance.local_start_hour == 9

    def test_multiple_timezones(self):
        """Test with different timezones."""
        scheduler = RecurringScheduler()
        
        timezones = [
            "America/New_York",
            "America/Los_Angeles",
            "Europe/London",
            "Asia/Tokyo",
        ]
        
        for tz in timezones:
            rule = RecurrenceRule(
                frequency=Frequency.DAILY,
                interval=1,
                start_time_hour=9,
                start_time_minute=0,
                timezone=tz,
                duration_minutes=60,
            )
            
            instances = scheduler.expand_recurrence(
                rule,
                date(2024, 3, 10),  # Around DST transition
                date(2024, 3, 12),
            )
            
            assert len(instances) == 3
            for instance in instances:
                assert instance.local_start_hour == 9

    def test_weekly_without_by_day(self):
        """Test weekly frequency without specifying by_day."""
        scheduler = RecurringScheduler()
        rule = RecurrenceRule(
            frequency=Frequency.WEEKLY,
            interval=1,
            by_day=None,  # Should default to window_start's weekday
            start_time_hour=9,
            start_time_minute=0,
            timezone="America/New_York",
            duration_minutes=60,
        )
        
        # Jan 1, 2024 is Monday
        instances = scheduler.expand_recurrence(
            rule,
            date(2024, 1, 1),
            date(2024, 1, 31),
        )
        
        # Should get all Mondays: Jan 1, 8, 15, 22, 29
        assert len(instances) == 5
        for instance in instances:
            assert instance.local_date.isoweekday() == 1  # Monday

    def test_duration_affects_end_time(self):
        """Test that duration correctly sets end time."""
        scheduler = RecurringScheduler()
        rule = RecurrenceRule(
            frequency=Frequency.DAILY,
            interval=1,
            start_time_hour=9,
            start_time_minute=0,
            timezone="UTC",
            duration_minutes=90,  # 1.5 hours
        )
        
        instances = scheduler.expand_recurrence(
            rule,
            date(2024, 1, 1),
            date(2024, 1, 1),
        )
        
        assert len(instances) == 1
        instance = instances[0]
        
        # Start at 9:00, end at 10:30
        assert instance.start_utc.hour == 9
        assert instance.start_utc.minute == 0
        assert instance.end_utc.hour == 10
        assert instance.end_utc.minute == 30


class TestAvailabilityMatrixOperations:
    """Test AvailabilityMatrix operations in detail."""

    def test_mark_busy_and_check(self):
        """Test marking slots as busy and checking availability."""
        utc = ZoneInfo("UTC")
        window_start = datetime(2024, 1, 1, 0, 0, 0, tzinfo=utc)
        window_end = datetime(2024, 1, 2, 0, 0, 0, tzinfo=utc)
        
        matrix = AvailabilityMatrix("user1", window_start, window_end)
        
        # Initially all available
        check_start = datetime(2024, 1, 1, 9, 0, 0, tzinfo=utc)
        check_end = datetime(2024, 1, 1, 10, 0, 0, tzinfo=utc)
        assert matrix.is_available(check_start, check_end)
        
        # Mark busy
        matrix.mark_busy(check_start, check_end)
        
        # Now unavailable
        assert not matrix.is_available(check_start, check_end)

    def test_mark_available_restores_slots(self):
        """Test that mark_available restores busy slots."""
        utc = ZoneInfo("UTC")
        window_start = datetime(2024, 1, 1, 0, 0, 0, tzinfo=utc)
        window_end = datetime(2024, 1, 2, 0, 0, 0, tzinfo=utc)
        
        matrix = AvailabilityMatrix("user1", window_start, window_end)
        
        check_start = datetime(2024, 1, 1, 9, 0, 0, tzinfo=utc)
        check_end = datetime(2024, 1, 1, 10, 0, 0, tzinfo=utc)
        
        # Mark busy then available
        matrix.mark_busy(check_start, check_end)
        assert not matrix.is_available(check_start, check_end)
        
        matrix.mark_available(check_start, check_end)
        assert matrix.is_available(check_start, check_end)

    def test_partial_overlap_detection(self):
        """Test detection of partial overlaps."""
        utc = ZoneInfo("UTC")
        window_start = datetime(2024, 1, 1, 0, 0, 0, tzinfo=utc)
        window_end = datetime(2024, 1, 2, 0, 0, 0, tzinfo=utc)
        
        matrix = AvailabilityMatrix("user1", window_start, window_end)
        
        # Mark 9:00-9:30 as busy
        matrix.mark_busy(
            datetime(2024, 1, 1, 9, 0, 0, tzinfo=utc),
            datetime(2024, 1, 1, 9, 30, 0, tzinfo=utc),
        )
        
        # Check 9:00-10:00 - should be unavailable (partial overlap)
        assert not matrix.is_available(
            datetime(2024, 1, 1, 9, 0, 0, tzinfo=utc),
            datetime(2024, 1, 1, 10, 0, 0, tzinfo=utc),
        )
        
        # Check 9:30-10:00 - should be available
        assert matrix.is_available(
            datetime(2024, 1, 1, 9, 30, 0, tzinfo=utc),
            datetime(2024, 1, 1, 10, 0, 0, tzinfo=utc),
        )

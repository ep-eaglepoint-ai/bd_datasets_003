"""Tests for time tracking functionality.

Covers Requirements:
- Requirement 2: Clock in and clock out functionality
- Requirement 3: Prevent multiple active clock-ins per user
- Requirement 4: Store time entries with start time, end time, and optional notes
- Requirement 11: Basic error handling and validation
"""

import pytest
import sys
import os
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

from api.services import TimeService
from api.models import TimeEntry


class TestClockIn:
    """Test Requirement 2: Clock in functionality."""
    
    def test_clock_in_creates_entry(self, db_session, test_user):
        """Test that clock in creates a new time entry."""
        service = TimeService(db_session)
        entry, error = service.clock_in(test_user.id)
        assert error is None
        assert entry is not None
        assert entry.user_id == test_user.id
        assert entry.start_at is not None
    
    def test_clock_in_entry_is_active(self, db_session, test_user):
        """Test that newly clocked in entry is active."""
        service = TimeService(db_session)
        entry, _ = service.clock_in(test_user.id)
        assert entry.is_active is True
        assert entry.end_at is None
    
    def test_clock_in_with_notes(self, db_session, test_user):
        """Test clock in with notes."""
        service = TimeService(db_session)
        entry, _ = service.clock_in(test_user.id, notes="Starting work on project X")
        assert entry.notes == "Starting work on project X"
    
    def test_clock_in_without_notes(self, db_session, test_user):
        """Test clock in without notes."""
        service = TimeService(db_session)
        entry, _ = service.clock_in(test_user.id)
        assert entry.notes is None
    
    def test_clock_in_sets_current_time(self, db_session, test_user):
        """Test that clock in sets start_at to current time."""
        service = TimeService(db_session)
        before = datetime.now(timezone.utc).replace(tzinfo=None)
        entry, _ = service.clock_in(test_user.id)
        after = datetime.now(timezone.utc).replace(tzinfo=None)
        start_at = entry.start_at.replace(tzinfo=None) if entry.start_at.tzinfo else entry.start_at
        assert before <= start_at <= after


class TestPreventMultipleActiveClockIns:
    """Test Requirement 3: Prevent multiple active clock-ins per user."""
    
    def test_cannot_clock_in_when_already_clocked_in(self, db_session, test_user, active_time_entry):
        """Test that clock in fails when user already has active entry."""
        service = TimeService(db_session)
        entry, error = service.clock_in(test_user.id)
        assert entry is None
        assert error == "Already clocked in. Please clock out first."
    
    def test_different_users_can_clock_in_independently(self, db_session, test_user, second_user):
        """Test that different users can clock in independently."""
        service = TimeService(db_session)
        entry1, error1 = service.clock_in(test_user.id)
        entry2, error2 = service.clock_in(second_user.id)
        assert error1 is None
        assert error2 is None
        assert entry1.user_id == test_user.id
        assert entry2.user_id == second_user.id
    
    def test_can_clock_in_after_clocking_out(self, db_session, test_user):
        """Test that user can clock in again after clocking out."""
        service = TimeService(db_session)
        service.clock_in(test_user.id)
        service.clock_out(test_user.id)
        entry, error = service.clock_in(test_user.id)
        assert error is None
        assert entry is not None


class TestClockOut:
    """Test Requirement 2: Clock out functionality."""
    
    def test_clock_out_sets_end_time(self, db_session, test_user, active_time_entry):
        """Test that clock out sets the end time."""
        service = TimeService(db_session)
        entry, error = service.clock_out(test_user.id)
        assert error is None
        assert entry.end_at is not None
    
    def test_clock_out_entry_no_longer_active(self, db_session, test_user, active_time_entry):
        """Test that clocked out entry is no longer active."""
        service = TimeService(db_session)
        entry, _ = service.clock_out(test_user.id)
        assert entry.is_active is False
    
    def test_clock_out_with_notes(self, db_session, test_user, active_time_entry):
        """Test clock out with notes appends to existing notes."""
        service = TimeService(db_session)
        entry, _ = service.clock_out(test_user.id, notes="Finished for today")
        assert "Finished for today" in entry.notes
    
    def test_clock_out_without_active_entry_fails(self, db_session, test_user):
        """Test that clock out fails when no active entry exists."""
        service = TimeService(db_session)
        entry, error = service.clock_out(test_user.id)
        assert entry is None
        assert error == "Not clocked in. Please clock in first."
    
    def test_clock_out_sets_current_time(self, db_session, test_user, active_time_entry):
        """Test that clock out sets end_at to current time."""
        service = TimeService(db_session)
        before = datetime.now(timezone.utc).replace(tzinfo=None)
        entry, _ = service.clock_out(test_user.id)
        after = datetime.now(timezone.utc).replace(tzinfo=None)
        end_at = entry.end_at.replace(tzinfo=None) if entry.end_at.tzinfo else entry.end_at
        assert before <= end_at <= after


class TestTimeEntryStorage:
    """Test Requirement 4: Store time entries with start time, end time, and optional notes."""
    
    def test_time_entry_stores_start_time(self, db_session, test_user):
        """Test that time entry stores start time."""
        service = TimeService(db_session)
        entry, _ = service.clock_in(test_user.id)
        stored = db_session.query(TimeEntry).filter(TimeEntry.id == entry.id).first()
        assert stored.start_at is not None
    
    def test_time_entry_stores_end_time(self, db_session, test_user, active_time_entry):
        """Test that time entry stores end time after clock out."""
        service = TimeService(db_session)
        service.clock_out(test_user.id)
        stored = db_session.query(TimeEntry).filter(TimeEntry.id == active_time_entry.id).first()
        assert stored.end_at is not None
    
    def test_time_entry_stores_notes(self, db_session, test_user):
        """Test that time entry stores notes."""
        service = TimeService(db_session)
        entry, _ = service.clock_in(test_user.id, notes="Important work")
        stored = db_session.query(TimeEntry).filter(TimeEntry.id == entry.id).first()
        assert stored.notes == "Important work"
    
    def test_time_entry_notes_optional(self, db_session, test_user):
        """Test that notes are optional."""
        service = TimeService(db_session)
        entry, error = service.clock_in(test_user.id)
        assert error is None
        assert entry.notes is None


class TestTimeEntryDuration:
    """Test time entry duration calculations."""
    
    def test_duration_seconds_calculation(self, db_session, test_user):
        """Test duration in seconds is calculated correctly."""
        entry = TimeEntry(
            user_id=test_user.id,
            start_at=datetime.now(timezone.utc) - timedelta(hours=2),
            end_at=datetime.now(timezone.utc)
        )
        db_session.add(entry)
        db_session.commit()
        assert abs(entry.duration_seconds - 7200) < 5
    
    def test_duration_hours_calculation(self, db_session, test_user):
        """Test duration in hours is calculated correctly."""
        entry = TimeEntry(
            user_id=test_user.id,
            start_at=datetime.now(timezone.utc) - timedelta(hours=2),
            end_at=datetime.now(timezone.utc)
        )
        db_session.add(entry)
        db_session.commit()
        assert abs(entry.duration_hours - 2.0) < 0.01
    
    def test_duration_none_for_active_entry(self, db_session, test_user, active_time_entry):
        """Test that duration is None for active entries."""
        assert active_time_entry.duration_seconds is None
        assert active_time_entry.duration_hours is None


class TestGetTimeEntries:
    """Test Requirement 5: View personal timesheet."""
    
    def test_get_entries_returns_user_entries(self, db_session, test_user, completed_time_entries):
        """Test getting entries returns user's entries."""
        service = TimeService(db_session)
        entries, total = service.get_entries(test_user.id)
        assert total == len(completed_time_entries)
        assert all(e.user_id == test_user.id for e in entries)
    
    def test_get_entries_only_returns_own_entries(self, db_session, test_user, second_user, completed_time_entries):
        """Test that user only sees their own entries."""
        service = TimeService(db_session)
        entries, total = service.get_entries(second_user.id)
        assert total == 0
        assert len(entries) == 0
    
    def test_get_entries_with_date_filter(self, db_session, test_user, completed_time_entries):
        """Test date filtering on entries."""
        service = TimeService(db_session)
        today = datetime.now(timezone.utc).date()
        entries, total = service.get_entries(test_user.id, start_date=today, end_date=today)
        assert total <= len(completed_time_entries)
    
    def test_get_entries_pagination(self, db_session, test_user, completed_time_entries):
        """Test pagination of entries."""
        service = TimeService(db_session)
        entries, total = service.get_entries(test_user.id, page=1, per_page=2)
        assert len(entries) == 2
        assert total == len(completed_time_entries)


class TestUserStatus:
    """Test user clock-in status functionality."""
    
    def test_status_when_clocked_in(self, db_session, test_user, active_time_entry):
        """Test status shows clocked in when active entry exists."""
        service = TimeService(db_session)
        status = service.get_user_status(test_user.id)
        assert status["is_clocked_in"] is True
        assert status["active_entry"] is not None
    
    def test_status_when_not_clocked_in(self, db_session, test_user):
        """Test status shows not clocked in when no active entry."""
        service = TimeService(db_session)
        status = service.get_user_status(test_user.id)
        assert status["is_clocked_in"] is False
        assert status["active_entry"] is None

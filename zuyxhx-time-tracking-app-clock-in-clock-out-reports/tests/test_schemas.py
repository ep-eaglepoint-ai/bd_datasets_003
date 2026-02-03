"""Tests for Pydantic schemas.

Covers Requirements:
- Requirement 11: Basic error handling and validation
"""

import pytest
import sys
import os
from datetime import datetime, timezone, date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

from pydantic import ValidationError
from api.schemas import (
    UserCreate, UserLogin, UserResponse, Token,
    TimeEntryCreate, TimeEntryResponse, ClockInRequest, ClockOutRequest,
    DailySummary, WeeklySummary, DateRangeFilter
)


class TestUserSchemas:
    """Test user-related schemas."""
    
    def test_user_create_valid(self):
        """Test valid user creation schema."""
        user = UserCreate(email="test@example.com", password="password123")
        assert user.email == "test@example.com"
        assert user.password == "password123"
    
    def test_user_create_invalid_email(self):
        """Test that invalid email is rejected."""
        with pytest.raises(ValidationError):
            UserCreate(email="notanemail", password="password123")
    
    def test_user_create_short_password(self):
        """Test that short password is rejected."""
        with pytest.raises(ValidationError):
            UserCreate(email="test@example.com", password="short")
    
    def test_user_login_valid(self):
        """Test valid login schema."""
        login = UserLogin(email="test@example.com", password="password")
        assert login.email == "test@example.com"
    
    def test_token_schema(self):
        """Test token schema."""
        token = Token(access_token="abc123")
        assert token.access_token == "abc123"
        assert token.token_type == "bearer"


class TestTimeEntrySchemas:
    """Test time entry schemas."""
    
    def test_time_entry_create_valid(self):
        """Test valid time entry creation."""
        entry = TimeEntryCreate(
            start_at=datetime.now(timezone.utc),
            end_at=datetime.now(timezone.utc),
            notes="Test notes"
        )
        assert entry.start_at is not None
    
    def test_time_entry_create_without_end(self):
        """Test time entry without end time."""
        entry = TimeEntryCreate(start_at=datetime.now(timezone.utc))
        assert entry.end_at is None
    
    def test_clock_in_request_with_notes(self):
        """Test clock in request with notes."""
        request = ClockInRequest(notes="Starting work")
        assert request.notes == "Starting work"
    
    def test_clock_in_request_without_notes(self):
        """Test clock in request without notes."""
        request = ClockInRequest()
        assert request.notes is None
    
    def test_clock_out_request(self):
        """Test clock out request."""
        request = ClockOutRequest(notes="Ending work")
        assert request.notes == "Ending work"


class TestReportSchemas:
    """Test report schemas."""
    
    def test_daily_summary_schema(self):
        """Test daily summary schema."""
        summary = DailySummary(
            date=date.today(),
            total_hours=8.5,
            entry_count=3
        )
        assert summary.total_hours == 8.5
        assert summary.entry_count == 3
    
    def test_weekly_summary_schema(self):
        """Test weekly summary schema."""
        daily = DailySummary(date=date.today(), total_hours=8.0, entry_count=1)
        summary = WeeklySummary(
            week_start=date.today(),
            week_end=date.today(),
            total_hours=40.0,
            entry_count=5,
            daily_breakdown=[daily]
        )
        assert summary.total_hours == 40.0
        assert len(summary.daily_breakdown) == 1
    
    def test_date_range_filter(self):
        """Test date range filter schema."""
        filter = DateRangeFilter(
            start_date=date.today(),
            end_date=date.today()
        )
        assert filter.start_date is not None
    
    def test_date_range_filter_optional(self):
        """Test date range filter with optional fields."""
        filter = DateRangeFilter()
        assert filter.start_date is None
        assert filter.end_date is None


class TestValidation:
    """Test validation rules."""
    
    def test_email_validation(self):
        """Test email validation."""
        with pytest.raises(ValidationError):
            UserCreate(email="invalid", password="password123")
    
    def test_password_length_validation(self):
        """Test password length validation."""
        with pytest.raises(ValidationError):
            UserCreate(email="test@example.com", password="12345")
    
    def test_notes_max_length(self):
        """Test notes maximum length validation."""
        long_notes = "x" * 1001
        with pytest.raises(ValidationError):
            ClockInRequest(notes=long_notes)

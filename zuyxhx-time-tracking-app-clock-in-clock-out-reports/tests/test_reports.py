"""Tests for reports functionality.

Covers Requirements:
- Requirement 5: View personal timesheet with date filtering
- Requirement 6: Generate basic daily and weekly reports
- Requirement 7: Export time reports to CSV
"""

import pytest
import sys
import os
from datetime import datetime, timezone, timedelta, date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

from api.services import ReportsService
from api.models import TimeEntry


class TestDailyReports:
    """Test Requirement 6: Daily reports."""
    
    def test_get_daily_summaries(self, db_session, test_user, completed_time_entries):
        """Test generating daily summaries."""
        service = ReportsService(db_session)
        end_date = date.today()
        start_date = end_date - timedelta(days=7)
        summaries = service.get_daily_summaries(test_user.id, start_date, end_date)
        assert len(summaries) == 8
        assert all(hasattr(s, 'date') for s in summaries)
        assert all(hasattr(s, 'total_hours') for s in summaries)
    
    def test_daily_summary_hours_calculation(self, db_session, test_user):
        """Test that daily summary calculates hours correctly."""
        today = datetime.now(timezone.utc).replace(hour=9, minute=0, second=0, microsecond=0)
        entry = TimeEntry(
            user_id=test_user.id,
            start_at=today,
            end_at=today + timedelta(hours=4)
        )
        db_session.add(entry)
        db_session.commit()
        service = ReportsService(db_session)
        summaries = service.get_daily_summaries(test_user.id, today.date(), today.date())
        assert len(summaries) == 1
        assert abs(summaries[0].total_hours - 4.0) < 0.01
    
    def test_daily_summary_entry_count(self, db_session, test_user):
        """Test that daily summary counts entries correctly."""
        today = datetime.now(timezone.utc).replace(hour=9, minute=0, second=0, microsecond=0)
        for i in range(3):
            entry = TimeEntry(
                user_id=test_user.id,
                start_at=today + timedelta(hours=i*3),
                end_at=today + timedelta(hours=i*3 + 2)
            )
            db_session.add(entry)
        db_session.commit()
        service = ReportsService(db_session)
        summaries = service.get_daily_summaries(test_user.id, today.date(), today.date())
        assert summaries[0].entry_count == 3
    
    def test_daily_summary_empty_days(self, db_session, test_user):
        """Test that empty days show zero hours."""
        service = ReportsService(db_session)
        future_date = date.today() + timedelta(days=30)
        summaries = service.get_daily_summaries(test_user.id, future_date, future_date)
        assert len(summaries) == 1
        assert summaries[0].total_hours == 0
        assert summaries[0].entry_count == 0


class TestWeeklyReports:
    """Test Requirement 6: Weekly reports."""
    
    def test_get_weekly_summaries(self, db_session, test_user, completed_time_entries):
        """Test generating weekly summaries."""
        service = ReportsService(db_session)
        end_date = date.today()
        start_date = end_date - timedelta(days=14)
        summaries = service.get_weekly_summaries(test_user.id, start_date, end_date)
        assert len(summaries) >= 1
        assert all(hasattr(s, 'week_start') for s in summaries)
        assert all(hasattr(s, 'total_hours') for s in summaries)
    
    def test_weekly_summary_contains_daily_breakdown(self, db_session, test_user, completed_time_entries):
        """Test that weekly summary includes daily breakdown."""
        service = ReportsService(db_session)
        end_date = date.today()
        start_date = end_date - timedelta(days=7)
        summaries = service.get_weekly_summaries(test_user.id, start_date, end_date)
        assert len(summaries) >= 1
        assert hasattr(summaries[0], 'daily_breakdown')
        assert len(summaries[0].daily_breakdown) > 0


class TestReportSummary:
    """Test full report summary generation."""
    
    def test_get_summary_returns_all_data(self, db_session, test_user, completed_time_entries):
        """Test that summary returns all required data."""
        service = ReportsService(db_session)
        summary = service.get_summary(test_user.id)
        assert hasattr(summary, 'start_date')
        assert hasattr(summary, 'end_date')
        assert hasattr(summary, 'total_hours')
        assert hasattr(summary, 'total_entries')
        assert hasattr(summary, 'daily_summaries')
        assert hasattr(summary, 'weekly_summaries')
    
    def test_get_summary_default_date_range(self, db_session, test_user):
        """Test that summary uses default 30-day range."""
        service = ReportsService(db_session)
        summary = service.get_summary(test_user.id)
        expected_end = date.today()
        expected_start = expected_end - timedelta(days=30)
        assert summary.end_date == expected_end
        assert summary.start_date == expected_start
    
    def test_get_summary_custom_date_range(self, db_session, test_user):
        """Test summary with custom date range."""
        service = ReportsService(db_session)
        start = date.today() - timedelta(days=7)
        end = date.today()
        summary = service.get_summary(test_user.id, start, end)
        assert summary.start_date == start
        assert summary.end_date == end


class TestCSVExport:
    """Test Requirement 7: Export time reports to CSV."""
    
    def test_generate_csv_returns_string(self, db_session, test_user, completed_time_entries):
        """Test that CSV generation returns a string."""
        service = ReportsService(db_session)
        csv_content = service.generate_csv(test_user.id)
        assert isinstance(csv_content, str)
    
    def test_csv_has_header_row(self, db_session, test_user, completed_time_entries):
        """Test that CSV has header row."""
        service = ReportsService(db_session)
        csv_content = service.generate_csv(test_user.id)
        lines = csv_content.strip().split('\n')
        assert len(lines) >= 1
        header = lines[0]
        assert "Entry ID" in header
        assert "Date" in header
        assert "Start Time" in header
        assert "End Time" in header
        assert "Duration" in header
    
    def test_csv_contains_entries(self, db_session, test_user, completed_time_entries):
        """Test that CSV contains time entries."""
        service = ReportsService(db_session)
        csv_content = service.generate_csv(test_user.id)
        lines = csv_content.strip().split('\n')
        assert len(lines) > 1
    
    def test_csv_date_filter(self, db_session, test_user, completed_time_entries):
        """Test CSV with date filtering."""
        service = ReportsService(db_session)
        future = date.today() + timedelta(days=30)
        csv_content = service.generate_csv(test_user.id, start_date=future, end_date=future)
        lines = csv_content.strip().split('\n')
        assert len(lines) == 1
    
    def test_csv_only_completed_entries(self, db_session, test_user, active_time_entry):
        """Test that CSV only includes completed entries."""
        service = ReportsService(db_session)
        csv_content = service.generate_csv(test_user.id)
        lines = csv_content.strip().split('\n')
        assert len(lines) == 1


class TestDateFiltering:
    """Test Requirement 5: Date filtering for timesheets."""
    
    def test_filter_entries_by_start_date(self, db_session, test_user, completed_time_entries):
        """Test filtering entries by start date."""
        service = ReportsService(db_session)
        start = date.today() - timedelta(days=2)
        end = date.today()
        entries = service.get_completed_entries(test_user.id, start, end)
        for entry in entries:
            assert entry.start_at.date() >= start
    
    def test_filter_entries_by_end_date(self, db_session, test_user, completed_time_entries):
        """Test filtering entries by end date."""
        service = ReportsService(db_session)
        start = date.today() - timedelta(days=30)
        end = date.today() - timedelta(days=3)
        entries = service.get_completed_entries(test_user.id, start, end)
        for entry in entries:
            assert entry.start_at.date() <= end
    
    def test_filter_entries_only_returns_completed(self, db_session, test_user, active_time_entry, completed_time_entries):
        """Test that filter only returns completed entries."""
        service = ReportsService(db_session)
        start = date.today() - timedelta(days=30)
        end = date.today()
        entries = service.get_completed_entries(test_user.id, start, end)
        for entry in entries:
            assert entry.end_at is not None

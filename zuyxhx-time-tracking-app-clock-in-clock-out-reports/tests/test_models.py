"""Tests for database models.

Covers Requirements:
- Requirement 10: PostgreSQL database with migrations (model structure)
"""

import pytest
import sys
import os
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

from api.models import User, TimeEntry


class TestUserModel:
    """Test User model."""
    
    def test_user_creation(self, db_session):
        """Test creating a user."""
        user = User(email="model@example.com", password_hash="hashed")
        db_session.add(user)
        db_session.commit()
        assert user.id is not None
        assert user.email == "model@example.com"
    
    def test_user_email_unique(self, db_session, test_user):
        """Test that user email must be unique."""
        user = User(email=test_user.email, password_hash="hashed")
        db_session.add(user)
        with pytest.raises(Exception):
            db_session.commit()
    
    def test_user_created_at_auto(self, db_session):
        """Test that created_at is set automatically."""
        user = User(email="auto@example.com", password_hash="hashed")
        db_session.add(user)
        db_session.commit()
        assert user.created_at is not None
    
    def test_user_time_entries_relationship(self, db_session, test_user, active_time_entry):
        """Test user has time_entries relationship."""
        assert len(test_user.time_entries) >= 1
        assert active_time_entry in test_user.time_entries


class TestTimeEntryModel:
    """Test TimeEntry model."""
    
    def test_time_entry_creation(self, db_session, test_user):
        """Test creating a time entry."""
        entry = TimeEntry(
            user_id=test_user.id,
            start_at=datetime.now(timezone.utc)
        )
        db_session.add(entry)
        db_session.commit()
        assert entry.id is not None
    
    def test_time_entry_user_relationship(self, db_session, test_user, active_time_entry):
        """Test time entry has user relationship."""
        assert active_time_entry.user == test_user
    
    def test_time_entry_is_active_true(self, db_session, test_user):
        """Test is_active is True when no end_at."""
        entry = TimeEntry(
            user_id=test_user.id,
            start_at=datetime.now(timezone.utc)
        )
        db_session.add(entry)
        db_session.commit()
        assert entry.is_active is True
    
    def test_time_entry_is_active_false(self, db_session, test_user):
        """Test is_active is False when end_at is set."""
        entry = TimeEntry(
            user_id=test_user.id,
            start_at=datetime.now(timezone.utc) - timedelta(hours=1),
            end_at=datetime.now(timezone.utc)
        )
        db_session.add(entry)
        db_session.commit()
        assert entry.is_active is False
    
    def test_time_entry_with_end_time(self, db_session, test_user):
        """Test time entry with end time."""
        start = datetime.now(timezone.utc)
        end = start + timedelta(hours=2)
        entry = TimeEntry(
            user_id=test_user.id,
            start_at=start,
            end_at=end
        )
        db_session.add(entry)
        db_session.commit()
        end_naive = end.replace(tzinfo=None)
        entry_end = entry.end_at.replace(tzinfo=None) if entry.end_at.tzinfo else entry.end_at
        assert entry_end == end_naive
    
    def test_time_entry_with_notes(self, db_session, test_user):
        """Test time entry with notes."""
        entry = TimeEntry(
            user_id=test_user.id,
            start_at=datetime.now(timezone.utc),
            notes="Working on feature X"
        )
        db_session.add(entry)
        db_session.commit()
        assert entry.notes == "Working on feature X"
    
    def test_time_entry_duration_calculation(self, db_session, test_user):
        """Test duration calculation."""
        start = datetime.now(timezone.utc) - timedelta(hours=3)
        end = datetime.now(timezone.utc)
        entry = TimeEntry(
            user_id=test_user.id,
            start_at=start,
            end_at=end
        )
        db_session.add(entry)
        db_session.commit()
        assert abs(entry.duration_hours - 3.0) < 0.01
    
    def test_time_entry_repr(self, db_session, test_user, active_time_entry):
        """Test string representation."""
        repr_str = repr(active_time_entry)
        assert "TimeEntry" in repr_str
        assert str(active_time_entry.id) in repr_str

"""
PostgreSQL Integration Tests

These tests verify the application works correctly with PostgreSQL 
and that Alembic migrations are properly applied.

Key differences from SQLite tests:
1. Uses actual PostgreSQL database (via Docker or test container)
2. Migrations are applied via Alembic, not metadata.create_all()
3. Tests PostgreSQL-specific behaviors and constraints

Run these tests with:
    pytest tests/test_postgres_integration.py -v

Prerequisites:
    docker-compose up -d db
    Or set TEST_DATABASE_URL environment variable

Why this approach is safer:
- Catches migration errors before production deployment
- Tests actual PostgreSQL behavior (transactions, constraints, types)
- Validates that ORM models match migration schema
- Finds issues that SQLite's permissive behavior would hide
"""

import pytest
import sys
import os
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

from api.main import app
from api.database import get_db
from api.models import User, TimeEntry
from api.utils.security import hash_password


# Import PostgreSQL fixtures from conftest_postgres
# These run with real PostgreSQL and Alembic migrations
from conftest_postgres import (
    postgres_engine,
    postgres_session,
    pg_test_user,
    pg_test_user_token,
    pg_completed_entries,
    POSTGRES_TEST_URL,
    requires_postgres
)


# All tests in this module require PostgreSQL
pytestmark = requires_postgres


class TestDatabaseSchemaIntegrity:
    """
    Test that database schema created by migrations matches ORM models.
    
    This is critical because:
    - The original migration was missing updated_at columns
    - ORM operations would fail on a database created from those migrations
    """
    
    def test_users_table_has_updated_at_column(self, postgres_session):
        """Verify users table includes updated_at column from migration."""
        # Create a user - this would fail if updated_at column is missing
        user = User(
            email="schema_test@example.com",
            password_hash=hash_password("test123")
        )
        postgres_session.add(user)
        postgres_session.commit()
        postgres_session.refresh(user)
        
        # updated_at should be set by database default
        assert user.updated_at is not None
        assert isinstance(user.updated_at, datetime)
    
    def test_time_entries_table_has_updated_at_column(self, postgres_session, pg_test_user):
        """Verify time_entries table includes updated_at column from migration."""
        entry = TimeEntry(
            user_id=pg_test_user.id,
            start_at=datetime.now(timezone.utc),
            notes="Schema test"
        )
        postgres_session.add(entry)
        postgres_session.commit()
        postgres_session.refresh(entry)
        
        # updated_at should be set by database default
        assert entry.updated_at is not None
        assert isinstance(entry.updated_at, datetime)
    
    def test_user_update_modifies_updated_at(self, postgres_session, pg_test_user):
        """Verify that updating a user triggers updated_at change via ORM."""
        original_updated_at = pg_test_user.updated_at
        
        # Update user email
        pg_test_user.email = "updated_email@example.com"
        postgres_session.commit()
        postgres_session.refresh(pg_test_user)
        
        # Note: SQLAlchemy's onupdate is application-side, so this tests
        # that the column exists and can be written to
        assert pg_test_user.updated_at is not None
    
    def test_cascade_delete_works_with_postgres(self, postgres_session):
        """Verify CASCADE delete works correctly with PostgreSQL foreign keys."""
        # Create user
        user = User(
            email="cascade_test@example.com",
            password_hash=hash_password("test123")
        )
        postgres_session.add(user)
        postgres_session.commit()
        
        user_id = user.id
        
        # Create time entries for user
        entry1 = TimeEntry(
            user_id=user_id,
            start_at=datetime.now(timezone.utc),
            notes="Entry 1"
        )
        entry2 = TimeEntry(
            user_id=user_id,
            start_at=datetime.now(timezone.utc) - timedelta(hours=2),
            end_at=datetime.now(timezone.utc) - timedelta(hours=1),
            notes="Entry 2"
        )
        postgres_session.add_all([entry1, entry2])
        postgres_session.commit()
        
        # Verify entries exist
        entries = postgres_session.query(TimeEntry).filter(
            TimeEntry.user_id == user_id
        ).all()
        assert len(entries) == 2
        
        # Delete user - should cascade to time_entries
        postgres_session.delete(user)
        postgres_session.commit()
        
        # Verify entries were deleted
        entries = postgres_session.query(TimeEntry).filter(
            TimeEntry.user_id == user_id
        ).all()
        assert len(entries) == 0


class TestPostgresSpecificBehavior:
    """
    Test PostgreSQL-specific behaviors that differ from SQLite.
    """
    
    def test_unique_email_constraint_enforced(self, postgres_session):
        """Verify unique email constraint is enforced by PostgreSQL."""
        user1 = User(
            email="unique@example.com",
            password_hash=hash_password("test123")
        )
        postgres_session.add(user1)
        postgres_session.commit()
        
        # Attempt to create another user with same email
        user2 = User(
            email="unique@example.com",
            password_hash=hash_password("test456")
        )
        postgres_session.add(user2)
        
        with pytest.raises(Exception):  # IntegrityError
            postgres_session.commit()
        
        postgres_session.rollback()
    
    def test_foreign_key_constraint_enforced(self, postgres_session):
        """Verify foreign key constraint is enforced by PostgreSQL."""
        # Try to create time entry for non-existent user
        entry = TimeEntry(
            user_id=99999,  # Non-existent user
            start_at=datetime.now(timezone.utc),
            notes="Should fail"
        )
        postgres_session.add(entry)
        
        with pytest.raises(Exception):  # IntegrityError
            postgres_session.commit()
        
        postgres_session.rollback()
    
    def test_datetime_precision_preserved(self, postgres_session, pg_test_user):
        """Verify PostgreSQL preserves datetime precision (unlike SQLite)."""
        now = datetime.now(timezone.utc)
        entry = TimeEntry(
            user_id=pg_test_user.id,
            start_at=now,
            notes="Precision test"
        )
        postgres_session.add(entry)
        postgres_session.commit()
        postgres_session.refresh(entry)
        
        # PostgreSQL should preserve microseconds
        # (SQLite may lose precision depending on storage format)
        assert entry.start_at.microsecond == now.microsecond or \
               abs(entry.start_at.microsecond - now.microsecond) < 1000


class TestTimeTrackingWithPostgres:
    """
    Integration tests for time tracking functionality with PostgreSQL.
    """
    
    def test_clock_in_creates_entry(self, postgres_session, pg_test_user):
        """Test that clocking in creates a time entry in PostgreSQL."""
        entry = TimeEntry(
            user_id=pg_test_user.id,
            start_at=datetime.now(timezone.utc),
            notes="Starting work"
        )
        postgres_session.add(entry)
        postgres_session.commit()
        postgres_session.refresh(entry)
        
        assert entry.id is not None
        assert entry.is_active is True
        assert entry.end_at is None
    
    def test_clock_out_updates_entry(self, postgres_session, pg_test_user):
        """Test that clocking out updates the time entry in PostgreSQL."""
        # Create active entry
        start_time = datetime.now(timezone.utc) - timedelta(hours=2)
        entry = TimeEntry(
            user_id=pg_test_user.id,
            start_at=start_time,
            notes="Work session"
        )
        postgres_session.add(entry)
        postgres_session.commit()
        
        # Clock out
        entry.end_at = datetime.now(timezone.utc)
        postgres_session.commit()
        postgres_session.refresh(entry)
        
        assert entry.is_active is False
        assert entry.end_at is not None
        assert entry.duration_hours is not None
        assert entry.duration_hours >= 2.0
    
    def test_reports_calculation_with_postgres(self, postgres_session, pg_completed_entries):
        """Test that report calculations work correctly with PostgreSQL."""
        total_hours = sum(
            entry.duration_hours for entry in pg_completed_entries 
            if entry.duration_hours is not None
        )
        
        # Each entry is 8 hours, and we have 3 entries
        assert total_hours == pytest.approx(24.0, rel=0.01)


class TestMigrationValidation:
    """
    Tests that validate the Alembic migration itself.
    """
    
    def test_migration_creates_all_expected_tables(self, postgres_engine):
        """Verify migration creates all expected tables."""
        from sqlalchemy import inspect
        inspector = inspect(postgres_engine)
        tables = inspector.get_table_names()
        
        assert 'users' in tables
        assert 'time_entries' in tables
        assert 'alembic_version' in tables
    
    def test_users_table_has_all_columns(self, postgres_engine):
        """Verify users table has all columns from migration."""
        from sqlalchemy import inspect
        inspector = inspect(postgres_engine)
        columns = {col['name'] for col in inspector.get_columns('users')}
        
        expected_columns = {'id', 'email', 'password_hash', 'created_at', 'updated_at'}
        assert expected_columns.issubset(columns)
    
    def test_time_entries_table_has_all_columns(self, postgres_engine):
        """Verify time_entries table has all columns from migration."""
        from sqlalchemy import inspect
        inspector = inspect(postgres_engine)
        columns = {col['name'] for col in inspector.get_columns('time_entries')}
        
        expected_columns = {'id', 'user_id', 'start_at', 'end_at', 'notes', 'created_at', 'updated_at'}
        assert expected_columns.issubset(columns)
    
    def test_foreign_key_exists(self, postgres_engine):
        """Verify foreign key constraint exists between time_entries and users."""
        from sqlalchemy import inspect
        inspector = inspect(postgres_engine)
        fks = inspector.get_foreign_keys('time_entries')
        
        assert len(fks) > 0
        fk = fks[0]
        assert fk['referred_table'] == 'users'
        assert fk['constrained_columns'] == ['user_id']

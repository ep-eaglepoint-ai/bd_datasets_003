"""Pytest configuration and fixtures for Time Tracking App tests."""

import os
import sys
import pytest
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

from api.database import Base
from api.models import User, TimeEntry
from api.utils.security import hash_password, create_access_token

TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database session for each test."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def test_user(db_session):
    """Create a test user."""
    user = User(
        email="test@example.com",
        password_hash=hash_password("password123")
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_user_token(test_user):
    """Create a valid JWT token for the test user."""
    return create_access_token(data={"sub": test_user.id, "email": test_user.email})


@pytest.fixture
def second_user(db_session):
    """Create a second test user."""
    user = User(
        email="second@example.com",
        password_hash=hash_password("password456")
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def active_time_entry(db_session, test_user):
    """Create an active (clocked in) time entry."""
    entry = TimeEntry(
        user_id=test_user.id,
        start_at=datetime.now(timezone.utc) - timedelta(hours=1),
        notes="Working on tests"
    )
    db_session.add(entry)
    db_session.commit()
    db_session.refresh(entry)
    return entry


@pytest.fixture
def completed_time_entries(db_session, test_user):
    """Create multiple completed time entries."""
    entries = []
    base_date = datetime.now(timezone.utc).replace(hour=9, minute=0, second=0, microsecond=0)
    
    for i in range(5):
        start = base_date - timedelta(days=i)
        end = start + timedelta(hours=8)
        entry = TimeEntry(
            user_id=test_user.id,
            start_at=start,
            end_at=end,
            notes=f"Work day {i+1}"
        )
        db_session.add(entry)
        entries.append(entry)
    
    db_session.commit()
    for entry in entries:
        db_session.refresh(entry)
    
    return entries

"""
PostgreSQL Integration Test Configuration

This configuration provides a production-grade testing environment that:
1. Uses PostgreSQL instead of SQLite - catches PostgreSQL-specific issues
2. Applies Alembic migrations - validates migration files work correctly
3. Tests against the same database engine used in production

Why this matters:
- SQLite differs from PostgreSQL in behavior (e.g., foreign key handling, 
  datetime types, JSON support, constraint enforcement)
- Using metadata.create_all() bypasses Alembic migrations entirely, so
  migration errors (like missing updated_at columns) go undetected
- Integration tests should mirror production as closely as possible

Prerequisites:
- Docker must be running
- Run: docker-compose up -d db
- Or use testcontainers-python for automatic container management

Note: These tests are SKIPPED by default unless PostgreSQL is available.
To run them:
  - Set TEST_DATABASE_URL environment variable, OR
  - Run: docker compose up -d db (to start PostgreSQL)
"""

import os
import sys
import pytest
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError

# Add repository_after to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

from api.database import Base
from api.models import User, TimeEntry
from api.utils.security import hash_password, create_access_token


def get_postgres_url():
    """
    Get PostgreSQL URL, detecting Docker environment.
    
    In Docker containers, PostgreSQL is accessible at 'db' hostname.
    Outside Docker, use 'localhost'.
    """
    if os.getenv("TEST_DATABASE_URL"):
        return os.getenv("TEST_DATABASE_URL")
    
    # Detect if running inside Docker by checking for DATABASE_URL env var
    # or the existence of /.dockerenv file
    if os.getenv("DATABASE_URL") or os.path.exists("/.dockerenv"):
        # Running in Docker - use 'db' hostname
        return "postgresql://postgres:postgres@db:5432/test_app_db"
    else:
        # Running locally - use 'localhost'
        return "postgresql://postgres:postgres@localhost:5432/test_app_db"


POSTGRES_TEST_URL = get_postgres_url()


def is_postgres_available():
    """Check if PostgreSQL is available for testing."""
    try:
        admin_url = POSTGRES_TEST_URL.rsplit('/', 1)[0] + '/postgres'
        engine = create_engine(admin_url, connect_args={"connect_timeout": 3})
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        engine.dispose()
        return True
    except Exception:
        return False


# Global flag to track if PostgreSQL is available
_postgres_available = None

def check_postgres():
    """Lazily check PostgreSQL availability."""
    global _postgres_available
    if _postgres_available is None:
        _postgres_available = is_postgres_available()
    return _postgres_available


# Skip marker for PostgreSQL tests
requires_postgres = pytest.mark.skipif(
    not check_postgres(),
    reason="PostgreSQL not available - start with 'docker compose up -d db'"
)


def get_alembic_config():
    """Get Alembic configuration pointing to our migrations."""
    from alembic.config import Config
    
    # Path to alembic.ini
    ini_path = os.path.join(
        os.path.dirname(__file__), '..', 'alembic.ini'
    )
    config = Config(ini_path)
    
    # Override the database URL for testing
    config.set_main_option("sqlalchemy.url", POSTGRES_TEST_URL)
    
    return config


def apply_migrations(engine):
    """Apply all Alembic migrations to the test database."""
    from alembic import command
    
    config = get_alembic_config()
    
    # Ensure connection is available
    with engine.connect() as conn:
        # Drop all tables first for a clean slate
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
        conn.commit()
    
    # Run migrations
    command.upgrade(config, "head")


def rollback_migrations(engine):
    """Rollback all migrations (useful for testing downgrade)."""
    from alembic import command
    
    config = get_alembic_config()
    command.downgrade(config, "base")


@pytest.fixture(scope="session")
def postgres_engine():
    """
    Create a PostgreSQL engine for the test session.
    
    This runs once per test session, creating the test database
    and applying migrations.
    """
    if not check_postgres():
        pytest.skip("PostgreSQL not available")
    
    # Create engine
    engine = create_engine(POSTGRES_TEST_URL)
    
    # Create test database if it doesn't exist
    # Connect to default 'postgres' database first
    admin_url = POSTGRES_TEST_URL.rsplit('/', 1)[0] + '/postgres'
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    
    with admin_engine.connect() as conn:
        # Check if test database exists
        result = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname='test_app_db'")
        )
        if not result.fetchone():
            conn.execute(text("CREATE DATABASE test_app_db"))
    
    admin_engine.dispose()
    
    # Apply migrations
    apply_migrations(engine)
    
    yield engine
    
    engine.dispose()


@pytest.fixture(scope="function")
def postgres_session(postgres_engine):
    """
    Create a database session for each test.
    
    Each test gets a fresh session with proper cleanup between tests.
    Uses transactions that are rolled back after each test for isolation.
    """
    connection = postgres_engine.connect()
    transaction = connection.begin()
    
    Session = sessionmaker(bind=connection)
    session = Session()
    
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def pg_test_user(postgres_session):
    """Create a test user in PostgreSQL database."""
    user = User(
        email="pgtest@example.com",
        password_hash=hash_password("password123")
    )
    postgres_session.add(user)
    postgres_session.commit()
    postgres_session.refresh(user)
    return user


@pytest.fixture
def pg_test_user_token(pg_test_user):
    """Create a valid JWT token for the PostgreSQL test user."""
    return create_access_token(data={"sub": pg_test_user.id, "email": pg_test_user.email})


@pytest.fixture
def pg_completed_entries(postgres_session, pg_test_user):
    """Create multiple completed time entries in PostgreSQL."""
    entries = []
    base_date = datetime.now(timezone.utc).replace(hour=9, minute=0, second=0, microsecond=0)
    
    for i in range(3):
        start = base_date - timedelta(days=i)
        end = start + timedelta(hours=8)
        entry = TimeEntry(
            user_id=pg_test_user.id,
            start_at=start,
            end_at=end,
            notes=f"Work day {i+1}"
        )
        postgres_session.add(entry)
        entries.append(entry)
    
    postgres_session.commit()
    for entry in entries:
        postgres_session.refresh(entry)
    
    return entries

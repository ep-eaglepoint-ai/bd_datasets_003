import pytest
import asyncio
import sys
from pathlib import Path

# Add repository_after to the Python path
repo_after_path = Path(__file__).parent.parent / "repository_after"
sys.path.insert(0, str(repo_after_path))

from datetime import datetime, timedelta
from unittest.mock import Mock

from app.models import Participant, ScheduleRequest
from app.event_log import EventLog


@pytest.fixture
def sample_participants():
    return [
        Participant(id="1", name="Alice", email="alice@example.com"),
        Participant(id="2", name="Bob", email="bob@example.com"),
    ]


@pytest.fixture
def sample_schedule_request(sample_participants):
    return ScheduleRequest(
        duration_minutes=60,
        participants=sample_participants,
        temporal_rule="2 hours after the last cancellation",
        requested_at=datetime.now()
    )


@pytest.fixture
def event_log(tmp_path):
    """Provide an EventLog instance with temporary database"""
    db_path = tmp_path / "test_events.json"
    log = EventLog(str(db_path))
    yield log
    log.close()


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_workload_api():
    mock = Mock()
    mock.get_previous_day_workload.return_value = 75  # 75% workload
    return mock


@pytest.fixture
def mock_incident_api():
    mock = Mock()
    mock.get_last_incident_time.return_value = datetime.now() - timedelta(hours=18)
    return mock


@pytest.fixture
def mock_event_log(tmp_path):
    """Provide a simple mock event log used by paradox detector tests"""
    db_file = tmp_path / "mock_events.json"
    el = EventLog(str(db_file))
    # Ensure empty
    el.clear_events()
    yield el
    try:
        el.clear_events()
        el.close()
    except Exception:
        pass
import pytest
from datetime import datetime
from app.models import Participant, ScheduleRequest, HistoricalEvent, TimeReference


def test_participant_model():
    """Test Participant model creation"""
    participant = Participant(
        id="123",
        name="John Doe",
        email="john@example.com"
    )
    
    assert participant.id == "123"
    assert participant.name == "John Doe"
    assert participant.email == "john@example.com"


def test_schedule_request_validation():
    """Test ScheduleRequest validation"""
    # Valid request
    request = ScheduleRequest(
        duration_minutes=60,
        participants=[
            Participant(id="1", name="Alice", email="alice@example.com")
        ],
        temporal_rule="meeting rule"
    )
    assert request.duration_minutes == 60
    assert len(request.participants) == 1
    
    # Invalid: no participants
    with pytest.raises(ValueError):
        ScheduleRequest(
            duration_minutes=60,
            participants=[],
            temporal_rule="meeting rule"
        )
    
    # Invalid: duration too long
    with pytest.raises(ValueError):
        ScheduleRequest(
            duration_minutes=500,
            participants=[
                Participant(id="1", name="Alice", email="alice@example.com")
            ],
            temporal_rule="meeting rule"
        )


def test_historical_event_model():
    """Test HistoricalEvent model"""
    now = datetime.now()
    event = HistoricalEvent(
        event_type=TimeReference.LAST_CANCELLATION,
        timestamp=now,
        metadata={"reason": "test"}
    )
    
    assert event.event_type == TimeReference.LAST_CANCELLATION
    assert event.timestamp == now
    assert event.metadata["reason"] == "test"
import pytest
from datetime import datetime, timedelta
from app.models import HistoricalEvent, TimeReference
from app.event_log import EventLog


def test_event_log_creation(event_log):
    """Test creating an EventLog instance"""
    assert event_log is not None


def test_add_and_retrieve_event(event_log):
    """Test adding and retrieving events"""
    now = datetime.now()
    event = HistoricalEvent(
        event_type=TimeReference.LAST_CANCELLATION,
        timestamp=now,
        metadata={"reason": "test_reason"}
    )
    
    # Add event
    event_id = event_log.add_event(event)
    assert event_id is not None
    
    # Retrieve latest event
    latest_event = event_log.get_latest_event(TimeReference.LAST_CANCELLATION)
    assert latest_event is not None
    assert latest_event.event_type == TimeReference.LAST_CANCELLATION
    assert latest_event.metadata["reason"] == "test_reason"


def test_get_events_by_type(event_log):
    """Test retrieving events by type"""
    now = datetime.now()
    
    # Add multiple events
    for i in range(3):
        event = HistoricalEvent(
            event_type=TimeReference.LAST_CANCELLATION,
            timestamp=now - timedelta(hours=i),
            metadata={"index": i}
        )
        event_log.add_event(event)
    
    # Add different type event
    deployment_event = HistoricalEvent(
        event_type=TimeReference.LAST_DEPLOYMENT,
        timestamp=now,
        metadata={"version": "1.0"}
    )
    event_log.add_event(deployment_event)
    
    # Get cancellation events
    cancellations = event_log.get_events_by_type(TimeReference.LAST_CANCELLATION)
    assert len(cancellations) == 3
    
    # Should be sorted by timestamp descending (most recent first)
    assert cancellations[0].timestamp > cancellations[1].timestamp
    
    # Get deployment events
    deployments = event_log.get_events_by_type(TimeReference.LAST_DEPLOYMENT)
    assert len(deployments) == 1
    assert deployments[0].metadata["version"] == "1.0"


def test_get_two_most_recent_events(event_log):
    """Test getting two most recent events"""
    now = datetime.now()
    
    # Add three events
    for i in range(3):
        event = HistoricalEvent(
            event_type=TimeReference.LAST_CANCELLATION,
            timestamp=now - timedelta(hours=i),
            metadata={"index": i}
        )
        event_log.add_event(event)
    
    # Get two most recent events
    recent_events = event_log.get_two_most_recent_events(TimeReference.LAST_CANCELLATION)
    assert len(recent_events) == 2
    
    # Should be the two most recent (indices 0 and 1)
    assert recent_events[0].metadata["index"] == 0  # Most recent
    assert recent_events[1].metadata["index"] == 1  # Second most recent


def test_get_events_with_metadata_filter(event_log):
    """Test filtering events by metadata"""
    now = datetime.now()
    
    # Add events with different metadata
    event_log.add_event(HistoricalEvent(
        event_type=TimeReference.LAST_DEPLOYMENT,
        timestamp=now - timedelta(hours=3),
        metadata={"success": False, "version": "v1.0"}
    ))
    
    event_log.add_event(HistoricalEvent(
        event_type=TimeReference.LAST_DEPLOYMENT,
        timestamp=now - timedelta(hours=2),
        metadata={"success": True, "version": "v2.0"}
    ))
    
    event_log.add_event(HistoricalEvent(
        event_type=TimeReference.LAST_DEPLOYMENT,
        timestamp=now - timedelta(hours=1),
        metadata={"success": True, "version": "v2.1"}
    ))
    
    # Get successful deployments
    successful = event_log.get_events_by_type_and_metadata(
        TimeReference.LAST_DEPLOYMENT,
        {"success": True}
    )
    
    assert len(successful) == 2
    assert all(e.metadata["success"] is True for e in successful)
    assert successful[0].metadata["version"] == "v2.1"  # Most recent first
    
    # Get latest successful deployment
    latest_successful = event_log.get_latest_event_with_metadata(
        TimeReference.LAST_DEPLOYMENT,
        {"success": True}
    )
    
    assert latest_successful is not None
    assert latest_successful.metadata["success"] is True
    assert latest_successful.metadata["version"] == "v2.1"


def test_clear_events(event_log):
    """Test clearing events"""
    # Add events
    event = HistoricalEvent(
        event_type=TimeReference.LAST_CANCELLATION,
        timestamp=datetime.now(),
        metadata={}
    )
    event_log.add_event(event)
    
    # Clear all events
    event_log.clear_events()
    
    # Verify no events remain
    events = event_log.get_events_by_type(TimeReference.LAST_CANCELLATION)
    assert len(events) == 0


def test_seed_mock_data(event_log):
    """Test seeding mock data"""
    event_log.seed_mock_data()
    
    # Check that events were added
    cancellations = event_log.get_events_by_type(TimeReference.LAST_CANCELLATION)
    deployments = event_log.get_events_by_type(TimeReference.LAST_DEPLOYMENT)
    incidents = event_log.get_events_by_type(TimeReference.CRITICAL_INCIDENT)
    workload = event_log.get_events_by_type(TimeReference.PREVIOUS_DAY_WORKLOAD)
    
    assert len(cancellations) > 0
    assert len(deployments) > 0
    assert len(incidents) > 0
    assert len(workload) > 0
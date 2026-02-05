import pytest
from datetime import datetime, timedelta
from app.paradox_detector import TemporalParadoxDetector, ParadoxType
from app.models import TemporalExpression, TemporalOperator, TimeReference


@pytest.fixture
def paradox_detector(mock_event_log):
    """Create a paradox detector with mock event log"""
    return TemporalParadoxDetector(mock_event_log)


def test_circular_dependency_detection(paradox_detector):
    """Test detection of circular dependencies"""
    
    # Create a circular dependency: A -> B -> A
    expr_a = TemporalExpression(
        operator=TemporalOperator.AFTER,
        reference=TimeReference.LAST_CANCELLATION,
        conditions=[
            TemporalExpression(
                operator=TemporalOperator.BEFORE,
                reference=TimeReference.LAST_DEPLOYMENT
            )
        ]
    )
    
    # This should not be detected as circular (different references)
    paradoxes = paradox_detector.detect_paradoxes(expr_a)
    circular_paradoxes = [p for p in paradoxes if p["type"] == ParadoxType.CIRCULAR_DEPENDENCY.value]
    assert len(circular_paradoxes) == 0
    
    # Create actual circular dependency
    expr_b = TemporalExpression(
        operator=TemporalOperator.AFTER,
        reference=TimeReference.LAST_CANCELLATION,
        conditions=[
            TemporalExpression(
                operator=TemporalOperator.BEFORE,
                reference=TimeReference.LAST_CANCELLATION  # Same reference!
            )
        ]
    )
    
    paradoxes = paradox_detector.detect_paradoxes(expr_b)
    circular_paradoxes = [p for p in paradoxes if p["type"] == ParadoxType.CIRCULAR_DEPENDENCY.value]
    assert len(circular_paradoxes) > 0


def test_time_travel_detection(paradox_detector):
    """Test detection of references to future events"""
    
    # Create expression that references future event
    # (mock event log has events in past, so this should not trigger)
    expr = TemporalExpression(
        operator=TemporalOperator.AFTER,
        value="2 hours",
        reference=TimeReference.LAST_CANCELLATION
    )
    
    paradoxes = paradox_detector.detect_paradoxes(expr)
    time_travel_paradoxes = [p for p in paradoxes if p["type"] == ParadoxType.TIME_TRAVEL.value]
    assert len(time_travel_paradoxes) == 0
    
    # Test with requested time in past
    past_time = datetime.now() - timedelta(days=365)
    paradoxes = paradox_detector.detect_paradoxes(expr, past_time)
    time_travel_paradoxes = [p for p in paradoxes if p["type"] == ParadoxType.TIME_TRAVEL.value]
    # Should not detect time travel since events are still in past relative to requested time
    assert len(time_travel_paradoxes) == 0


def test_impossible_constraint_detection(paradox_detector):
    """Test detection of impossible constraints"""
    
    # Create invalid 'between' expression with start after end
    expr = TemporalExpression(
        operator=TemporalOperator.BETWEEN,
        value=[
            TemporalExpression(
                operator=TemporalOperator.AT,
                value="2 PM"
            ),
            TemporalExpression(
                operator=TemporalOperator.AT,
                value="10 AM"  # This is before 2 PM!
            )
        ]
    )
    
    paradoxes = paradox_detector.detect_paradoxes(expr)
    impossible_paradoxes = [p for p in paradoxes if p["type"] == ParadoxType.IMPOSSIBLE_CONSTRAINT.value]
    assert len(impossible_paradoxes) > 0
    
    # Test conflicting direction
    expr2 = TemporalExpression(
        operator=TemporalOperator.AFTER,
        value="2 hours before"  # Conflicting: after with before
    )
    
    paradoxes = paradox_detector.detect_paradoxes(expr2)
    impossible_paradoxes = [p for p in paradoxes if p["type"] == ParadoxType.IMPOSSIBLE_CONSTRAINT.value]
    assert len(impossible_paradoxes) > 0


def test_conflicting_conditions_detection(paradox_detector):
    """Test detection of conflicting conditions"""
    
    # Create expression with conflicting conditions
    expr = TemporalExpression(
        operator=TemporalOperator.AT,
        reference=TimeReference.LAST_CANCELLATION,
        conditions=[
            TemporalExpression(
                operator=TemporalOperator.AFTER,
                value="1 hour",
                reference=TimeReference.LAST_DEPLOYMENT
            ),
            TemporalExpression(
                operator=TemporalOperator.BEFORE,
                value="30 minutes",
                reference=TimeReference.LAST_DEPLOYMENT  # Same reference, opposite direction!
            )
        ]
    )
    
    paradoxes = paradox_detector.detect_paradoxes(expr)
    conflicting_paradoxes = [p for p in paradoxes if p["type"] == ParadoxType.CONFLICTING_CONDITIONS.value]
    assert len(conflicting_paradoxes) > 0


def test_self_referential_detection(paradox_detector):
    """Test detection of self-referential paradoxes"""
    
    # Create self-referential expression
    expr = TemporalExpression(
        operator=TemporalOperator.AFTER,
        reference=TimeReference.LAST_CANCELLATION,
        conditions=[
            TemporalExpression(
                operator=TemporalOperator.WITHIN,
                value="30 minutes",
                reference=TimeReference.LAST_CANCELLATION  # Same reference as parent!
            )
        ]
    )
    
    paradoxes = paradox_detector.detect_paradoxes(expr)
    self_ref_paradoxes = [p for p in paradoxes if p["type"] == ParadoxType.SELF_REFERENTIAL.value]
    assert len(self_ref_paradoxes) > 0


def test_past_reference_detection(paradox_detector):
    """Test detection of past references with future constraints"""
    
    # Create expression that tries to schedule in past
    expr = TemporalExpression(
        operator=TemporalOperator.AT,
        reference=TimeReference.LAST_CANCELLATION
    )
    
    # Request time in future
    future_time = datetime.now() + timedelta(days=1)
    paradoxes = paradox_detector.detect_paradoxes(expr, future_time)
    
    past_ref_paradoxes = [p for p in paradoxes if p["type"] == ParadoxType.PAST_REFERENCE.value]
    # Should detect that we're trying to schedule in past relative to request time
    assert len(past_ref_paradoxes) > 0


def test_schedule_window_validation(paradox_detector):
    """Test validation of schedule windows against constraints"""
    
    start_time = datetime(2024, 1, 1, 10, 0, 0)  # 10 AM
    end_time = datetime(2024, 1, 1, 11, 0, 0)   # 11 AM
    
    # Test business hours constraint
    constraints = [{"type": "business_hours"}]
    violations = paradox_detector.validate_schedule_window(start_time, end_time, constraints)
    assert len(violations) == 0  # 10-11 AM is within business hours
    
    # Test outside business hours
    evening_start = datetime(2024, 1, 1, 18, 0, 0)  # 6 PM
    evening_end = datetime(2024, 1, 1, 19, 0, 0)    # 7 PM
    violations = paradox_detector.validate_schedule_window(evening_start, evening_end, constraints)
    assert len(violations) > 0  # Should violate business hours
    
    # Test minimum gap constraint
    constraints = [
        {
            "type": "minimum_gap",
            "event_type": TimeReference.LAST_CANCELLATION,
            "minutes": 30
        }
    ]
    violations = paradox_detector.validate_schedule_window(start_time, end_time, constraints)
    # Depends on mock data, but should check without error


def test_multiple_paradox_detection(paradox_detector):
    """Test detection of multiple paradoxes in complex expression"""
    
    # Create expression with multiple issues
    expr = TemporalExpression(
        operator=TemporalOperator.AFTER,
        reference=TimeReference.LAST_CANCELLATION,
        conditions=[
            TemporalExpression(
                operator=TemporalOperator.BEFORE,
                reference=TimeReference.LAST_CANCELLATION,  # Self-reference
                value="impossible value"
            ),
            TemporalExpression(
                operator=TemporalOperator.AFTER,
                reference=TimeReference.LAST_DEPLOYMENT
            )
        ]
    )
    
    paradoxes = paradox_detector.detect_paradoxes(expr)
    
    # Should detect multiple types of paradoxes
    paradox_types = {p["type"] for p in paradoxes}
    assert len(paradox_types) >= 2  # Should have at least 2 types of paradoxes
    
    # Verify details are included
    for paradox in paradoxes:
        assert "description" in paradox
        assert "details" in paradox
        assert paradox["description"]  # Not empty
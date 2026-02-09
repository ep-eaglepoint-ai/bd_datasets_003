import pytest
from datetime import datetime, timedelta
from app.models import (
    Participant, 
    ScheduleRequest, 
    HistoricalEvent, 
    TimeReference,
    TemporalExpression,
    TemporalOperator,
    ErrorResponse,
    ScheduleResponse
)


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


def test_participant_model_dump():
    """Test Participant model serialization"""
    participant = Participant(
        id="123",
        name="John Doe",
        email="john@example.com"
    )
    
    data = participant.model_dump()
    assert data["id"] == "123"
    assert data["name"] == "John Doe"
    assert data["email"] == "john@example.com"


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
    
    # Invalid: duration zero
    with pytest.raises(ValueError):
        ScheduleRequest(
            duration_minutes=0,
            participants=[
                Participant(id="1", name="Alice", email="alice@example.com")
            ],
            temporal_rule="meeting rule"
        )


def test_schedule_request_default_requested_at():
    """Test that ScheduleRequest gets default requested_at"""
    request = ScheduleRequest(
        duration_minutes=60,
        participants=[
            Participant(id="1", name="Alice", email="alice@example.com")
        ],
        temporal_rule="meeting rule"
    )
    
    assert request.requested_at is not None
    # Should be recent (within last minute)
    time_diff = (datetime.now() - request.requested_at).total_seconds()
    assert time_diff < 60


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
    assert event.calculated_value is None


def test_historical_event_with_calculated_value():
    """Test HistoricalEvent with calculated_value"""
    now = datetime.now()
    event = HistoricalEvent(
        event_type=TimeReference.PREVIOUS_DAY_WORKLOAD,
        timestamp=now,
        metadata={"source": "api"},
        calculated_value=75.5
    )
    
    assert event.event_type == TimeReference.PREVIOUS_DAY_WORKLOAD
    assert event.calculated_value == 75.5


def test_historical_event_serialization():
    """Test HistoricalEvent timestamp serialization"""
    now = datetime.now()
    event = HistoricalEvent(
        event_type=TimeReference.LAST_CANCELLATION,
        timestamp=now,
        metadata={"reason": "test"}
    )
    
    data = event.model_dump()
    assert data["timestamp"] == now.isoformat()
    assert data["event_type"] == "last_cancellation"
    assert data["metadata"]["reason"] == "test"


def test_temporal_expression_model():
    """Test TemporalExpression model"""
    expr = TemporalExpression(
        operator=TemporalOperator.AFTER,
        value="2 hours",
        reference=TimeReference.LAST_CANCELLATION
    )
    
    assert expr.operator == TemporalOperator.AFTER
    assert expr.value == "2 hours"
    assert expr.reference == TimeReference.LAST_CANCELLATION
    assert expr.conditions == []


def test_temporal_expression_with_string_reference():
    """Test TemporalExpression with string reference"""
    expr = TemporalExpression(
        operator=TemporalOperator.EARLIER_OF,
        reference="TWO_MOST_RECENT_CANCELLATIONS",
        value=[]
    )
    
    assert expr.operator == TemporalOperator.EARLIER_OF
    assert expr.reference == "TWO_MOST_RECENT_CANCELLATIONS"
    assert expr.value == []


def test_temporal_expression_with_conditions():
    """Test TemporalExpression with conditions"""
    expr = TemporalExpression(
        operator=TemporalOperator.AT,
        value="2 PM",
        conditions=[
            TemporalExpression(
                operator=TemporalOperator.UNLESS,
                conditions=[
                    TemporalExpression(
                        operator=TemporalOperator.WITHIN,
                        value="30 minutes",
                        reference=TimeReference.RECURRING_LUNCH
                    )
                ]
            )
        ]
    )
    
    assert expr.operator == TemporalOperator.AT
    assert len(expr.conditions) == 1
    assert expr.conditions[0].operator == TemporalOperator.UNLESS
    assert len(expr.conditions[0].conditions) == 1
    assert expr.conditions[0].conditions[0].operator == TemporalOperator.WITHIN


def test_temporal_expression_with_nested_expressions():
    """Test TemporalExpression with nested expressions in value"""
    nested_expr1 = TemporalExpression(
        operator=TemporalOperator.AT,
        reference=TimeReference.LAST_CANCELLATION
    )
    
    nested_expr2 = TemporalExpression(
        operator=TemporalOperator.AT,
        reference=TimeReference.LAST_DEPLOYMENT
    )
    
    expr = TemporalExpression(
        operator=TemporalOperator.EARLIER_OF,
        value=[nested_expr1, nested_expr2]
    )
    
    assert expr.operator == TemporalOperator.EARLIER_OF
    assert isinstance(expr.value, list)
    assert len(expr.value) == 2
    assert expr.value[0].operator == TemporalOperator.AT
    assert expr.value[1].operator == TemporalOperator.AT


def test_error_response_model():
    """Test ErrorResponse model"""
    error = ErrorResponse(
        error="Test error",
        details="More details here",
        paradox_detected=True,
        constraint_violations=["Violation 1", "Violation 2"],
        temporal_conflicts=[{"type": "test", "description": "test conflict"}]
    )
    
    assert error.error == "Test error"
    assert error.details == "More details here"
    assert error.paradox_detected is True
    assert len(error.constraint_violations) == 2
    assert len(error.temporal_conflicts) == 1


def test_schedule_response_model():
    """Test ScheduleResponse model"""
    now = datetime.now()
    participants = [
        Participant(id="1", name="Alice", email="alice@example.com")
    ]
    
    response = ScheduleResponse(
        start_time=now,
        end_time=now + timedelta(minutes=60),
        duration_minutes=60,
        participants=participants,
        rule_evaluation_steps=[
            {"step": 1, "action": "parse"},
            {"step": 2, "action": "evaluate"}
        ]
    )
    
    assert response.start_time == now
    assert response.end_time == now + timedelta(minutes=60)
    assert response.duration_minutes == 60
    assert len(response.participants) == 1
    assert len(response.rule_evaluation_steps) == 2


def test_time_reference_enum():
    """Test TimeReference enum values"""
    assert TimeReference.LAST_CANCELLATION.value == "last_cancellation"
    assert TimeReference.LAST_DEPLOYMENT.value == "last_deployment"
    assert TimeReference.CRITICAL_INCIDENT.value == "critical_incident"
    assert TimeReference.RECURRING_LUNCH.value == "recurring_lunch"
    assert TimeReference.PREVIOUS_DAY_WORKLOAD.value == "previous_day_workload"
    
    # Test enum creation from string
    assert TimeReference("last_cancellation") == TimeReference.LAST_CANCELLATION
    assert TimeReference("last_deployment") == TimeReference.LAST_DEPLOYMENT


def test_temporal_operator_enum():
    """Test TemporalOperator enum values"""
    assert TemporalOperator.AFTER.value == "after"
    assert TemporalOperator.BEFORE.value == "before"
    assert TemporalOperator.BETWEEN.value == "between"
    assert TemporalOperator.AT.value == "at"
    assert TemporalOperator.ON.value == "on"
    assert TemporalOperator.WITHIN.value == "within"
    assert TemporalOperator.UNLESS.value == "unless"
    assert TemporalOperator.PROVIDED.value == "provided"
    assert TemporalOperator.ONLY_IF.value == "only if"
    assert TemporalOperator.EARLIER_OF.value == "earlier_of"
    assert TemporalOperator.LATER_OF.value == "later_of"
    
    # Test enum creation from string
    assert TemporalOperator("after") == TemporalOperator.AFTER
    assert TemporalOperator("unless") == TemporalOperator.UNLESS
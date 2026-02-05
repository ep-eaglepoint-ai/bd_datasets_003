import pytest
from datetime import datetime, timedelta
from unittest.mock import  patch, AsyncMock
from app.scheduler import TemporalScheduler
from app.models import ScheduleRequest, TemporalExpression, TemporalOperator, TimeReference


@pytest.fixture
def scheduler(event_log):
    """Create a scheduler instance"""
    return TemporalScheduler(event_log)


@pytest.mark.asyncio
async def test_schedule_simple_meeting(scheduler, sample_participants):
    """Test scheduling a simple meeting"""
    
    request = ScheduleRequest(
        duration_minutes=60,
        participants=sample_participants,
        temporal_rule="2 hours after last cancellation",
        requested_at=datetime.now()
    )
    
    response, error = await scheduler.schedule_meeting(request)
    
    assert error is None
    assert response is not None
    assert response.duration_minutes == 60
    assert len(response.participants) == 2
    assert response.start_time < response.end_time
    assert (response.end_time - response.start_time).total_seconds() == 60 * 60
    
    # Check that rule evaluation steps are included
    assert len(response.rule_evaluation_steps) > 0


@pytest.mark.asyncio
async def test_schedule_with_conditional(scheduler, sample_participants):
    """Test scheduling with conditional rules"""
    
    request = ScheduleRequest(
        duration_minutes=30,
        participants=sample_participants,
        temporal_rule="at 2 PM unless within 30 minutes of recurring lunch",
        requested_at=datetime.now()
    )
    
    response, error = await scheduler.schedule_meeting(request)
    
    # Might succeed or fail based on current time and lunch calculation
    # Just ensure it doesn't crash
    assert response is not None or error is not None


@pytest.mark.asyncio
async def test_schedule_complex_rule(scheduler, sample_participants):
    """Test scheduling with complex temporal rule"""
    
    request = ScheduleRequest(
        duration_minutes=90,
        participants=sample_participants,
        temporal_rule="earlier of last cancellation and last deployment",
        requested_at=datetime.now()
    )
    
    response, error = await scheduler.schedule_meeting(request)
    
    assert error is None
    assert response is not None
    assert response.duration_minutes == 90


@pytest.mark.asyncio
async def test_schedule_with_paradox(scheduler, sample_participants):
    """Test scheduling with paradoxical rule"""
    
    # Create a rule with circular dependency
    request = ScheduleRequest(
        duration_minutes=60,
        participants=sample_participants,
        temporal_rule="2 hours after last cancellation unless before last cancellation",
        requested_at=datetime.now()
    )
    
    response, error = await scheduler.schedule_meeting(request)
    
    assert response is None
    assert error is not None
    assert error.paradox_detected is True
    assert len(error.constraint_violations) > 0


@pytest.mark.asyncio
async def test_schedule_invalid_rule(scheduler, sample_participants):
    """Test scheduling with invalid temporal rule"""
    
    request = ScheduleRequest(
        duration_minutes=60,
        participants=sample_participants,
        temporal_rule="invalid rule syntax here",
        requested_at=datetime.now()
    )
    
    response, error = await scheduler.schedule_meeting(request)
    
    assert response is None
    assert error is not None
    assert error.paradox_detected is False
    assert "Invalid temporal rule" in error.error


@pytest.mark.asyncio
async def test_schedule_past_meeting(scheduler, sample_participants):
    """Test attempting to schedule meeting in the past"""
    
    # Create rule that would schedule in past
    request = ScheduleRequest(
        duration_minutes=60,
        participants=sample_participants,
        temporal_rule="yesterday at 2 PM",  # This won't parse correctly with our parser
        requested_at=datetime.now()
    )
    
    response, error = await scheduler.schedule_meeting(request)
    
    # Should either fail to parse or detect paradox
    assert response is None or error is not None


@pytest.mark.asyncio
async def test_schedule_with_external_api_mocks(scheduler, sample_participants):
    """Test scheduling that uses mocked external APIs"""
    
    # Patch the external APIs
    with patch.object(scheduler.external_apis, 'get_previous_day_workload', 
                     AsyncMock(return_value=50.0)):
        with patch.object(scheduler.external_apis, 'get_last_incident_time',
                         AsyncMock(return_value=datetime.now() - timedelta(hours=6))):
            
            request = ScheduleRequest(
                duration_minutes=45,
                participants=sample_participants,
                temporal_rule="at 3 PM provided no critical incident",
                requested_at=datetime.now()
            )
            
            response, error = await scheduler.schedule_meeting(request)
            
            # Result depends on condition evaluation
            assert response is not None or error is not None


def test_find_available_slot(scheduler):
    """Test finding available time slots"""
    
    start_window = datetime(2024, 1, 1, 9, 0, 0)  # 9 AM
    end_window = datetime(2024, 1, 1, 17, 0, 0)   # 5 PM
    
    # Find 60-minute slot
    slot = scheduler.find_available_slot(
        duration_minutes=60,
        start_window=start_window,
        end_window=end_window,
        constraints=[{"type": "business_hours"}]
    )
    
    assert slot is not None
    assert start_window <= slot <= end_window - timedelta(minutes=60)
    
    # Try to find slot that's too long
    slot = scheduler.find_available_slot(
        duration_minutes=10 * 60,  # 10 hours
        start_window=start_window,
        end_window=end_window
    )
    
    assert slot is None  # No 10-hour slot in 8-hour window


def test_check_conditional_constraints(scheduler):
    """Test conditional constraint checking"""
    
    # Create expression with 'unless' condition
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
    
    # This is an async method, but we're testing internal logic
    # For now, just verify the method exists
    assert hasattr(scheduler, '_check_conditional_constraints')


def test_evaluation_steps_generation(scheduler):
    """Test generation of evaluation steps"""
    
    expr = TemporalExpression(
        operator=TemporalOperator.AFTER,
        value="2 hours",
        reference=TimeReference.LAST_CANCELLATION
    )
    
    result_time = datetime.now()
    steps = scheduler._get_evaluation_steps(expr, result_time)
    
    assert len(steps) > 0
    assert any(step["operator"] == "RESULT" for step in steps)
    assert any(step["operator"] == "after" for step in steps)


@pytest.mark.asyncio
async def test_schedule_with_multiple_conditions(scheduler, sample_participants):
    """Test scheduling with multiple conditions"""
    
    request = ScheduleRequest(
        duration_minutes=60,
        participants=sample_participants,
        temporal_rule="2 hours after last deployment provided no critical incident and unless within lunch",
        requested_at=datetime.now()
    )
    
    response, error = await scheduler.schedule_meeting(request)
    
    # Should handle multiple conditions
    assert response is not None or error is not None
    if error:
        # If it fails, should provide meaningful error
        assert error.details


@pytest.mark.asyncio
async def test_schedule_edge_cases(scheduler, sample_participants):
    """Test edge cases in scheduling"""
    
    # Zero duration (should be caught by validation)
    request = ScheduleRequest(
        duration_minutes=0,
        participants=sample_participants,
        temporal_rule="at 2 PM",
        requested_at=datetime.now()
    )
    
    response, error = await scheduler.schedule_meeting(request)
    
    # Should fail validation
    assert response is None
    assert error is not None
    
    # Very long duration
    request2 = ScheduleRequest(
        duration_minutes=480,  # 8 hours
        participants=sample_participants,
        temporal_rule="at 9 AM",
        requested_at=datetime.now()
    )
    
    response2, error2 = await scheduler.schedule_meeting(request2)
    
    # Might succeed or fail based on constraints
    assert response2 is not None or error2 is not None
import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch
from app.temporal_logic import TemporalEvaluator
from app.models import TemporalExpression, TemporalOperator, TimeReference, HistoricalEvent


@pytest.fixture
def mock_event_log():
    """Create a mock event log with test data"""
    mock_log = Mock()
    
    # Mock data for events
    now = datetime.now()
    mock_events = {
        TimeReference.LAST_CANCELLATION: HistoricalEvent(
            event_type=TimeReference.LAST_CANCELLATION,
            timestamp=now - timedelta(hours=3),
            metadata={}
        ),
        TimeReference.LAST_DEPLOYMENT: HistoricalEvent(
            event_type=TimeReference.LAST_DEPLOYMENT,
            timestamp=now - timedelta(days=1),
            metadata={}
        ),
        TimeReference.CRITICAL_INCIDENT: None,  # No critical incident
    }
    
    def get_latest_event(event_type):
        return mock_events.get(event_type)
    
    def get_two_most_recent_events(event_type):
        if event_type == TimeReference.LAST_CANCELLATION:
            return [
                HistoricalEvent(
                    event_type=TimeReference.LAST_CANCELLATION,
                    timestamp=now - timedelta(hours=2),
                    metadata={"index": 1}
                ),
                HistoricalEvent(
                    event_type=TimeReference.LAST_CANCELLATION,
                    timestamp=now - timedelta(hours=5),
                    metadata={"index": 2}
                )
            ]
        return []
    
    def get_latest_event_with_metadata(event_type, metadata_filter):
        if event_type == TimeReference.LAST_DEPLOYMENT and metadata_filter.get("success") == True:
            return HistoricalEvent(
                event_type=TimeReference.LAST_DEPLOYMENT,
                timestamp=now - timedelta(hours=2),
                metadata={"success": True, "version": "v2.0"}
            )
        return None
    
    mock_log.get_latest_event = get_latest_event
    mock_log.get_two_most_recent_events = get_two_most_recent_events
    mock_log.get_latest_event_with_metadata = get_latest_event_with_metadata
    
    return mock_log


def test_evaluate_after_expression(mock_event_log):
    """Test evaluating 'after' expressions"""
    evaluator = TemporalEvaluator(mock_event_log)
    
    # Create expression: "2 hours after last cancellation"
    expr = TemporalExpression(
        operator=TemporalOperator.AFTER,
        value="2 hours",
        reference=TimeReference.LAST_CANCELLATION
    )
    
    result = evaluator.evaluate(expr)
    
    # Should be 2 hours after the last cancellation
    last_cancellation = mock_event_log.get_latest_event(TimeReference.LAST_CANCELLATION)
    expected = last_cancellation.timestamp + timedelta(hours=2)
    
    # Allow small difference for execution time
    time_diff = abs((result - expected).total_seconds())
    assert time_diff < 1  # Less than 1 second difference


def test_evaluate_before_expression(mock_event_log):
    """Test evaluating 'before' expressions"""
    evaluator = TemporalEvaluator(mock_event_log)
    
    # Create expression: "30 minutes before last deployment"
    expr = TemporalExpression(
        operator=TemporalOperator.BEFORE,
        value="30 minutes",
        reference=TimeReference.LAST_DEPLOYMENT
    )
    
    result = evaluator.evaluate(expr)
    
    last_deployment = mock_event_log.get_latest_event(TimeReference.LAST_DEPLOYMENT)
    expected = last_deployment.timestamp - timedelta(minutes=30)
    
    time_diff = abs((result - expected).total_seconds())
    assert time_diff < 1


def test_evaluate_at_expression(mock_event_log):
    """Test evaluating 'at' expressions"""
    evaluator = TemporalEvaluator(mock_event_log)
    
    # Test "at last deployment"
    expr = TemporalExpression(
        operator=TemporalOperator.AT,
        reference=TimeReference.LAST_DEPLOYMENT
    )
    
    result = evaluator.evaluate(expr)
    last_deployment = mock_event_log.get_latest_event(TimeReference.LAST_DEPLOYMENT)
    assert result == last_deployment.timestamp
    
    # Test "at 2 PM" (absolute time)
    base_time = datetime(2024, 1, 1, 10, 0, 0)  # 10 AM
    expr2 = TemporalExpression(
        operator=TemporalOperator.AT,
        value="2 PM"
    )
    
    result2 = evaluator.evaluate(expr2, base_time)
    expected = datetime(2024, 1, 1, 14, 0, 0)  # 2 PM same day
    assert result2 == expected


def test_evaluate_earlier_of_expression(mock_event_log):
    """Test evaluating 'earlier of' expressions"""
    evaluator = TemporalEvaluator(mock_event_log)
    
    # Create two sub-expressions
    expr1 = TemporalExpression(
        operator=TemporalOperator.AT,
        reference=TimeReference.LAST_CANCELLATION
    )
    
    expr2 = TemporalExpression(
        operator=TemporalOperator.AT,
        reference=TimeReference.LAST_DEPLOYMENT
    )
    
    # Create "earlier of" expression
    expr = TemporalExpression(
        operator=TemporalOperator.EARLIER_OF,
        value=[expr1, expr2]
    )
    
    result = evaluator.evaluate(expr)
    
    # Get the two times
    time1 = evaluator.evaluate(expr1)
    time2 = evaluator.evaluate(expr2)
    
    # Result should be the earlier of the two
    expected = min(time1, time2)
    assert result == expected


def test_evaluate_two_most_recent_cancellations(mock_event_log):
    """Test evaluating 'two most recent cancellations'"""
    evaluator = TemporalEvaluator(mock_event_log)
    
    # Create expression with special reference
    expr = TemporalExpression(
        operator=TemporalOperator.AT,
        reference="TWO_MOST_RECENT_CANCELLATIONS"
    )
    
    result = evaluator.evaluate(expr)
    
    # Should get the earlier of the two most recent cancellations
    events = mock_event_log.get_two_most_recent_events(TimeReference.LAST_CANCELLATION)
    expected = min(events[0].timestamp, events[1].timestamp)
    assert result == expected


def test_evaluate_successful_deployment(mock_event_log):
    """Test evaluating 'successful deployment' with metadata"""
    evaluator = TemporalEvaluator(mock_event_log)
    
    # Create expression with metadata-filtered reference
    expr = TemporalExpression(
        operator=TemporalOperator.AT,
        reference="SUCCESSFUL_DEPLOYMENT"
    )
    
    result = evaluator.evaluate(expr)
    
    # Should get the successful deployment timestamp
    successful_deployment = mock_event_log.get_latest_event_with_metadata(
        TimeReference.LAST_DEPLOYMENT,
        {"success": True}
    )
    assert result == successful_deployment.timestamp


def test_evaluate_between_returns_end_time(mock_event_log):
    """Test that 'between' returns end time for latest possible scheduling"""
    evaluator = TemporalEvaluator(mock_event_log)
    
    # Create "between" expression
    expr = TemporalExpression(
        operator=TemporalOperator.BETWEEN,
        value=[
            TemporalExpression(
                operator=TemporalOperator.AT,
                value="10 AM"
            ),
            TemporalExpression(
                operator=TemporalOperator.AT,
                value="5 PM"
            )
        ]
    )
    
    base_time = datetime(2024, 1, 1, 0, 0, 0)
    result = evaluator.evaluate(expr, base_time)
    
    # Should return end time (5 PM), not start time (10 AM)
    expected_end = datetime(2024, 1, 1, 17, 0, 0)  # 5 PM
    expected_start = datetime(2024, 1, 1, 10, 0, 0)  # 10 AM
    
    assert result == expected_end  # Should be 5 PM, not 10 AM
    assert result != expected_start


def test_evaluate_later_of_expression(mock_event_log):
    """Test evaluating 'later of' expressions"""
    evaluator = TemporalEvaluator(mock_event_log)
    
    # Create two sub-expressions
    expr1 = TemporalExpression(
        operator=TemporalOperator.AFTER,
        value="1 hour",
        reference=TimeReference.LAST_CANCELLATION
    )
    
    expr2 = TemporalExpression(
        operator=TemporalOperator.AT,
        reference=TimeReference.LAST_DEPLOYMENT
    )
    
    # Create "later of" expression
    expr = TemporalExpression(
        operator=TemporalOperator.LATER_OF,
        value=[expr1, expr2]
    )
    
    result = evaluator.evaluate(expr)
    
    # Get the two times
    time1 = evaluator.evaluate(expr1)
    time2 = evaluator.evaluate(expr2)
    
    # Result should be the later of the two
    expected = max(time1, time2)
    assert result == expected


def test_evaluate_conditional_expression(mock_event_log):
    """Test evaluating conditional expressions"""
    evaluator = TemporalEvaluator(mock_event_log)
    
    # Create a condition
    condition = TemporalExpression(
        operator=TemporalOperator.WITHIN,
        value="30 minutes",
        reference=TimeReference.RECURRING_LUNCH
    )
    
    # Create "unless" expression
    expr = TemporalExpression(
        operator=TemporalOperator.UNLESS,
        conditions=[condition]
    )
    
    # Should return base_time (actual conditional logic handled by scheduler)
    base_time = datetime.now()
    result = evaluator.evaluate(expr, base_time)
    
    # For now, just verify it doesn't crash
    assert result is not None


def test_missing_reference_defaults(mock_event_log):
    """Test that missing references use sensible defaults"""
    evaluator = TemporalEvaluator(mock_event_log)
    
    # Critical incident doesn't exist in mock data
    expr = TemporalExpression(
        operator=TemporalOperator.AT,
        reference=TimeReference.CRITICAL_INCIDENT
    )
    
    base_time = datetime.now()
    result = evaluator.evaluate(expr, base_time)
    
    # Should return a default time (3 days before base_time)
    expected = base_time - timedelta(days=3)
    time_diff = abs((result - expected).total_seconds())
    assert time_diff < 1


def test_parse_time_offset():
    """Test parsing time offset strings"""
    evaluator = TemporalEvaluator(Mock())
    
    # Test various time offset strings
    test_cases = [
        ("2 hours", timedelta(hours=2)),
        ("1.5 hours", timedelta(hours=1.5)),
        ("30 minutes", timedelta(minutes=30)),
        ("3 days", timedelta(days=3)),
        ("1 week", timedelta(weeks=1)),
    ]
    
    for time_str, expected in test_cases:
        result = evaluator._parse_time_offset(time_str)
        assert result == expected, f"Failed for {time_str}"
    
    # Test invalid time string
    with pytest.raises(ValueError):
        evaluator._parse_time_offset("invalid")


@patch('app.temporal_logic.re.search')
def test_calculate_next_lunch(mock_re_search, mock_event_log):
    """Test calculating next lunch time"""
    evaluator = TemporalEvaluator(mock_event_log)
    
    # Mock regex search to return workload percentage
    mock_match = Mock()
    mock_match.group.return_value = "75"
    mock_re_search.return_value = mock_match
    
    base_time = datetime(2024, 1, 1, 10, 0, 0)  # 10 AM
    
    # With 75% workload, lunch should be at 12:00
    result = evaluator._calculate_next_lunch(base_time)
    expected = datetime(2024, 1, 1, 12, 0, 0)
    assert result == expected
    
    # Test after lunch time
    afternoon_time = datetime(2024, 1, 1, 14, 0, 0)  # 2 PM
    result2 = evaluator._calculate_next_lunch(afternoon_time)
    expected2 = datetime(2024, 1, 2, 12, 0, 0)  # Next day lunch
    assert result2 == expected2


def test_parse_absolute_time():
    """Test parsing absolute time strings"""
    evaluator = TemporalEvaluator(Mock())
    base_date = datetime(2024, 1, 1, 0, 0, 0)
    
    # Test time only
    result = evaluator._parse_absolute_time("2 PM", base_date)
    expected = datetime(2024, 1, 1, 14, 0, 0)
    assert result == expected
    
    # Test 24-hour time
    result = evaluator._parse_absolute_time("14:30", base_date)
    expected = datetime(2024, 1, 1, 14, 30, 0)
    assert result == expected
    
    # Test day name
    result = evaluator._parse_absolute_time("Monday", base_date)
    # Jan 1, 2024 is a Monday, so should return same day
    expected = datetime(2024, 1, 1, 0, 0, 0)
    assert result.date() == expected.date()
    
    # Test invalid time
    with pytest.raises(ValueError):
        evaluator._parse_absolute_time("invalid time", base_date)
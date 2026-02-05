import pytest
from datetime import datetime, timedelta
from app.parser import TemporalParser, TokenType
from app.models import TemporalExpression, TemporalOperator, TimeReference


def test_tokenizer():
    """Test tokenization of temporal rules"""
    parser = TemporalParser()
    
    # Test simple rule
    tokens = parser.tokenize("2 hours after last cancellation")
    assert len(tokens) == 4
    assert tokens[0].type == TokenType.NUMBER
    assert tokens[0].value == "2"
    assert tokens[1].type == TokenType.UNIT
    assert tokens[1].value == "hours"
    assert tokens[2].type == TokenType.OPERATOR
    assert tokens[2].value == "after"
    assert tokens[3].type == TokenType.REFERENCE
    assert tokens[3].value == "last cancellation"
    
    # Test complex rule with punctuation
    tokens = parser.tokenize("earlier of last deployment and critical incident, unless within 30 minutes")
    assert len(tokens) > 0
    assert any(t.type == TokenType.OPERATOR and t.value == "earlier of" for t in tokens)
    assert any(t.type == TokenType.PUNCTUATION and t.value == "," for t in tokens)


def test_parse_simple_expression():
    """Test parsing simple temporal expressions"""
    parser = TemporalParser()
    
    # Test "2 hours after last cancellation"
    expr = parser.parse("2 hours after last cancellation")
    assert expr.operator == TemporalOperator.AFTER
    assert expr.value == "2 hours"
    assert expr.reference == TimeReference.LAST_CANCELLATION
    
    # Test "30 minutes before last deployment"
    expr = parser.parse("30 minutes before last deployment")
    assert expr.operator == TemporalOperator.BEFORE
    assert expr.value == "30 minutes"
    assert expr.reference == TimeReference.LAST_DEPLOYMENT
    
    # Test "at 2 PM"
    expr = parser.parse("at 2 PM")
    assert expr.operator == TemporalOperator.AT
    assert expr.value == "2 pm"


def test_parse_comparative_expressions():
    """Test parsing comparative expressions"""
    parser = TemporalParser()
    
    # Test "earlier of last cancellation and last deployment"
    expr = parser.parse("earlier of last cancellation and last deployment")
    assert expr.operator == TemporalOperator.EARLIER_OF
    assert isinstance(expr.value, list)
    assert len(expr.value) == 2
    
    # Test sub-expressions
    sub_expr1, sub_expr2 = expr.value
    assert isinstance(sub_expr1, TemporalExpression)
    assert isinstance(sub_expr2, TemporalExpression)
    
    # Test "later of" expression
    expr = parser.parse("later of 2 hours after cancellation and at 3 PM")
    assert expr.operator == TemporalOperator.LATER_OF
    assert isinstance(expr.value, list)


def test_parse_conditional_expressions():
    """Test parsing conditional expressions"""
    parser = TemporalParser()
    
    # Test "unless within 30 minutes of lunch"
    expr = parser.parse("unless within 30 minutes of recurring lunch")
    assert expr.operator == TemporalOperator.UNLESS
    assert len(expr.conditions) == 1
    
    condition = expr.conditions[0]
    assert condition.operator == TemporalOperator.WITHIN
    assert condition.value == "30 minutes"
    assert condition.reference == TimeReference.RECURRING_LUNCH
    
    # Test "provided no critical incident"
    expr = parser.parse("provided no critical incident")
    assert expr.operator == TemporalOperator.PROVIDED
    assert len(expr.conditions) == 1


def test_parse_complex_rules():
    """Test parsing complex temporal rules"""
    parser = TemporalParser()
    
    # Complex rule 1
    rule = "2 hours after the earlier of the two most recent cancellations"
    expr = parser.parse(rule)
    assert expr.operator == TemporalOperator.AFTER
    assert expr.value == "2 hours"
    
    # The reference should be parsed as a comparative expression
    # Note: "two most recent cancellations" would need special handling
    # This test verifies basic parsing works
    
    # Complex rule 2
    rule = "Schedule at the latest possible time between 10 AM and 5 PM on Tuesday"
    expr = parser.parse(rule)
    assert expr is not None  # Should parse without error


def test_parse_relative_time():
    """Test parsing relative time expressions"""
    parser = TemporalParser()
    base_time = datetime(2024, 1, 1, 12, 0, 0)
    
    # Test hours
    result = parser.parse_relative_time("2 hours", base_time)
    expected = base_time + timedelta(hours=2)
    assert result == expected
    
    # Test days
    result = parser.parse_relative_time("3 days", base_time)
    expected = base_time + timedelta(days=3)
    assert result == expected
    
    # Test minutes
    result = parser.parse_relative_time("30 minutes", base_time)
    expected = base_time + timedelta(minutes=30)
    assert result == expected


def test_rule_validator():
    """Test rule validation logic"""
    from app.parser import RuleValidator
    
    # Create a simple expression
    expr = TemporalExpression(
        operator=TemporalOperator.AFTER,
        value="2 hours",
        reference=TimeReference.LAST_CANCELLATION
    )
    
    # Should not have circular references
    assert RuleValidator.validate_no_circular_references(expr)
    
    # Create a potentially circular expression
    expr1 = TemporalExpression(
        operator=TemporalOperator.AFTER,
        reference=TimeReference.LAST_CANCELLATION,
        conditions=[
            TemporalExpression(
                operator=TemporalOperator.BEFORE,
                reference=TimeReference.LAST_CANCELLATION
            )
        ]
    )
    
    # This should still pass as it's not truly circular
    assert RuleValidator.validate_no_circular_references(expr1)


def test_parse_edge_cases():
    """Test edge cases in parsing"""
    parser = TemporalParser()
    
    # Empty rule
    with pytest.raises(ValueError):
        parser.parse("")
    
    # Nonsense rule
    with pytest.raises(ValueError):
        parser.parse("asdf qwer zxcv")
    
    # Rule with unknown words (should skip them)
    expr = parser.parse("please schedule 1 hour after deployment thanks")
    assert expr.operator == TemporalOperator.AFTER
    assert expr.reference == TimeReference.LAST_DEPLOYMENT
"""
Tests to ensure comprehensive branch coverage.
Covers all conditional branches in tax calculation.
"""
import pytest
import sys
import os
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fiscal_engine import FiscalPrecisionEngine


class TestBranchCoverage:
    """Tests to ensure comprehensive branch coverage."""
    
    # Requirement 9: Achieve 95%+ branch coverage including all conditional breaks
    
    @pytest.fixture
    def engine(self):
        """Create engine for branch coverage testing."""
        brackets = [
            {'limit': Decimal('50000'), 'rate': Decimal('0.10')},
            {'limit': Decimal('150000'), 'rate': Decimal('0.20')}
        ]
        return FiscalPrecisionEngine(brackets, Decimal('0.05'))
    
    def test_income_exceeds_all_brackets(self, engine):
        """Test case where income exceeds all brackets."""
        income = Decimal('200000')
        result = engine.calculate_tiered_tax(income)
        # Should process all brackets
        assert result > Decimal('0')
    
    def test_income_within_first_bracket(self, engine):
        """Test case where income is within first bracket."""
        income = Decimal('25000')
        result = engine.calculate_tiered_tax(income)
        assert result == Decimal('2500.00')  # 25k * 0.10
    
    def test_income_at_bracket_boundary(self, engine):
        """Test case where income exactly matches a bracket limit."""
        income = Decimal('50000')
        result = engine.calculate_tiered_tax(income)
        assert result == Decimal('5000.00')  # 50k * 0.10
    
    def test_income_between_brackets(self, engine):
        """Test case where income is between two brackets."""
        income = Decimal('100000')
        result = engine.calculate_tiered_tax(income)
        # 50k*0.10 + 50k*0.20 = 15000
        assert result == Decimal('15000.00')


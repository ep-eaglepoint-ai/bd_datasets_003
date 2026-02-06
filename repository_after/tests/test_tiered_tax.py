"""
Test suite for calculate_tiered_tax method.
Covers parameterized testing, progressive tax, and rounding precision.
"""
import pytest
import sys
import os
from decimal import Decimal, ROUND_HALF_UP

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fiscal_engine import FiscalPrecisionEngine


class TestTieredTaxCalculation:
    """Test suite for calculate_tiered_tax method."""
    
    @pytest.fixture
    def engine(self):
        """Create engine with standard tax brackets."""
        brackets = [
            {'limit': Decimal('50000'), 'rate': Decimal('0.10')},
            {'limit': Decimal('150000'), 'rate': Decimal('0.20')},
            {'limit': Decimal('500000'), 'rate': Decimal('0.30')}
        ]
        return FiscalPrecisionEngine(brackets, Decimal('0.05'))
    
    # Requirement 1: Parameterized testing for bracket limits
    @pytest.mark.parametrize("income,expected_tax", [
        # Exactly at bracket limits
        (Decimal('50000'), Decimal('5000.00')),  # 50k * 0.10
        (Decimal('150000'), Decimal('25000.00')),  # 50k*0.10 + 100k*0.20
        (Decimal('500000'), Decimal('130000.00')),  # 50k*0.10 + 100k*0.20 + 350k*0.30
        
        # Slightly below bracket limits (will round to nearest cent)
        (Decimal('49999.99'), Decimal('5000.00')),  # Just below 50k: 49999.99 * 0.10 = 4999.999 -> 5000.00
        (Decimal('149999.99'), Decimal('25000.00')),  # Just below 150k: rounds to 25000.00
        (Decimal('499999.99'), Decimal('130000.00')),  # Just below 500k: rounds to 130000.00
        
        # Slightly above bracket limits
        (Decimal('50000.01'), Decimal('5000.00')),  # Just above 50k
        (Decimal('150000.01'), Decimal('25000.00')),  # Just above 150k
        
        # Significantly above (implementation caps at highest bracket)
        (Decimal('1000000'), Decimal('130000.00')),  # 50k*0.10 + 100k*0.20 + 350k*0.30 (stops at 500k bracket)
        
        # Edge cases
        (Decimal('0'), Decimal('0.00')),
        (Decimal('1'), Decimal('0.10')),  # 1 * 0.10
        (Decimal('-100'), Decimal('0.00')),  # Negative income
    ])
    def test_tiered_tax_parameterized(self, engine, income, expected_tax):
        """Test tiered tax calculation with various income levels."""
        result = engine.calculate_tiered_tax(income)
        assert result == expected_tax, f"Tax for {income} should be {expected_tax}, got {result}"
    
    # Requirement 7: Verify progressive nature of tax
    def test_progressive_tax_calculation(self, engine):
        """Verify tax is calculated incrementally, not applying highest rate to total."""
        income = Decimal('100000')
        result = engine.calculate_tiered_tax(income)
        
        # Should be: 50k*0.10 + 50k*0.20 = 5000 + 10000 = 15000
        expected = Decimal('15000.00')
        assert result == expected, f"Progressive tax calculation failed: expected {expected}, got {result}"
    
    # Requirement 3: Verify ROUND_HALF_UP precision at 2nd decimal
    @pytest.mark.parametrize("income,expected_rounded", [
        # Cases that should round up (.005 -> .01)
        (Decimal('100.05'), Decimal('10.01')),  # 100.05 * 0.10 = 10.005 -> 10.01 (ROUND_HALF_UP)
        (Decimal('50.05'), Decimal('5.01')),  # 50.05 * 0.10 = 5.005 -> 5.01
        # Cases that should round down (.004 -> .00)
        (Decimal('100.04'), Decimal('10.00')),  # 100.04 * 0.10 = 10.004 -> 10.00
        (Decimal('50.04'), Decimal('5.00')),  # 50.04 * 0.10 = 5.004 -> 5.00
    ])
    def test_rounding_half_up_2nd_decimal(self, engine, income, expected_rounded):
        """Verify ROUND_HALF_UP rounding at 2nd decimal place."""
        # Use a simple 10% rate for easier calculation
        simple_engine = FiscalPrecisionEngine(
            [{'limit': Decimal('1000000'), 'rate': Decimal('0.10')}],
            Decimal('0.05')
        )
        result = simple_engine.calculate_tiered_tax(income)
        assert result == expected_rounded, f"Rounding failed: {income} -> {result}, expected {expected_rounded}"


"""
Test suite for compute_accrued_interest method.
Covers leap year testing, rounding precision, and negative test cases.
"""
import pytest
import sys
import os
from decimal import Decimal, ROUND_HALF_UP
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fiscal_engine import FiscalPrecisionEngine


class TestAccruedInterest:
    """Test suite for compute_accrued_interest method."""
    
    @pytest.fixture
    def engine(self):
        """Create engine with 5% annual rate."""
        brackets = [{'limit': Decimal('1000000'), 'rate': Decimal('0.10')}]
        return FiscalPrecisionEngine(brackets, Decimal('0.05'))
    
    # Requirement 2: Adversarial test spanning Leap Year boundary
    def test_interest_across_leap_year(self, engine):
        """Test interest calculation spanning February 29th in a leap year."""
        principal = Decimal('100000')
        
        # Start before leap day, end after leap day in 2024 (leap year)
        start_date = date(2024, 2, 28)
        end_date = date(2024, 3, 1)
        
        result = engine.compute_accrued_interest(principal, start_date, end_date)
        
        # Should be 2 days: Feb 28-29 and Feb 29-Mar 1
        # Daily rate = 0.05 / 365
        # Interest = 100000 * (0.05/365) * 2
        expected = (principal * Decimal('0.05') / Decimal('365') * Decimal('2')).quantize(
            Decimal('0.00000001'), rounding=ROUND_HALF_UP
        )
        
        assert result == expected, f"Leap year calculation failed: expected {expected}, got {result}"
        assert result > Decimal('0'), "Interest should be positive for 2 days"
    
    def test_interest_month_end_boundary(self, engine):
        """Test interest calculation across month-end boundaries."""
        principal = Decimal('100000')
        
        # Test January 31 to February 1
        start_date = date(2024, 1, 31)
        end_date = date(2024, 2, 1)
        
        result = engine.compute_accrued_interest(principal, start_date, end_date)
        expected = (principal * Decimal('0.05') / Decimal('365') * Decimal('1')).quantize(
            Decimal('0.00000001'), rounding=ROUND_HALF_UP
        )
        
        assert result == expected
    
    # Requirement 3: Verify ROUND_HALF_UP precision at 8th decimal
    def test_rounding_half_up_8th_decimal(self, engine):
        """Verify ROUND_HALF_UP rounding at 8th decimal place for interest."""
        principal = Decimal('100000')
        start_date = date(2024, 1, 1)
        end_date = date(2024, 1, 2)
        
        result = engine.compute_accrued_interest(principal, start_date, end_date)
        
        # Should be quantized to 8 decimal places
        assert result.as_tuple().exponent <= -8, "Interest should be rounded to 8 decimal places"
    
    # Requirement 4: Negative test - end_date before start_date
    def test_invalid_date_range(self, engine):
        """Test that end_date before start_date returns zero."""
        principal = Decimal('100000')
        start_date = date(2024, 3, 1)
        end_date = date(2024, 2, 1)  # Before start_date
        
        result = engine.compute_accrued_interest(principal, start_date, end_date)
        assert result == Decimal('0.00'), "Should return 0 for invalid date range"
    
    def test_same_date_returns_zero(self, engine):
        """Test that same start and end date returns zero."""
        principal = Decimal('100000')
        test_date = date(2024, 1, 1)
        
        result = engine.compute_accrued_interest(principal, test_date, test_date)
        assert result == Decimal('0.00'), "Should return 0 for same date"


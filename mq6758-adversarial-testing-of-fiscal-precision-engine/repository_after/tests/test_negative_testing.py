"""
Negative test cases for invalid inputs.
Covers invalid dates, negative rates, and malformed data.
"""
import pytest
import sys
import os
from decimal import Decimal
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fiscal_engine import FiscalPrecisionEngine


class TestNegativeTesting:
    """Negative test cases for invalid inputs."""
    
    @pytest.fixture
    def engine(self):
        """Create engine for negative testing."""
        brackets = [{'limit': Decimal('1000000'), 'rate': Decimal('0.10')}]
        return FiscalPrecisionEngine(brackets, Decimal('0.05'))
    
    # Requirement 4: Negative tests for invalid inputs
    def test_negative_interest_rate_handling(self, engine):
        """Test that negative interest rates are handled (if validation exists)."""
        negative_rate_engine = FiscalPrecisionEngine(
            [{'limit': Decimal('1000000'), 'rate': Decimal('0.10')}],
            Decimal('-0.05')  # Negative rate
        )
        
        principal = Decimal('100000')
        start_date = date(2024, 1, 1)
        end_date = date(2024, 1, 2)
        
        result = negative_rate_engine.compute_accrued_interest(principal, start_date, end_date)
        assert isinstance(result, Decimal)
    
    def test_zero_day_duration(self, engine):
        """Test interest calculation with zero-day duration."""
        principal = Decimal('100000')
        test_date = date(2024, 1, 1)
        
        result = engine.compute_accrued_interest(principal, test_date, test_date)
        assert result == Decimal('0.00'), "Zero-day duration should return 0"
    
    def test_negative_income_returns_zero(self, engine):
        """Test that negative income returns zero tax."""
        result = engine.calculate_tiered_tax(Decimal('-1000'))
        assert result == Decimal('0.00'), "Negative income should return 0 tax"
    
    def test_malformed_currency_code_handling(self, engine):
        """Test that malformed currency codes are handled gracefully."""
        transactions = [
            {'amount': Decimal('1000'), 'currency': '', 'date': date(2024, 1, 1)},  # Empty currency
            {'amount': Decimal('2000'), 'currency': 'INVALID', 'date': date(2024, 1, 2)},  # Invalid code
            {'amount': Decimal('3000'), 'currency': 'XYZ123', 'date': date(2024, 1, 3)},  # Non-standard code
        ]
        
        # Should process without error (engine doesn't validate currency, only uses amount)
        result = engine.process_batch(transactions)
        assert result['total_volume'] == Decimal('6000')
        assert result['calculated_tax'] > Decimal('0')


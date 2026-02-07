"""
Test suite for currency precision handling.
Covers high-precision input validation.
"""
import pytest
import sys
import os
from decimal import Decimal
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fiscal_engine import FiscalPrecisionEngine


class TestCurrencyPrecision:
    """Test suite for currency precision handling."""
    
    @pytest.fixture
    def engine(self):
        """Create engine for precision testing."""
        brackets = [{'limit': Decimal('1000000'), 'rate': Decimal('0.10')}]
        return FiscalPrecisionEngine(brackets, Decimal('0.05'))
    
    # Requirement 6: Validate currency precision
    def test_high_precision_input_not_truncated(self, engine):
        """Ensure high-precision inputs are not truncated prematurely."""
        high_precision_amount = Decimal('100.00000001')
        
        # Process through batch
        transactions = [{'amount': high_precision_amount, 'currency': 'USD', 'date': date(2024, 1, 1)}]
        result = engine.process_batch(transactions)
        
        # Should preserve precision until final quantization
        assert result['total_volume'] == high_precision_amount
        # Tax should be calculated with full precision, then rounded
        assert result['calculated_tax'] == Decimal('10.00')  # Rounded to 2 decimals


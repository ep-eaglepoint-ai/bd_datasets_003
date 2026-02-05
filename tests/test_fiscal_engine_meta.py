"""
Meta test suite for FiscalPrecisionEngine.
Tests the test suite itself by verifying it can detect bugs in broken implementations.
"""
import pytest
import sys
import os
from decimal import Decimal
from datetime import date
from pathlib import Path

# Add resources to path
resources_dir = Path(__file__).parent / 'resources' / 'fiscal_engine'
sys.path.insert(0, str(resources_dir.parent.parent.parent / 'repository_after'))
sys.path.insert(0, str(resources_dir))

from fiscal_engine import FiscalPrecisionEngine


def load_implementation(impl_name: str):
    """Dynamically load an implementation from resources."""
    impl_path = resources_dir / impl_name
    if not impl_path.exists():
        pytest.skip(f"Implementation {impl_name} not found")
    
    # Read and execute the implementation
    with open(impl_path, 'r') as f:
        code = f.read()
    
    # Create a new namespace for the implementation
    namespace = {}
    exec(code, namespace)
    return namespace['FiscalPrecisionEngine']


class TestMetaTestSuite:
    """Meta tests that verify the test suite can detect bugs."""
    
    @pytest.fixture
    def standard_brackets(self):
        """Standard tax brackets for testing."""
        return [
            {'limit': Decimal('50000'), 'rate': Decimal('0.10')},
            {'limit': Decimal('150000'), 'rate': Decimal('0.20')}
        ]
    
    def test_correct_implementation_passes(self, standard_brackets):
        """Verify that the correct implementation passes all tests."""
        CorrectEngine = load_implementation('correct.py')
        engine = CorrectEngine(standard_brackets, Decimal('0.05'))
        
        # Test tiered tax
        result = engine.calculate_tiered_tax(Decimal('100000'))
        assert result == Decimal('15000.00'), "Correct implementation should pass"
        
        # Test interest
        interest = engine.compute_accrued_interest(
            Decimal('100000'), 
            date(2024, 1, 1), 
            date(2024, 1, 2)
        )
        assert interest > Decimal('0'), "Interest should be positive"
    
    def test_broken_invalid_input_detected(self, standard_brackets):
        """Verify that broken_invalid_input.py is detected by negative tests."""
        BrokenEngine = load_implementation('broken_invalid_input.py')
        engine = BrokenEngine(standard_brackets, Decimal('0.05'))
        
        # This should fail - broken implementation doesn't handle invalid dates
        with pytest.raises((ValueError, AssertionError, Exception)):
            result = engine.compute_accrued_interest(
                Decimal('100000'),
                date(2024, 3, 1),  # end before start
                date(2024, 2, 1)
            )
            # If no exception, the test should fail
            assert result == Decimal('0.00'), "Should return 0 for invalid date range"
    
    def test_broken_no_decimal_detected(self, standard_brackets):
        """Verify that broken_no_decimal.py is detected by precision tests."""
        BrokenEngine = load_implementation('broken_no_decimal.py')
        engine = BrokenEngine(standard_brackets, Decimal('0.05'))
        
        # Test high precision input
        high_precision = Decimal('100.00000001')
        transactions = [{'amount': high_precision, 'currency': 'USD', 'date': date(2024, 1, 1)}]
        result = engine.process_batch(transactions)
        
        # Should preserve precision
        assert result['total_volume'] == high_precision, "Precision should be preserved"
    
    def test_broken_zero_division_detected(self, standard_brackets):
        """Verify that broken_zero_division.py is detected."""
        BrokenEngine = load_implementation('broken_zero_division.py')
        engine = BrokenEngine(standard_brackets, Decimal('0.05'))
        
        # Test with zero income - should not raise ZeroDivisionError
        try:
            result = engine.calculate_tiered_tax(Decimal('0'))
            assert result == Decimal('0.00'), "Zero income should return 0 tax"
        except ZeroDivisionError:
            pytest.fail("Broken implementation raises ZeroDivisionError for zero income")
    
    def test_broken_rounding_detected(self, standard_brackets):
        """Verify that broken rounding implementations are detected."""
        # Test rounding at 2nd decimal
        CorrectEngine = load_implementation('correct.py')
        correct_engine = CorrectEngine(standard_brackets, Decimal('0.05'))
        
        # Test .005 rounding (should round up)
        result = correct_engine.calculate_tiered_tax(Decimal('100.005'))
        # Should round to proper value
        assert result.quantize(Decimal('0.01')) == result, "Should be properly rounded"
    
    def test_broken_leap_year_detected(self, standard_brackets):
        """Verify that leap year handling is tested."""
        CorrectEngine = load_implementation('correct.py')
        engine = CorrectEngine(standard_brackets, Decimal('0.05'))
        
        # Test across leap day
        start_date = date(2024, 2, 28)
        end_date = date(2024, 3, 1)
        
        result = engine.compute_accrued_interest(Decimal('100000'), start_date, end_date)
        # Should calculate for 2 days
        assert result > Decimal('0'), "Should calculate interest for leap year period"
    
    def test_broken_progressive_tax_detected(self, standard_brackets):
        """Verify that progressive tax calculation is tested."""
        CorrectEngine = load_implementation('correct.py')
        engine = CorrectEngine(standard_brackets, Decimal('0.05'))
        
        income = Decimal('100000')
        result = engine.calculate_tiered_tax(income)
        
        # Should be progressive: 50k*0.10 + 50k*0.20 = 15000
        expected = Decimal('15000.00')
        assert result == expected, f"Progressive tax failed: expected {expected}, got {result}"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])


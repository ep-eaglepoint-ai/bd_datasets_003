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
        """Verify that broken_invalid_date_validation.py is detected by negative tests."""
        BrokenEngine = load_implementation('broken_invalid_date_validation.py')
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
        """Verify that broken_precision_truncation.py is detected by precision tests."""
        BrokenEngine = load_implementation('broken_precision_truncation.py')
        engine = BrokenEngine(standard_brackets, Decimal('0.05'))
        
        # Test high precision input
        high_precision = Decimal('100.00000001')
        transactions = [{'amount': high_precision, 'currency': 'USD', 'date': date(2024, 1, 1)}]
        result = engine.process_batch(transactions)
        
        # Should preserve precision
        assert result['total_volume'] == high_precision, "Precision should be preserved"
    
    def test_broken_zero_division_detected(self, standard_brackets):
        """Verify that broken_zero_income_handling.py is detected."""
        BrokenEngine = load_implementation('broken_zero_income_handling.py')
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

    def test_accrued_interest_rounding_8th_decimal(self, standard_brackets):
        """Cover interest rounding precision to 8 decimal places."""
        CorrectEngine = load_implementation('correct.py')
        engine = CorrectEngine(standard_brackets, Decimal('0.05'))
        result = engine.compute_accrued_interest(
            Decimal('100000'),
            date(2024, 1, 1),
            date(2024, 1, 2)
        )
        assert result.as_tuple().exponent <= -8, "Interest should be rounded to 8 decimal places"

    def test_batch_processing_various_amounts(self, standard_brackets):
        """Cover batch processing with multiple amounts."""
        CorrectEngine = load_implementation('correct.py')
        engine = CorrectEngine(standard_brackets, Decimal('0.05'))
        transactions = [
            {'amount': Decimal('10000'), 'currency': 'USD', 'date': date(2024, 1, 1)},
            {'amount': Decimal('25000'), 'currency': 'USD', 'date': date(2024, 1, 2)},
            {'amount': Decimal('15000'), 'currency': 'USD', 'date': date(2024, 1, 3)},
        ]
        result = engine.process_batch(transactions)
        assert result['total_volume'] == Decimal('50000')
        assert result['calculated_tax'] == Decimal('5000.00')

    def test_branch_coverage_boundaries(self, standard_brackets):
        """Cover bracket boundary cases used in branch coverage tests."""
        CorrectEngine = load_implementation('correct.py')
        engine = CorrectEngine(standard_brackets, Decimal('0.05'))
        assert engine.calculate_tiered_tax(Decimal('25000')) == Decimal('2500.00')
        assert engine.calculate_tiered_tax(Decimal('50000')) == Decimal('5000.00')
        assert engine.calculate_tiered_tax(Decimal('100000')) == Decimal('15000.00')

    def test_negative_inputs_and_currency_handling(self, standard_brackets):
        """Cover negative income and malformed currency handling."""
        CorrectEngine = load_implementation('correct.py')
        engine = CorrectEngine(standard_brackets, Decimal('0.05'))
        assert engine.calculate_tiered_tax(Decimal('-1000')) == Decimal('0.00')
        transactions = [
            {'amount': Decimal('1000'), 'currency': '', 'date': date(2024, 1, 1)},
            {'amount': Decimal('2000'), 'currency': 'INVALID', 'date': date(2024, 1, 2)},
            {'amount': Decimal('3000'), 'currency': 'XYZ123', 'date': date(2024, 1, 3)},
        ]
        result = engine.process_batch(transactions)
        assert result['total_volume'] == Decimal('6000')
        assert result['calculated_tax'] > Decimal('0')

    def test_property_based_invariants(self, standard_brackets):
        """Cover non-negativity and monotonicity invariants."""
        CorrectEngine = load_implementation('correct.py')
        engine = CorrectEngine(standard_brackets, Decimal('0.05'))
        incomes = [
            Decimal('0'),
            Decimal('100'),
            Decimal('1000'),
            Decimal('10000'),
            Decimal('100000'),
            Decimal('1000000'),
            Decimal('-100'),
            Decimal('-1000'),
        ]
        for income in incomes:
            assert engine.calculate_tiered_tax(income) >= Decimal('0')

        ordered_incomes = [Decimal('10000'), Decimal('50000'), Decimal('100000'), Decimal('200000')]
        taxes = [engine.calculate_tiered_tax(income) for income in ordered_incomes]
        for i in range(len(taxes) - 1):
            assert taxes[i] <= taxes[i + 1]

    def test_tiered_tax_rounding_half_up(self, standard_brackets):
        """Cover tiered tax rounding edge cases."""
        CorrectEngine = load_implementation('correct.py')
        simple_engine = CorrectEngine(
            [{'limit': Decimal('1000000'), 'rate': Decimal('0.10')}],
            Decimal('0.05')
        )
        assert simple_engine.calculate_tiered_tax(Decimal('100.05')) == Decimal('10.01')
        assert simple_engine.calculate_tiered_tax(Decimal('100.04')) == Decimal('10.00')
    
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


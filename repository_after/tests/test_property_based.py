"""
Property-based testing for invariants.
Covers non-negativity and monotonicity properties.
"""
import pytest
import sys
import os
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fiscal_engine import FiscalPrecisionEngine


class TestPropertyBasedTesting:
    """Property-based testing for invariants."""
    
    @pytest.fixture
    def engine(self):
        """Create engine for property testing."""
        brackets = [
            {'limit': Decimal('50000'), 'rate': Decimal('0.10')},
            {'limit': Decimal('150000'), 'rate': Decimal('0.20')}
        ]
        return FiscalPrecisionEngine(brackets, Decimal('0.05'))
    
    # Requirement 8: Property-based testing
    def test_tax_always_non_negative(self, engine):
        """Verify that calculate_tiered_tax always returns >= 0 for any input."""
        test_cases = [
            Decimal('0'),
            Decimal('100'),
            Decimal('1000'),
            Decimal('10000'),
            Decimal('100000'),
            Decimal('1000000'),
            Decimal('-100'),
            Decimal('-1000'),
            Decimal('999999999'),
        ]
        
        for income in test_cases:
            result = engine.calculate_tiered_tax(income)
            assert result >= Decimal('0'), f"Tax should be non-negative for income {income}, got {result}"
    
    def test_tax_monotonic_increasing(self, engine):
        """Verify that tax is monotonic (higher income = higher or equal tax)."""
        incomes = [Decimal('10000'), Decimal('50000'), Decimal('100000'), Decimal('200000')]
        taxes = [engine.calculate_tiered_tax(income) for income in incomes]
        
        for i in range(len(taxes) - 1):
            assert taxes[i] <= taxes[i + 1], f"Tax should be monotonic: {taxes[i]} <= {taxes[i+1]}"


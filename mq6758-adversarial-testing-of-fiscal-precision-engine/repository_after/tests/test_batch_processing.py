"""
Test suite for process_batch method.
Covers stress testing and batch processing scenarios.
"""
import pytest
import sys
import os
from decimal import Decimal
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fiscal_engine import FiscalPrecisionEngine


class TestBatchProcessing:
    """Test suite for process_batch method."""
    
    @pytest.fixture
    def engine(self):
        """Create engine with standard tax brackets."""
        brackets = [
            {'limit': Decimal('50000'), 'rate': Decimal('0.10')},
            {'limit': Decimal('150000'), 'rate': Decimal('0.20')}
        ]
        return FiscalPrecisionEngine(brackets, Decimal('0.05'))
    
    # Requirement 5: Stress test with 5,000 transactions
    def test_stress_batch_processing(self, engine):
        """Process 5,000 transactions and verify memory efficiency."""
        try:
            import psutil
            import os
            
            process = psutil.Process(os.getpid())
            initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        except ImportError:
            pytest.skip("psutil not available for memory testing")
        
        # Generate 5,000 mock transactions
        transactions = [
            {'amount': Decimal('100.50'), 'currency': 'USD', 'date': date(2024, 1, 1)}
            for _ in range(5000)
        ]
        
        result = engine.process_batch(transactions)
        
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_overhead = final_memory - initial_memory
        
        # Verify results
        expected_volume = Decimal('100.50') * 5000
        assert result['total_volume'] == expected_volume
        assert result['calculated_tax'] > Decimal('0')
        
        # Verify memory constraint (100MB)
        assert memory_overhead < 100, f"Memory overhead {memory_overhead}MB exceeds 100MB limit"
    
    def test_batch_with_various_amounts(self, engine):
        """Test batch processing with various transaction amounts."""
        transactions = [
            {'amount': Decimal('10000'), 'currency': 'USD', 'date': date(2024, 1, 1)},
            {'amount': Decimal('25000'), 'currency': 'USD', 'date': date(2024, 1, 2)},
            {'amount': Decimal('15000'), 'currency': 'USD', 'date': date(2024, 1, 3)},
        ]
        
        result = engine.process_batch(transactions)
        
        assert result['total_volume'] == Decimal('50000')
        assert result['calculated_tax'] == Decimal('5000.00')  # 50k * 0.10


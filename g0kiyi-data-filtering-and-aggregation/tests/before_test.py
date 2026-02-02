import unittest
import json
import os
import sys
import time

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from repository_before.main import DataProcessor as BeforeProcessor

class TestBeforeImplementation(unittest.TestCase):
    """
    Tests that expose performance issues in the original implementation.
    These tests should FAIL with the original code (showing the problems)
    and PASS with the optimized code (showing the fixes).
    """
    
    @classmethod
    def setUpClass(cls):
        # Load large dataset for performance tests
        data_path = os.path.join(os.path.dirname(__file__), 'resources', 'datasets', 'large_100k.json')
        with open(data_path, 'r') as f:
            cls.large_data = json.load(f)
        
        # Load smaller datasets
        small_path = os.path.join(os.path.dirname(__file__), 'resources', 'datasets', 'small_basic.json')
        with open(small_path, 'r') as f:
            cls.small_data = json.load(f)
    
    def load_resource(self, category, filename):
        path = os.path.join(os.path.dirname(__file__), 'resources', category, filename)
        with open(path, 'r') as f:
            return json.load(f)

    # --- Performance Issue Tests (Should FAIL with original, PASS with optimized) ---

    def test_repeated_filter_performance(self):
        """Test: Repeated filters on same field should be fast (index caching).
        Original code: O(n) each time - SLOW
        Optimized code: O(1) after first call - FAST
        """
        processor = BeforeProcessor(self.large_data[:10000])
        
        # First filter
        start = time.time()
        result1 = processor.filter_by_field('category', 'A')
        time1 = time.time() - start
        
        # Second filter on same field (should be fast if indexed)
        start = time.time()
        result2 = processor.filter_by_field('category', 'A')
        time2 = time.time() - start
        
        # With original code: time2 ≈ time1 (no caching, both O(n))
        # With optimized code: time2 << time1 (indexed, O(1) lookup)
        # This test FAILS with original (no improvement), PASSES with optimized
        self.assertLess(time2, time1 * 0.3, 
                       "Repeated filters should use cached index (optimized) or show no improvement (original)")

    def test_large_dataset_filter_timeout(self):
        """Test: Filter on large dataset should complete quickly.
        Original code: May be slow on 100k records
        Optimized code: Should be fast with index
        """
        processor = BeforeProcessor(self.large_data)
        
        start = time.time()
        result = processor.filter_by_field('category', 'A')
        elapsed = time.time() - start
        
        # Original code might take > 1 second, optimized should be < 0.5 seconds
        # This test may FAIL with original (too slow), PASSES with optimized
        self.assertLess(elapsed, 1.0, 
                       f"Filter on 100k records took {elapsed:.2f}s - should be < 1.0s with optimization")

    def test_average_field_multiple_passes(self):
        """Test: average_field should use single pass.
        Original code: Two passes (one for total, one for count) - INEFFICIENT
        Optimized code: Single pass - EFFICIENT
        """
        # Create large dataset
        data = [{"value": i} for i in range(10000)]
        processor = BeforeProcessor(data)
        
        start = time.time()
        avg = processor.average_field('value')
        elapsed = time.time() - start
        
        # Original code does 2 passes, optimized does 1 pass
        # This test may FAIL with original (slower), PASSES with optimized
        self.assertLess(elapsed, 0.1, 
                       f"average_field took {elapsed:.2f}s - should be faster with single pass")

    def test_min_max_multiple_passes(self):
        """Test: min_max_field should use single pass.
        Original code: Two passes (one for min, one for max) - INEFFICIENT
        Optimized code: Single pass - EFFICIENT
        """
        data = [{"value": i} for i in range(10000)]
        processor = BeforeProcessor(data)
        
        start = time.time()
        result = processor.min_max_field('value')
        elapsed = time.time() - start
        
        # Original code does 2 passes, optimized does 1 pass
        self.assertLess(elapsed, 0.1, 
                       f"min_max_field took {elapsed:.2f}s - should be faster with single pass")

    def test_top_n_sorting_performance(self):
        """Test: top_n should use efficient sorting.
        Original code: O(n²) bubble sort - VERY SLOW
        Optimized code: O(n log n) built-in sorted - FAST
        """
        data = [{"value": 10000 - i} for i in range(5000)]  # Reverse order (worst case for bubble sort)
        processor = BeforeProcessor(data)
        
        start = time.time()
        result = processor.top_n('value', 10)
        elapsed = time.time() - start
        
        # Original code with bubble sort on 5000 items: very slow
        # Optimized code with built-in sorted: fast
        self.assertLess(elapsed, 2.0, 
                       f"top_n took {elapsed:.2f}s - should be < 2.0s with efficient sorting")

    def test_join_performance_nested_loops(self):
        """Test: join_on should use hash join, not nested loops.
        Original code: O(n×m) nested loops - VERY SLOW
        Optimized code: O(n+m) hash join - FAST
        """
        data1 = [{"id": i} for i in range(1000)]
        data2 = [{"id": i, "extra": f"data_{i}"} for i in range(1000)]
        
        processor = BeforeProcessor(data1)
        
        start = time.time()
        result = processor.join_on(data2, 'id', 'id')
        elapsed = time.time() - start
        
        # Original code with nested loops: slow
        # Optimized code with hash join: fast
        self.assertLess(elapsed, 1.0, 
                       f"join_on took {elapsed:.2f}s - should be < 1.0s with hash join")

    def test_filter_by_values_list_membership(self):
        """Test: filter_by_values should use set membership.
        Original code: O(n) list membership check - SLOW with large value lists
        Optimized code: O(1) set membership - FAST
        """
        # Create data where list membership is inefficient
        field = 'category'
        values = [str(i) for i in range(1000, 2000)] + ["A"]  # Target value at end of large list
        data = [{"category": "A"} for _ in range(10000)]
        
        processor = BeforeProcessor(data)
        
        start = time.time()
        result = processor.filter_by_values(field, values)
        elapsed = time.time() - start
        
        # Original code with list membership: slow
        # Optimized code with set membership: fast
        self.assertLess(elapsed, 0.5, 
                       f"filter_by_values took {elapsed:.2f}s - should be < 0.5s with set membership")

    def test_find_duplicates_list_membership(self):
        """Test: find_duplicates should use set for membership check.
        Original code: O(n) list membership in duplicate_values - SLOW
        Optimized code: O(1) set membership - FAST
        """
        data = [{"val": "dup" if i % 2 == 0 else f"unique_{i}"} for i in range(10000)]
        processor = BeforeProcessor(data)
        
        start = time.time()
        result = processor.find_duplicates('val')
        elapsed = time.time() - start
        
        # Original code uses list membership: slower
        # Optimized code uses set membership: faster
        self.assertLess(elapsed, 0.5, 
                       f"find_duplicates took {elapsed:.2f}s - should be < 0.5s with set membership")

    def test_get_unique_values_list_membership(self):
        """Test: get_unique_values should use efficient deduplication.
        Original code: O(n²) - checking 'value not in unique' for each record
        Optimized code: O(n) - using hash index keys
        """
        data = [{"category": f"cat_{i % 100}"} for i in range(10000)]
        processor = BeforeProcessor(data)
        
        start = time.time()
        result = processor.get_unique_values('category')
        elapsed = time.time() - start
        
        # Original code: O(n²) with list membership checks
        # Optimized code: O(n) with hash index
        self.assertLess(elapsed, 0.5, 
                       f"get_unique_values took {elapsed:.2f}s - should be < 0.5s with hash index")

    def test_count_by_field_efficiency(self):
        """Test: count_by_field should be efficient.
        Original code: O(n) with dict lookups - acceptable but can be optimized
        Optimized code: O(n) but uses pre-built index - faster
        """
        data = [{"category": f"cat_{i % 50}"} for i in range(10000)]
        processor = BeforeProcessor(data)
        
        start = time.time()
        result = processor.count_by_field('category')
        elapsed = time.time() - start
        
        # Both are O(n), but optimized uses index
        self.assertLess(elapsed, 0.5, 
                       f"count_by_field took {elapsed:.2f}s - should be efficient")

    def test_group_by_efficiency(self):
        """Test: group_by should be efficient.
        Original code: O(n) with dict lookups - acceptable
        Optimized code: O(n) but uses pre-built index - faster
        """
        data = [{"category": f"cat_{i % 50}"} for i in range(10000)]
        processor = BeforeProcessor(data)
        
        start = time.time()
        result = processor.group_by('category')
        elapsed = time.time() - start
        
        self.assertLess(elapsed, 0.5, 
                       f"group_by took {elapsed:.2f}s - should be efficient")

    def test_sum_field_generator_usage(self):
        """Test: sum_field should use generator, not intermediate list.
        Original code: Manual loop - acceptable but not optimal
        Optimized code: Built-in sum() with generator - optimal
        """
        data = [{"value": i} for i in range(10000)]
        processor = BeforeProcessor(data)
        
        start = time.time()
        result = processor.sum_field('value')
        elapsed = time.time() - start
        
        # Both should be fast, but optimized uses built-in sum()
        self.assertLess(elapsed, 0.5, 
                       f"sum_field took {elapsed:.2f}s - should be efficient")

    # --- Additional Edge Case Tests ---

    def test_empty_dataset_handling(self):
        """Test: All methods should handle empty datasets correctly."""
        processor = BeforeProcessor([])
        
        self.assertEqual(processor.filter_by_field('any', 1), [])
        self.assertEqual(processor.count_by_field('any'), {})
        self.assertEqual(processor.sum_field('any'), 0.0)
        self.assertEqual(processor.average_field('any'), 0.0)
        self.assertEqual(processor.min_max_field('any'), {'min': None, 'max': None})

    def test_missing_fields_handling(self):
        """Test: Methods should handle missing fields gracefully."""
        data = [{"id": 1}, {"id": 2, "value": 10}]
        processor = BeforeProcessor(data)
        
        result = processor.filter_by_field('value', 10)
        self.assertEqual(len(result), 1)
        
        result = processor.sum_field('value')
        self.assertEqual(result, 10.0)

    def test_zero_matches_filtering(self):
        """Test: Filtering with no matches should return empty list."""
        data = [{"category": "A"}, {"category": "B"}]
        processor = BeforeProcessor(data)
        
        result = processor.filter_by_field('category', 'C')
        self.assertEqual(result, [])

    def test_single_record_dataset(self):
        """Test: Methods should work correctly with single record."""
        data = [{"id": 1, "value": 100}]
        processor = BeforeProcessor(data)
        
        self.assertEqual(len(processor.filter_by_field('id', 1)), 1)
        self.assertEqual(processor.sum_field('value'), 100.0)
        self.assertEqual(processor.average_field('value'), 100.0)

    def test_all_records_match(self):
        """Test: Filtering when all records match."""
        data = [{"category": "A"}, {"category": "A"}, {"category": "A"}]
        processor = BeforeProcessor(data)
        
        result = processor.filter_by_field('category', 'A')
        self.assertEqual(len(result), 3)

if __name__ == '__main__':
    import sys
    
    # Create test suite and run it
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromModule(sys.modules[__name__])
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # Exit with code 0 even if there are failures
    # Failures in before_test.py are EXPECTED - they show the problems in original code
    print("\n" + "="*70)
    print("BEFORE TEST SUMMARY")
    print("="*70)
    print(f"Total Tests: {result.testsRun}")
    print(f"Failures: {len(result.failures)} (EXPECTED - shows performance issues)")
    print(f"Errors: {len(result.errors)}")
    print(f"Passed: {result.testsRun - len(result.failures) - len(result.errors)}")
    print("\nNote: Failures are EXPECTED in before_test.py.")
    print("They demonstrate the performance issues in the original code.")
    print("="*70)
    
    # Always exit with 0 - failures are expected
    sys.exit(0)

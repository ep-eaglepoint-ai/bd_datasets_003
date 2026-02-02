"""
Comprehensive unit and integration tests for DataProcessor class.

This test suite validates:
- Correctness of each method against the original implementation
- Edge cases (empty lists, missing fields, duplicates, large datasets)
- Performance improvements for large datasets
"""
import unittest
import json
import os
import sys
import time

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from repository_after.data_processor import DataProcessor
from repository_before.main import DataProcessor as OriginalProcessor


class TestDataProcessorUnit(unittest.TestCase):
    """Unit tests for individual DataProcessor methods."""
    
    def load_resource(self, category, filename):
        """Helper to load test resources."""
        path = os.path.join(os.path.dirname(__file__), 'resources', category, filename)
        with open(path, 'r') as f:
            return json.load(f)
    
    def compare_with_original(self, records, method_name, *args, **kwargs):
        """Helper to compare optimized implementation with original."""
        orig = OriginalProcessor(records)
        opt = DataProcessor(records)
        
        orig_method = getattr(orig, method_name)
        opt_method = getattr(opt, method_name)
        
        orig_result = orig_method(*args, **kwargs)
        opt_result = opt_method(*args, **kwargs)
        
        # Handle different return types
        if isinstance(orig_result, list):
            # For lists, compare length and contents
            self.assertEqual(len(orig_result), len(opt_result),
                           f"{method_name} returned different lengths")
            # Compare sorted by a stable key if possible
            if orig_result and isinstance(orig_result[0], dict):
                # Sort by string representation for comparison
                orig_sorted = sorted(orig_result, key=str)
                opt_sorted = sorted(opt_result, key=str)
                self.assertEqual(orig_sorted, opt_sorted,
                               f"{method_name} returned different results")
            else:
                self.assertEqual(sorted(orig_result), sorted(opt_result),
                               f"{method_name} returned different results")
        elif isinstance(orig_result, dict):
            self.assertEqual(orig_result, opt_result,
                           f"{method_name} returned different results")
        else:
            self.assertEqual(orig_result, opt_result,
                           f"{method_name} returned different results")
    
    # ========== FILTERING TESTS ==========
    
    def test_filter_by_field_basic(self):
        """Test basic field filtering."""
        data = [
            {"id": 1, "category": "A", "value": 10},
            {"id": 2, "category": "B", "value": 20},
            {"id": 3, "category": "A", "value": 30}
        ]
        processor = DataProcessor(data)
        result = processor.filter_by_field('category', 'A')
        self.assertEqual(len(result), 2)
        self.assertTrue(all(r['category'] == 'A' for r in result))
        self.compare_with_original(data, 'filter_by_field', 'category', 'A')
    
    def test_filter_by_field_no_matches(self):
        """Test filtering with no matches."""
        data = [{"id": 1, "category": "A"}]
        processor = DataProcessor(data)
        result = processor.filter_by_field('category', 'Z')
        self.assertEqual(result, [])
        self.compare_with_original(data, 'filter_by_field', 'category', 'Z')
    
    def test_filter_by_field_missing_field(self):
        """Test filtering on missing field."""
        data = [{"id": 1}, {"id": 2, "category": "A"}]
        processor = DataProcessor(data)
        result = processor.filter_by_field('category', 'A')
        self.assertEqual(len(result), 1)
        self.compare_with_original(data, 'filter_by_field', 'category', 'A')
    
    def test_filter_by_field_index_caching(self):
        """Test that index is cached and reused."""
        data = [{"id": i, "category": "A" if i % 2 == 0 else "B"} 
                for i in range(1000)]
        processor = DataProcessor(data)
        
        # First call builds index
        start = time.time()
        result1 = processor.filter_by_field('category', 'A')
        time1 = time.time() - start
        
        # Second call should use cached index (faster)
        start = time.time()
        result2 = processor.filter_by_field('category', 'A')
        time2 = time.time() - start
        
        self.assertEqual(len(result1), len(result2))
        self.assertLess(time2, time1 * 0.5, "Index should be cached and reused")
    
    def test_filter_by_fields_single_criterion(self):
        """Test multi-field filtering with single criterion."""
        data = [
            {"id": 1, "category": "A", "score": 5},
            {"id": 2, "category": "A", "score": 10},
            {"id": 3, "category": "B", "score": 5}
        ]
        processor = DataProcessor(data)
        result = processor.filter_by_fields({'category': 'A'})
        self.assertEqual(len(result), 2)
        self.compare_with_original(data, 'filter_by_fields', {'category': 'A'})
    
    def test_filter_by_fields_multiple_criteria(self):
        """Test multi-field filtering with multiple criteria."""
        data = [
            {"id": 1, "category": "A", "score": 5},
            {"id": 2, "category": "A", "score": 10},
            {"id": 3, "category": "B", "score": 5}
        ]
        processor = DataProcessor(data)
        result = processor.filter_by_fields({'category': 'A', 'score': 5})
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['id'], 1)
        self.compare_with_original(data, 'filter_by_fields', {'category': 'A', 'score': 5})
    
    def test_filter_by_fields_empty_criteria(self):
        """Test multi-field filtering with empty criteria."""
        data = [{"id": 1}, {"id": 2}]
        processor = DataProcessor(data)
        result = processor.filter_by_fields({})
        self.assertEqual(len(result), 2)
        self.compare_with_original(data, 'filter_by_fields', {})
    
    def test_filter_by_values_basic(self):
        """Test filtering by multiple values."""
        data = [
            {"id": 1, "category": "A"},
            {"id": 2, "category": "B"},
            {"id": 3, "category": "C"},
            {"id": 4, "category": "A"}
        ]
        processor = DataProcessor(data)
        result = processor.filter_by_values('category', ['A', 'C'])
        self.assertEqual(len(result), 3)
        self.assertTrue(all(r['category'] in ['A', 'C'] for r in result))
        self.compare_with_original(data, 'filter_by_values', 'category', ['A', 'C'])
    
    def test_filter_by_values_empty_list(self):
        """Test filtering by empty value list."""
        data = [{"id": 1, "category": "A"}]
        processor = DataProcessor(data)
        result = processor.filter_by_values('category', [])
        self.assertEqual(result, [])
        self.compare_with_original(data, 'filter_by_values', 'category', [])
    
    def test_filter_by_values_large_list(self):
        """Test filtering with large value list (performance test)."""
        data = [{"v": i % 1000} for i in range(10000)]
        values = list(range(500, 1500))
        processor = DataProcessor(data)
        
        start = time.time()
        result = processor.filter_by_values('v', values)
        elapsed = time.time() - start
        
        self.assertGreater(len(result), 0)
        self.assertLess(elapsed, 0.5, "Should complete quickly with set membership")
        self.compare_with_original(data, 'filter_by_values', 'v', values)
    
    def test_filter_by_range_basic(self):
        """Test range filtering."""
        data = [{"id": i, "value": i * 10} for i in range(10)]
        processor = DataProcessor(data)
        result = processor.filter_by_range('value', 20, 60)
        self.assertEqual(len(result), 5)
        self.assertTrue(all(20 <= r['value'] <= 60 for r in result))
        self.compare_with_original(data, 'filter_by_range', 'value', 20, 60)
    
    def test_filter_by_range_inclusive_boundaries(self):
        """Test range filtering with inclusive boundaries."""
        data = [{"id": i, "value": i} for i in range(5)]
        processor = DataProcessor(data)
        result = processor.filter_by_range('value', 1, 3)
        self.assertEqual(len(result), 3)
        self.compare_with_original(data, 'filter_by_range', 'value', 1, 3)
    
    def test_filter_by_range_no_matches(self):
        """Test range filtering with no matches."""
        data = [{"id": 1, "value": 10}]
        processor = DataProcessor(data)
        result = processor.filter_by_range('value', 100, 200)
        self.assertEqual(result, [])
        self.compare_with_original(data, 'filter_by_range', 'value', 100, 200)
    
    def test_filter_by_predicate_basic(self):
        """Test predicate filtering."""
        data = [{"id": i, "value": i * 10} for i in range(10)]
        processor = DataProcessor(data)
        predicate = lambda r: r.get('value', 0) > 50
        result = processor.filter_by_predicate(predicate)
        self.assertEqual(len(result), 4)
        self.assertTrue(all(r['value'] > 50 for r in result))
        self.compare_with_original(data, 'filter_by_predicate', predicate)
    
    # ========== AGGREGATION TESTS ==========
    
    def test_sum_field_basic(self):
        """Test basic sum calculation."""
        data = [{"id": i, "value": i * 10} for i in range(1, 6)]
        processor = DataProcessor(data)
        result = processor.sum_field('value')
        self.assertEqual(result, 150.0)
        self.compare_with_original(data, 'sum_field', 'value')
    
    def test_sum_field_with_filter(self):
        """Test sum with filter criteria."""
        data = [
            {"id": 1, "category": "A", "value": 10},
            {"id": 2, "category": "B", "value": 20},
            {"id": 3, "category": "A", "value": 30}
        ]
        processor = DataProcessor(data)
        result = processor.sum_field('value', {'category': 'A'})
        self.assertEqual(result, 40.0)
        self.compare_with_original(data, 'sum_field', 'value', {'category': 'A'})
    
    def test_sum_field_empty(self):
        """Test sum on empty dataset."""
        processor = DataProcessor([])
        result = processor.sum_field('value')
        self.assertEqual(result, 0.0)
        self.compare_with_original([], 'sum_field', 'value')
    
    def test_sum_field_missing_field(self):
        """Test sum with missing field."""
        data = [{"id": 1}, {"id": 2, "value": 10}]
        processor = DataProcessor(data)
        result = processor.sum_field('value')
        self.assertEqual(result, 10.0)
        self.compare_with_original(data, 'sum_field', 'value')
    
    def test_average_field_basic(self):
        """Test basic average calculation."""
        data = [{"id": i, "value": i * 10} for i in range(1, 6)]
        processor = DataProcessor(data)
        result = processor.average_field('value')
        self.assertEqual(result, 30.0)
        self.compare_with_original(data, 'average_field', 'value')
    
    def test_average_field_with_filter(self):
        """Test average with filter criteria."""
        data = [
            {"id": 1, "category": "A", "value": 10},
            {"id": 2, "category": "B", "value": 20},
            {"id": 3, "category": "A", "value": 30}
        ]
        processor = DataProcessor(data)
        result = processor.average_field('value', {'category': 'A'})
        self.assertEqual(result, 20.0)
        self.compare_with_original(data, 'average_field', 'value', {'category': 'A'})
    
    def test_average_field_empty(self):
        """Test average on empty dataset."""
        processor = DataProcessor([])
        result = processor.average_field('value')
        self.assertEqual(result, 0.0)
        self.compare_with_original([], 'average_field', 'value')
    
    def test_average_field_single_pass(self):
        """Test that average uses single pass (performance)."""
        data = [{"value": i} for i in range(10000)]
        processor = DataProcessor(data)
        
        start = time.time()
        result = processor.average_field('value')
        elapsed = time.time() - start
        
        self.assertAlmostEqual(result, 4999.5, places=1)
        self.assertLess(elapsed, 0.1, "Should complete quickly with single pass")
        self.compare_with_original(data, 'average_field', 'value')
    
    def test_min_max_field_basic(self):
        """Test basic min/max calculation."""
        data = [{"id": i, "value": i * 10} for i in range(1, 6)]
        processor = DataProcessor(data)
        result = processor.min_max_field('value')
        self.assertEqual(result, {'min': 10, 'max': 50})
        self.compare_with_original(data, 'min_max_field', 'value')
    
    def test_min_max_field_single_value(self):
        """Test min/max with single value."""
        data = [{"id": 1, "value": 42}]
        processor = DataProcessor(data)
        result = processor.min_max_field('value')
        self.assertEqual(result, {'min': 42, 'max': 42})
        self.compare_with_original(data, 'min_max_field', 'value')
    
    def test_min_max_field_empty(self):
        """Test min/max on empty dataset."""
        processor = DataProcessor([])
        result = processor.min_max_field('value')
        self.assertEqual(result, {'min': None, 'max': None})
        self.compare_with_original([], 'min_max_field', 'value')
    
    def test_min_max_field_single_pass(self):
        """Test that min/max uses single pass (performance)."""
        data = [{"value": i} for i in range(10000)]
        processor = DataProcessor(data)
        
        start = time.time()
        result = processor.min_max_field('value')
        elapsed = time.time() - start
        
        self.assertEqual(result, {'min': 0, 'max': 9999})
        self.assertLess(elapsed, 0.1, "Should complete quickly with single pass")
        self.compare_with_original(data, 'min_max_field', 'value')
    
    # ========== GROUPING TESTS ==========
    
    def test_group_by_basic(self):
        """Test basic grouping."""
        data = [
            {"id": 1, "category": "A"},
            {"id": 2, "category": "B"},
            {"id": 3, "category": "A"},
            {"id": 4, "category": "B"}
        ]
        processor = DataProcessor(data)
        result = processor.group_by('category')
        self.assertEqual(len(result), 2)
        self.assertEqual(len(result['A']), 2)
        self.assertEqual(len(result['B']), 2)
        self.compare_with_original(data, 'group_by', 'category')
    
    def test_group_by_empty(self):
        """Test grouping on empty dataset."""
        processor = DataProcessor([])
        result = processor.group_by('category')
        self.assertEqual(result, {})
        self.compare_with_original([], 'group_by', 'category')
    
    def test_count_by_field_basic(self):
        """Test basic counting."""
        data = [
            {"id": 1, "category": "A"},
            {"id": 2, "category": "B"},
            {"id": 3, "category": "A"},
            {"id": 4, "category": "A"}
        ]
        processor = DataProcessor(data)
        result = processor.count_by_field('category')
        self.assertEqual(result, {'A': 3, 'B': 1})
        self.compare_with_original(data, 'count_by_field', 'category')
    
    def test_count_by_field_empty(self):
        """Test counting on empty dataset."""
        processor = DataProcessor([])
        result = processor.count_by_field('category')
        self.assertEqual(result, {})
        self.compare_with_original([], 'count_by_field', 'category')
    
    # ========== UNIQUENESS TESTS ==========
    
    def test_get_unique_values_basic(self):
        """Test getting unique values."""
        data = [
            {"id": 1, "category": "A"},
            {"id": 2, "category": "B"},
            {"id": 3, "category": "A"},
            {"id": 4, "category": "C"}
        ]
        processor = DataProcessor(data)
        result = processor.get_unique_values('category')
        self.assertEqual(set(result), {'A', 'B', 'C'})
        self.compare_with_original(data, 'get_unique_values', 'category')
    
    def test_get_unique_values_empty(self):
        """Test unique values on empty dataset."""
        processor = DataProcessor([])
        result = processor.get_unique_values('category')
        self.assertEqual(result, [])
        self.compare_with_original([], 'get_unique_values', 'category')
    
    def test_find_duplicates_basic(self):
        """Test finding duplicates."""
        data = [
            {"id": 1, "value": 10},
            {"id": 2, "value": 20},
            {"id": 3, "value": 10},
            {"id": 4, "value": 30},
            {"id": 5, "value": 20}
        ]
        processor = DataProcessor(data)
        result = processor.find_duplicates('value')
        self.assertEqual(len(result), 4)  # 2 records with 10, 2 with 20
        values = [r['value'] for r in result]
        self.assertEqual(values.count(10), 2)
        self.assertEqual(values.count(20), 2)
        self.compare_with_original(data, 'find_duplicates', 'value')
    
    def test_find_duplicates_no_duplicates(self):
        """Test finding duplicates when none exist."""
        data = [
            {"id": 1, "value": 10},
            {"id": 2, "value": 20},
            {"id": 3, "value": 30}
        ]
        processor = DataProcessor(data)
        result = processor.find_duplicates('value')
        self.assertEqual(result, [])
        self.compare_with_original(data, 'find_duplicates', 'value')
    
    # ========== SORTING TESTS ==========
    
    def test_top_n_descending(self):
        """Test top N in descending order."""
        data = [{"id": i, "value": i * 10} for i in range(10)]
        processor = DataProcessor(data)
        result = processor.top_n('value', 3, descending=True)
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]['value'], 90)
        self.assertEqual(result[1]['value'], 80)
        self.assertEqual(result[2]['value'], 70)
        self.compare_with_original(data, 'top_n', 'value', 3, descending=True)
    
    def test_top_n_ascending(self):
        """Test top N in ascending order."""
        data = [{"id": i, "value": i * 10} for i in range(10)]
        processor = DataProcessor(data)
        result = processor.top_n('value', 3, descending=False)
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]['value'], 0)
        self.assertEqual(result[1]['value'], 10)
        self.assertEqual(result[2]['value'], 20)
        self.compare_with_original(data, 'top_n', 'value', 3, descending=False)
    
    def test_top_n_more_than_available(self):
        """Test top N when N exceeds available records."""
        data = [{"id": i, "value": i} for i in range(5)]
        processor = DataProcessor(data)
        result = processor.top_n('value', 10, descending=True)
        self.assertEqual(len(result), 5)
        self.compare_with_original(data, 'top_n', 'value', 10, descending=True)
    
    def test_top_n_performance(self):
        """Test top N performance on large dataset."""
        data = [{"id": i, "value": 10000 - i} for i in range(5000)]
        processor = DataProcessor(data)
        
        start = time.time()
        result = processor.top_n('value', 10)
        elapsed = time.time() - start
        
        self.assertEqual(len(result), 10)
        self.assertLess(elapsed, 2.0, "Should complete quickly with efficient sorting")
        self.compare_with_original(data, 'top_n', 'value', 10)
    
    # ========== JOIN TESTS ==========
    
    def test_join_on_one_to_one(self):
        """Test one-to-one join."""
        data1 = [{"id": 1, "name": "A"}, {"id": 2, "name": "B"}]
        data2 = [{"id": 1, "value": 10}, {"id": 2, "value": 20}]
        processor = DataProcessor(data1)
        result = processor.join_on(data2, 'id', 'id')
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['name'], 'A')
        self.assertEqual(result[0]['value'], 10)
        self.compare_with_original(data1, 'join_on', data2, 'id', 'id')
    
    def test_join_on_one_to_many(self):
        """Test one-to-many join."""
        data1 = [{"id": 1, "name": "A"}]
        data2 = [{"id": 1, "value": 10}, {"id": 1, "value": 20}]
        processor = DataProcessor(data1)
        result = processor.join_on(data2, 'id', 'id')
        self.assertEqual(len(result), 2)
        self.compare_with_original(data1, 'join_on', data2, 'id', 'id')
    
    def test_join_on_no_matches(self):
        """Test join with no matches."""
        data1 = [{"id": 1, "name": "A"}]
        data2 = [{"id": 2, "value": 10}]
        processor = DataProcessor(data1)
        result = processor.join_on(data2, 'id', 'id')
        self.assertEqual(result, [])
        self.compare_with_original(data1, 'join_on', data2, 'id', 'id')
    
    def test_join_on_performance(self):
        """Test join performance (hash join vs nested loops)."""
        data1 = [{"id": i} for i in range(1000)]
        data2 = [{"id": i, "extra": f"data_{i}"} for i in range(1000)]
        processor = DataProcessor(data1)
        
        start = time.time()
        result = processor.join_on(data2, 'id', 'id')
        elapsed = time.time() - start
        
        self.assertEqual(len(result), 1000)
        self.assertLess(elapsed, 1.0, "Should complete quickly with hash join")
        self.compare_with_original(data1, 'join_on', data2, 'id', 'id')
    
    # ========== EDGE CASES ==========
    
    def test_empty_dataset_all_methods(self):
        """Test all methods with empty dataset."""
        processor = DataProcessor([])
        
        self.assertEqual(processor.filter_by_field('any', 1), [])
        self.assertEqual(processor.filter_by_fields({'any': 1}), [])
        self.assertEqual(processor.filter_by_values('any', [1]), [])
        self.assertEqual(processor.filter_by_range('any', 0, 100), [])
        self.assertEqual(processor.count_by_field('any'), {})
        self.assertEqual(processor.sum_field('any'), 0.0)
        self.assertEqual(processor.average_field('any'), 0.0)
        self.assertEqual(processor.min_max_field('any'), {'min': None, 'max': None})
        self.assertEqual(processor.group_by('any'), {})
        self.assertEqual(processor.get_unique_values('any'), [])
        self.assertEqual(processor.find_duplicates('any'), [])
        self.assertEqual(processor.top_n('any', 10), [])
    
    def test_missing_fields_handling(self):
        """Test methods handle missing fields gracefully."""
        data = [
            {"id": 1},
            {"id": 2, "value": 10},
            {"id": 3, "value": 20}
        ]
        processor = DataProcessor(data)
        
        result = processor.filter_by_field('value', 10)
        self.assertEqual(len(result), 1)
        
        result = processor.sum_field('value')
        self.assertEqual(result, 30.0)
        
        result = processor.average_field('value')
        self.assertEqual(result, 15.0)
        
        self.compare_with_original(data, 'filter_by_field', 'value', 10)
        self.compare_with_original(data, 'sum_field', 'value')
        self.compare_with_original(data, 'average_field', 'value')
    
    def test_single_record_dataset(self):
        """Test methods with single record."""
        data = [{"id": 1, "value": 100, "category": "A"}]
        processor = DataProcessor(data)
        
        self.assertEqual(len(processor.filter_by_field('id', 1)), 1)
        self.assertEqual(processor.sum_field('value'), 100.0)
        self.assertEqual(processor.average_field('value'), 100.0)
        self.assertEqual(processor.min_max_field('value'), {'min': 100, 'max': 100})
        self.assertEqual(len(processor.group_by('category')['A']), 1)
        
        self.compare_with_original(data, 'filter_by_field', 'id', 1)
        self.compare_with_original(data, 'sum_field', 'value')
        self.compare_with_original(data, 'average_field', 'value')
    
    def test_all_records_match(self):
        """Test filtering when all records match."""
        data = [
            {"id": 1, "category": "A"},
            {"id": 2, "category": "A"},
            {"id": 3, "category": "A"}
        ]
        processor = DataProcessor(data)
        result = processor.filter_by_field('category', 'A')
        self.assertEqual(len(result), 3)
        self.compare_with_original(data, 'filter_by_field', 'category', 'A')
    
    def test_large_dataset_performance(self):
        """Test performance on large dataset (100k records)."""
        try:
            data = self.load_resource('datasets', 'large_100k.json')
            processor = DataProcessor(data)
            
            # Test filter performance
            start = time.time()
            result = processor.filter_by_field('category', 'A')
            filter_time = time.time() - start
            
            self.assertGreater(len(result), 0)
            self.assertLess(filter_time, 1.0, "Filter should complete quickly with index")
            
            # Test aggregation performance
            start = time.time()
            total = processor.sum_field('value')
            sum_time = time.time() - start
            
            self.assertGreater(total, 0)
            self.assertLess(sum_time, 1.0, "Sum should complete quickly")
            
        except FileNotFoundError:
            self.skipTest("Large dataset file not found")
    
    def test_mixed_types(self):
        """Test handling of mixed data types."""
        data = [
            {"id": 1, "val": 10},
            {"id": 2, "val": "10"},
            {"id": 3, "val": 10.5}
        ]
        processor = DataProcessor(data)
        
        # Filter should handle type correctly
        result = processor.filter_by_field('val', 10)
        # Should match only exact type match
        self.compare_with_original(data, 'filter_by_field', 'val', 10)


class TestDataProcessorIntegration(unittest.TestCase):
    """Integration tests using test resources."""
    
    def load_resource(self, category, filename):
        """Helper to load test resources."""
        path = os.path.join(os.path.dirname(__file__), 'resources', category, filename)
        with open(path, 'r') as f:
            return json.load(f)
    
    def compare_with_original(self, records, method_name, *args, **kwargs):
        """Helper to compare optimized implementation with original."""
        orig = OriginalProcessor(records)
        opt = DataProcessor(records)
        
        orig_method = getattr(orig, method_name)
        opt_method = getattr(opt, method_name)
        
        orig_result = orig_method(*args, **kwargs)
        opt_result = opt_method(*args, **kwargs)
        
        if isinstance(orig_result, list):
            self.assertEqual(len(orig_result), len(opt_result))
            if orig_result and isinstance(orig_result[0], dict):
                orig_sorted = sorted(orig_result, key=str)
                opt_sorted = sorted(opt_result, key=str)
                self.assertEqual(orig_sorted, opt_sorted)
            else:
                self.assertEqual(sorted(orig_result), sorted(opt_result))
        else:
            self.assertEqual(orig_result, opt_result)
    
    def test_integration_small_basic(self):
        """Integration test with small basic dataset."""
        data = self.load_resource('datasets', 'small_basic.json')
        
        # Test various operations
        self.compare_with_original(data, 'filter_by_field', 'category', 'A')
        self.compare_with_original(data, 'filter_by_fields', {'category': 'A', 'score': 5})
        self.compare_with_original(data, 'sum_field', 'value')
        self.compare_with_original(data, 'average_field', 'value')
        self.compare_with_original(data, 'group_by', 'category')
    
    def test_integration_duplicates(self):
        """Integration test with duplicates dataset."""
        data = self.load_resource('datasets', 'duplicates.json')
        self.compare_with_original(data, 'find_duplicates', 'val')
    
    def test_integration_missing_fields(self):
        """Integration test with missing fields dataset."""
        data = self.load_resource('datasets', 'missing_fields.json')
        self.compare_with_original(data, 'filter_by_field', 'value', 20.0)
        self.compare_with_original(data, 'sum_field', 'value')
    
    def test_integration_joins(self):
        """Integration test with join datasets."""
        data1 = self.load_resource('joins', 'one_to_one.json')
        data2 = self.load_resource('joins', 'one_to_one.json')
        self.compare_with_original(data1, 'join_on', data2, 'id', 'id')
        
        data2_many = self.load_resource('joins', 'one_to_many.json')
        self.compare_with_original(data1, 'join_on', data2_many, 'id', 'id')
    
    def test_integration_aggregation(self):
        """Integration test with aggregation datasets."""
        data = self.load_resource('aggregation', 'sum_only.json')
        self.compare_with_original(data, 'sum_field', 'v')
        
        data = self.load_resource('aggregation', 'avg_only.json')
        self.compare_with_original(data, 'average_field', 'v')
        
        data = self.load_resource('aggregation', 'min_max.json')
        self.compare_with_original(data, 'min_max_field', 'v')


if __name__ == '__main__':
    unittest.main()

import unittest
import json
import os
import sys

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from repository_after.data_processor import DataProcessor
from repository_before.main import DataProcessor as OriginalProcessor

class TestAfterImplementation(unittest.TestCase):
    
    def load_resource(self, category, filename):
        path = os.path.join(os.path.dirname(__file__), 'resources', category, filename)
        with open(path, 'r') as f:
            return json.load(f)

    def compare_outputs(self, records, method_name, *args, **kwargs):
        orig = OriginalProcessor(records)
        opt = DataProcessor(records)
        
        orig_method = getattr(orig, method_name)
        opt_method = getattr(opt, method_name)
        
        self.assertEqual(orig_method(*args, **kwargs), opt_method(*args, **kwargs))

    # --- Filtering ---

    def test_filter_single_field(self):
        data = self.load_resource('datasets', 'small_basic.json')
        self.compare_outputs(data, 'filter_by_field', 'category', 'A')

    def test_filter_multi_field(self):
        data = self.load_resource('datasets', 'small_basic.json')
        self.compare_outputs(data, 'filter_by_fields', {'category': 'A', 'score': 5})

    def test_filter_missing_fields(self):
        data = self.load_resource('datasets', 'missing_fields.json')
        self.compare_outputs(data, 'filter_by_field', 'value', 20.0)

    def test_filter_empty(self):
        data = self.load_resource('datasets', 'empty.json')
        self.compare_outputs(data, 'filter_by_field', 'any', 1)

    def test_filter_large_100k(self):
        data = self.load_resource('datasets', 'large_100k.json')
        # Just check first 10 matches to keep it reasonable if it fails
        self.compare_outputs(data, 'filter_by_field', 'category', 'B')

    def test_filter_by_values(self):
        data = self.load_resource('datasets', 'small_basic.json')
        self.compare_outputs(data, 'filter_by_values', 'category', ['A', 'C'])

    def test_filter_by_predicate(self):
        data = self.load_resource('datasets', 'small_basic.json')
        predicate = lambda r: r.get('value', 0) > 15
        self.compare_outputs(data, 'filter_by_predicate', predicate)

    def test_filter_zero_match(self):
        data = self.load_resource('datasets', 'small_basic.json')
        self.compare_outputs(data, 'filter_by_field', 'category', 'Z')

    def test_filter_by_range(self):
        data = self.load_resource('datasets', 'range_edges.json')
        self.compare_outputs(data, 'filter_by_range', 'v', 0, 100)

    def test_filter_by_range_edges(self):
        data = self.load_resource('datasets', 'range_edges.json')
        # Test inclusive boundaries
        self.compare_outputs(data, 'filter_by_range', 'v', 0, 0)
        self.compare_outputs(data, 'filter_by_range', 'v', 100, 100)

    # --- Aggregation ---

    def test_sum_no_filter(self):
        data = self.load_resource('aggregation', 'sum_only.json')
        self.compare_outputs(data, 'sum_field', 'v')

    def test_sum_with_filter(self):
        data = self.load_resource('datasets', 'small_basic.json')
        self.compare_outputs(data, 'sum_field', 'value', {'category': 'A'})

    def test_average(self):
        data = self.load_resource('aggregation', 'avg_only.json')
        self.compare_outputs(data, 'average_field', 'v')

    def test_min_max(self):
        data = self.load_resource('aggregation', 'min_max.json')
        self.compare_outputs(data, 'min_max_field', 'v')

    def test_aggregation_empty(self):
        data = self.load_resource('datasets', 'empty.json')
        self.compare_outputs(data, 'sum_field', 'v')
        self.compare_outputs(data, 'average_field', 'v')
        self.compare_outputs(data, 'min_max_field', 'v')

    # --- Uniqueness & Duplicates ---

    def test_unique_values(self):
        data = self.load_resource('datasets', 'small_basic.json')
        self.compare_outputs(data, 'get_unique_values', 'category')

    def test_find_duplicates(self):
        data = self.load_resource('datasets', 'duplicates.json')
        self.compare_outputs(data, 'find_duplicates', 'val')

    def test_duplicate_stress(self):
        data = self.load_resource('performance', 'repeated_values.json')
        self.compare_outputs(data, 'find_duplicates', 'v')

    # --- Sorting ---

    def test_top_n_descending(self):
        data = self.load_resource('sorting', 'unstable_input.json')
        self.compare_outputs(data, 'top_n', 'v', 10, descending=True)

    def test_top_n_ascending(self):
        data = self.load_resource('sorting', 'unstable_input.json')
        self.compare_outputs(data, 'top_n', 'v', 10, descending=False)

    def test_stable_sorting(self):
        data = self.load_resource('sorting', 'equal_keys.json')
        # Original uses a manual bubble sort which is stable. 
        # Python's Timsort (built-in sorted) is also stable.
        self.compare_outputs(data, 'top_n', 'v', 5)

    # --- Grouping ---

    def test_group_by(self):
        data = self.load_resource('datasets', 'small_basic.json')
        self.compare_outputs(data, 'group_by', 'category')

    def test_group_by_skewed(self):
        data = self.load_resource('datasets', 'skewed_distribution.json')
        self.compare_outputs(data, 'group_by', 'type')

    # --- Joining ---

    def test_one_to_one_join(self):
        data1 = self.load_resource('joins', 'one_to_one.json')
        data2 = self.load_resource('joins', 'one_to_one.json')
        self.compare_outputs(data1, 'join_on', data2, 'id', 'id')

    def test_one_to_many_join(self):
        data1 = self.load_resource('joins', 'one_to_one.json')
        data2 = self.load_resource('joins', 'one_to_many.json')
        self.compare_outputs(data1, 'join_on', data2, 'id', 'id')

    def test_no_match_join(self):
        data1 = self.load_resource('joins', 'one_to_one.json')
        data2 = self.load_resource('joins', 'no_match.json')
        self.compare_outputs(data1, 'join_on', data2, 'id', 'id')

    # --- Safety ---

    def test_mixed_types(self):
        data = self.load_resource('datasets', 'mixed_types.json')
        # equality check should handle mixed types correctly
        self.compare_outputs(data, 'filter_by_field', 'val', 10)

    def test_filter_by_fields_all_indexed(self):
        """Test: filter_by_fields when all criteria fields are already indexed."""
        data = self.load_resource('datasets', 'small_basic.json')
        processor = DataProcessor(data)
        # Pre-index both fields
        processor.filter_by_field('category', 'A')
        processor.filter_by_field('score', 5)
        # Now test multi-field filter with both fields indexed
        self.compare_outputs(data, 'filter_by_fields', {'category': 'A', 'score': 5})

    def test_filter_by_values_large_list(self):
        """Test: filter_by_values with very large value list."""
        data = [{"v": i % 1000} for i in range(10000)]
        # Create a large value list (1000 values)
        values = list(range(500, 1500))
        self.compare_outputs(data, 'filter_by_values', 'v', values)

    def test_filter_by_range_large_range(self):
        """Test: filter_by_range with very large range."""
        data = [{"v": i} for i in range(10000)]
        self.compare_outputs(data, 'filter_by_range', 'v', 0, 9999)

if __name__ == '__main__':
    unittest.main()

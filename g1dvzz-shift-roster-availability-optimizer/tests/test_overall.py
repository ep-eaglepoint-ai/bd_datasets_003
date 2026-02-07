
import unittest
import timeit
import random
import sys
import os
import collections

# Ensure we can import from repository_before and repository_after
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from repository_before.staff_scheduler import StaffAggregator as StaffAggregatorBefore
from repository_after.staff_scheduler import StaffAggregator as StaffAggregatorAfter

class TestStaffScheduler(unittest.TestCase):
    def setUp(self):
        """
        Setup dataset and select Target Implementation based on ENV variable.
        """
        self.target_env = os.environ.get('TARGET', 'AFTER')
        
        if self.target_env == 'BEFORE':
            self.TargetClass = StaffAggregatorBefore
            print(f"\n[Running Tests against BEFORE implementation]")
        else:
            self.TargetClass = StaffAggregatorAfter
            print(f"\n[Running Tests against AFTER implementation]")

        # Dataset for correctness
        self.basic_employees = [
            {'name': 'Alice', 'role': 'Kitchen Prep', 'on_duty': False}, 
            {'name': 'Bob',   'role': 'Kitchen Prep', 'on_duty': True},
            {'name': 'Charlie','role': 'Server',       'on_duty': False},
        ]
        self.basic_agg = self.TargetClass(self.basic_employees)
        
        # Dataset for performance
        self.num_employees = 20000
        self.roles = [f"Role_{i}" for i in range(100)]
        self.large_employees = []
        for i in range(self.num_employees):
            self.large_employees.append({
                'name': f'Employee_{i}',
                'role': random.choice(self.roles),
                'on_duty': random.choice([True, False])
            })
        self.large_agg = self.TargetClass(self.large_employees)

    # Test 1: Preservation of Legacy Logic (Basic Correctness)
    # Checks positive case: "Kitchen Prep" -> "Alice"
    def test_1_preservation_correctness(self):
        result = self.basic_agg.get_eligible_workers('Kitchen Prep')
        self.assertEqual(result, ['Alice'], "Failed basic correctness check (Preservation)")

    # Test 2: Req 1 - Dictionary-Based Indexing
    def test_2_req1_dictionary_indexing(self):
        # Expected: FAIL on BEFORE, PASS on AFTER
        
        # Check if 'role_map' attribute exists
        if not hasattr(self.large_agg, 'role_map'):
            self.fail("Req 1 Failed: No 'role_map' attribute found (Dictionary Indexing missing)")
            
        role_map = self.large_agg.role_map
        # Check if it is a dictionary-like structure
        if not isinstance(role_map, (dict, collections.defaultdict)):
             self.fail("Req 1 Failed: 'role_map' is not a dictionary")
             
        # Check if values are lists of employees (full dicts)
        if role_map:
            first_key = list(role_map.keys())[0]
            val = role_map[first_key]
            if not isinstance(val, list):
                self.fail("Req 1 Failed: Values in role_map must be lists")
            if val and not isinstance(val[0], dict):
                 self.fail("Req 1 Failed: Values in role_map must be employee objects (dicts)")

    # Test 3: Req 2 - Sub-millisecond Response
    def test_3_req2_sub_millisecond(self):
        # Expected: FAIL on BEFORE, PASS on AFTER
        runs = 100
        target = 'Role_50'
        t = timeit.timeit(lambda: self.large_agg.get_eligible_workers(target), number=runs)
        avg_time = t / runs
        
        # Strict Requirement: < 1ms (0.001s)
        if avg_time >= 0.001:
            self.fail(f"Req 2 Failed: Response time {avg_time*1000:.3f}ms is not sub-millisecond (<1ms)")

    # Test 4: Req 3 - 100x Speedup Performance Standards
    def test_4_req3_performance_standard(self):
        # Expected: FAIL on BEFORE, PASS on AFTER
        runs = 100
        target = 'Role_50'
        
        # Measure Baseline (Always Before) to calculate speedup
        baseline_agg = StaffAggregatorBefore(self.large_employees)
        t_baseline = timeit.timeit(lambda: baseline_agg.get_eligible_workers(target), number=runs)
        
        # Measure Target
        t_target = timeit.timeit(lambda: self.large_agg.get_eligible_workers(target), number=runs)
        if t_target == 0: t_target = 1e-9
            
        speedup = t_baseline / t_target
        print(f"\n[Req 3] Speedup vs Baseline: {speedup:.2f}x")
        
        if speedup < 100:
             self.fail(f"Req 3 Failed: Speedup {speedup:.2f}x is less than 100x requirement")

    # Test 5: Req 4 - Edge Cases Correctness (No Match / All Busy)
    def test_5_req4_edge_cases(self):
        # Expected: PASS on BOTH (Legacy handles this correctly too)
        
        # Case A: No Match
        self.assertEqual(self.basic_agg.get_eligible_workers('Astronaut'), [], "Req 4 Failed: Non-existent role should return empty list")
        
        # Case B: All Busy
        busy_employees = [{'name': 'Busy', 'role': 'BusyRole', 'on_duty': True}]
        agg = self.TargetClass(busy_employees)
        self.assertEqual(agg.get_eligible_workers('BusyRole'), [], "Req 4 Failed: All busy employees should return empty list")

if __name__ == '__main__':
    unittest.main()

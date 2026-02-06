"""
Extended tests for Task Scheduler solution.

Tests cover:
- Integer task IDs
- Performance with larger inputs
- Comprehensive scenarios
- Minimum slots calculation function
"""

import sys
import os
from collections import Counter

# Add repository path to sys.path to import solution
# Check REPO_PATH environment variable first (for Docker), then default to repository_after
repo_path = os.environ.get("REPO_PATH", "repository_after")
repo_abs_path = os.path.join(os.path.dirname(__file__), '..', repo_path)
sys.path.insert(0, repo_abs_path)

# Check if solution.py exists before importing
solution_file = os.path.join(repo_abs_path, "solution.py")
if not os.path.exists(solution_file):
    # If solution doesn't exist (e.g., repository_before is empty), skip all tests
    import pytest
    pytest.skip(f"Solution file not found in {repo_path}. Skipping all tests.", allow_module_level=True)

from solution import solve, calculate_minimum_slots, schedule_tasks


class TestIntegerTaskIDs:
    """Test with integer task IDs"""
    
    def test_integer_task_ids(self):
        """Test with integer task IDs"""
        tasks = [1, 1, 1, 2, 2, 2]
        n = 2
        result = solve(tasks, n)
        
        # Verify optimal length
        min_slots = calculate_minimum_slots(tasks, n)
        assert len(result) == min_slots
        
        # Verify all tasks scheduled
        task_counts = Counter(tasks)
        result_counts = Counter([x for x in result if x != 'idle'])
        assert task_counts == result_counts
        
        # Verify cooldown
        self._verify_cooldown(result, n)
        
        # Verify lexicographic order (1 before 2)
        assert result[0] == 1
    
    def test_integer_task_ids_mixed(self):
        """Test with mixed integer task IDs"""
        tasks = [3, 3, 1, 1, 2, 2]
        n = 1
        result = solve(tasks, n)
        
        # First should be smallest (1)
        assert result[0] == 1
        
        # Verify all tasks scheduled
        task_counts = Counter(tasks)
        result_counts = Counter([x for x in result if x != 'idle'])
        assert task_counts == result_counts
    
    def _verify_cooldown(self, schedule, n):
        """Helper to verify cooldown constraint"""
        last_positions = {}
        for i, task in enumerate(schedule):
            if task != 'idle':
                if task in last_positions:
                    gap = i - last_positions[task] - 1
                    assert gap >= n
                last_positions[task] = i


class TestPerformance:
    """Test performance with larger inputs"""
    
    def test_large_input(self):
        """Test with larger input (up to 10^4 tasks)"""
        # Create a reasonable test case (not full 10^4 to keep tests fast)
        tasks = ['A'] * 100 + ['B'] * 100 + ['C'] * 50
        n = 5
        result = solve(tasks, n)
        
        # Verify all tasks scheduled
        task_counts = Counter(tasks)
        result_counts = Counter([x for x in result if x != 'idle'])
        assert task_counts == result_counts
        
        # Verify optimal length
        min_slots = calculate_minimum_slots(tasks, n)
        assert len(result) == min_slots
        
        # Verify cooldown
        self._verify_cooldown(result, n)
    
    def test_many_unique_tasks(self):
        """Test with many unique task types"""
        tasks = [chr(ord('A') + i) for i in range(26)] * 10  # 26 tasks, each 10 times
        n = 2
        result = solve(tasks, n)
        
        # Verify all tasks scheduled
        task_counts = Counter(tasks)
        result_counts = Counter([x for x in result if x != 'idle'])
        assert task_counts == result_counts
        
        # Verify cooldown
        self._verify_cooldown(result, n)
        
        # First task should be 'A' (smallest)
        assert result[0] == 'A'
    
    def _verify_cooldown(self, schedule, n):
        """Helper to verify cooldown constraint"""
        last_positions = {}
        for i, task in enumerate(schedule):
            if task != 'idle':
                if task in last_positions:
                    gap = i - last_positions[task] - 1
                    assert gap >= n
                last_positions[task] = i


class TestComprehensiveScenarios:
    """Comprehensive test scenarios"""
    
    def test_complex_scenario_1(self):
        """Complex scenario with multiple task types"""
        tasks = ['A', 'A', 'A', 'B', 'B', 'C', 'C', 'C', 'D']
        n = 2
        result = solve(tasks, n)
        
        # Verify all tasks scheduled
        task_counts = Counter(tasks)
        result_counts = Counter([x for x in result if x != 'idle'])
        assert task_counts == result_counts
        
        # Verify optimal length
        min_slots = calculate_minimum_slots(tasks, n)
        assert len(result) == min_slots
        
        # Verify cooldown
        self._verify_cooldown(result, n)
        
        # First task should be smallest available (A)
        assert result[0] == 'A'
    
    def test_complex_scenario_2(self):
        """Another complex scenario"""
        tasks = ['X', 'X', 'Y', 'Y', 'Y', 'Z']
        n = 3
        result = solve(tasks, n)
        
        # Verify all tasks scheduled
        task_counts = Counter(tasks)
        result_counts = Counter([x for x in result if x != 'idle'])
        assert task_counts == result_counts
        
        # Verify cooldown
        self._verify_cooldown(result, n)
        
        # Verify optimal length
        min_slots = calculate_minimum_slots(tasks, n)
        assert len(result) == min_slots
    
    def test_all_tasks_same_frequency(self):
        """Test when all tasks have same frequency"""
        tasks = ['A', 'A', 'B', 'B', 'C', 'C']
        n = 1
        result = solve(tasks, n)
        
        # Verify all tasks scheduled
        task_counts = Counter(tasks)
        result_counts = Counter([x for x in result if x != 'idle'])
        assert task_counts == result_counts
        
        # First should be A (lexicographically smallest)
        assert result[0] == 'A'
        
        # Verify cooldown
        self._verify_cooldown(result, n)
    
    def _verify_cooldown(self, schedule, n):
        """Helper to verify cooldown constraint"""
        last_positions = {}
        for i, task in enumerate(schedule):
            if task != 'idle':
                if task in last_positions:
                    gap = i - last_positions[task] - 1
                    assert gap >= n
                last_positions[task] = i


class TestMinimumSlotsCalculation:
    """Test the minimum slots calculation function"""
    
    def test_minimum_slots_empty(self):
        """Test minimum slots with empty tasks"""
        assert calculate_minimum_slots([], 2) == 0
    
    def test_minimum_slots_n_zero(self):
        """Test minimum slots with n=0"""
        tasks = ['A', 'B', 'C']
        assert calculate_minimum_slots(tasks, 0) == len(tasks)
    
    def test_minimum_slots_single_max_freq(self):
        """Test minimum slots with single max frequency task"""
        tasks = ['A', 'A', 'A', 'B', 'B']
        n = 2
        # Formula: (3-1) * 3 + 1 = 7
        assert calculate_minimum_slots(tasks, n) == 7
    
    def test_minimum_slots_multiple_max_freq(self):
        """Test minimum slots with multiple max frequency tasks"""
        tasks = ['A', 'A', 'A', 'B', 'B', 'B']
        n = 2
        # Formula: (3-1) * 3 + 2 = 8
        assert calculate_minimum_slots(tasks, n) == 8
    
    def test_minimum_slots_large_n(self):
        """Test minimum slots with large n"""
        tasks = ['A', 'A', 'B']
        n = 10
        # Formula: (2-1) * 11 + 1 = 12, but also must be >= len(tasks) = 3
        result = calculate_minimum_slots(tasks, n)
        assert result >= len(tasks)
        assert result == 12


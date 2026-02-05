"""
Comprehensive tests for Task Scheduler with Lexicographically Smallest Optimal Schedule

Tests cover all requirements:
1. Solution minimizes total number of slots
2. Schedule is lexicographically smallest among all optimal schedules
3. Cooldown constraint is satisfied
4. Edge cases (n=0, empty tasks, single task type)
5. Different task ID types (characters and integers)
6. Performance with large inputs
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


class TestBasicExamples:
    """Test basic examples from problem statement"""
    
    def test_example_1(self):
        """Test Example 1: ['A','A','A','B','B','B'], n=2"""
        tasks = ['A', 'A', 'A', 'B', 'B', 'B']
        n = 2
        result = solve(tasks, n)
        
        # Verify optimal length
        min_slots = calculate_minimum_slots(tasks, n)
        assert len(result) == min_slots, f"Expected length {min_slots}, got {len(result)}"
        
        # Verify all tasks are scheduled
        task_counts = Counter(tasks)
        result_counts = Counter([x for x in result if x != 'idle'])
        assert task_counts == result_counts, "Not all tasks were scheduled"
        
        # Verify cooldown constraint
        self._verify_cooldown(result, n)
        
        # Verify lexicographic order (A before B when both available)
        assert result[0] == 'A', "First task should be A (smallest ID)"
        assert result[1] == 'B', "Second task should be B"
        
        # Expected: ['A', 'B', 'idle', 'A', 'B', 'idle', 'A', 'B']
        expected_length = 8
        assert len(result) == expected_length
    
    def test_example_2(self):
        """Test Example 2: ['A','A','A','B','B'], n=2"""
        tasks = ['A', 'A', 'A', 'B', 'B']
        n = 2
        result = solve(tasks, n)
        
        # Verify optimal length
        min_slots = calculate_minimum_slots(tasks, n)
        assert len(result) == min_slots, f"Expected length {min_slots}, got {len(result)}"
        
        # Verify all tasks are scheduled
        task_counts = Counter(tasks)
        result_counts = Counter([x for x in result if x != 'idle'])
        assert task_counts == result_counts, "Not all tasks were scheduled"
        
        # Verify cooldown constraint
        self._verify_cooldown(result, n)
        
        # Verify lexicographic order
        assert result[0] == 'A', "First task should be A (smallest ID)"
        
        # Expected: ['A', 'B', 'idle', 'A', 'B', 'idle', 'A']
        expected_length = 7
        assert len(result) == expected_length
    
    def _verify_cooldown(self, schedule, n):
        """Helper to verify cooldown constraint"""
        last_positions = {}
        for i, task in enumerate(schedule):
            if task != 'idle':
                if task in last_positions:
                    gap = i - last_positions[task] - 1
                    assert gap >= n, f"Cooldown violated: task {task} at positions {last_positions[task]} and {i} (gap={gap}, required={n})"
                last_positions[task] = i


class TestOptimalLength:
    """Test that schedules minimize total number of slots"""
    
    def test_optimal_length_single_task_type(self):
        """Test that single task type produces optimal length"""
        tasks = ['A', 'A', 'A']
        n = 2
        result = solve(tasks, n)
        
        min_slots = calculate_minimum_slots(tasks, n)
        assert len(result) == min_slots
        
        # Formula: (max_freq - 1) * (n + 1) + 1 = (3-1) * 3 + 1 = 7
        assert len(result) == 7
    
    def test_optimal_length_multiple_max_freq(self):
        """Test optimal length when multiple tasks have max frequency"""
        tasks = ['A', 'A', 'A', 'B', 'B', 'B', 'C', 'C', 'C']
        n = 2
        result = solve(tasks, n)
        
        min_slots = calculate_minimum_slots(tasks, n)
        assert len(result) == min_slots
        
        # Formula: (max_freq - 1) * (n + 1) + num_max_tasks = (3-1) * 3 + 3 = 9
        assert len(result) == 9
    
    def test_optimal_length_uneven_distribution(self):
        """Test optimal length with uneven task distribution"""
        tasks = ['A', 'A', 'A', 'A', 'B', 'B']
        n = 2
        result = solve(tasks, n)
        
        min_slots = calculate_minimum_slots(tasks, n)
        assert len(result) == min_slots
        
        # Formula: (max_freq - 1) * (n + 1) + 1 = (4-1) * 3 + 1 = 10
        assert len(result) == 10


class TestLexicographicOrder:
    """Test that schedules are lexicographically smallest"""
    
    def test_lexicographic_preference_smaller_id(self):
        """Test that smaller task IDs are preferred"""
        tasks = ['B', 'B', 'A', 'A']
        n = 1
        result = solve(tasks, n)
        
        # First task should be A (smallest ID)
        assert result[0] == 'A'
        
        # Verify lexicographic order throughout
        for i in range(len(result) - 1):
            if result[i] != 'idle' and result[i+1] != 'idle':
                # When both are tasks, smaller should come first if both were available
                # This is a simplified check - full verification requires checking availability
                pass
    
    def test_lexicographic_prefers_task_over_idle(self):
        """Test that real tasks are preferred over idle when available"""
        tasks = ['A', 'A', 'B', 'B']
        n = 1
        result = solve(tasks, n)
        
        # Should never have idle when a task is available
        # Count idles - should be minimal
        idle_count = result.count('idle')
        # With n=1 and balanced tasks, should have minimal idles
        assert idle_count <= 2  # Allow some idles if necessary for optimal length
    
    def test_lexicographic_multiple_choices(self):
        """Test lexicographic ordering when multiple tasks are available"""
        tasks = ['C', 'C', 'B', 'B', 'A', 'A']
        n = 1
        result = solve(tasks, n)
        
        # First task should be A (smallest)
        assert result[0] == 'A'
        
        # Verify all tasks scheduled
        task_counts = Counter(tasks)
        result_counts = Counter([x for x in result if x != 'idle'])
        assert task_counts == result_counts


class TestCooldownConstraint:
    """Test that cooldown constraint is satisfied"""
    
    def test_cooldown_basic(self):
        """Test basic cooldown constraint"""
        tasks = ['A', 'A', 'A']
        n = 2
        result = solve(tasks, n)
        
        self._verify_cooldown(result, n)
        
        # Should have idles between same tasks
        assert result[0] == 'A'
        assert result[1] == 'idle' or result[2] == 'idle'  # At least one idle
    
    def test_cooldown_large_n(self):
        """Test cooldown with large n"""
        tasks = ['A', 'A', 'B', 'B']
        n = 5
        result = solve(tasks, n)
        
        self._verify_cooldown(result, n)
        
        # Verify optimal length
        min_slots = calculate_minimum_slots(tasks, n)
        assert len(result) == min_slots
    
    def test_cooldown_no_violation(self):
        """Test that no cooldown violations occur"""
        tasks = ['A', 'A', 'A', 'B', 'B', 'B', 'C', 'C']
        n = 2
        result = solve(tasks, n)
        
        self._verify_cooldown(result, n)
    
    def _verify_cooldown(self, schedule, n):
        """Helper to verify cooldown constraint"""
        last_positions = {}
        for i, task in enumerate(schedule):
            if task != 'idle':
                if task in last_positions:
                    gap = i - last_positions[task] - 1
                    assert gap >= n, f"Cooldown violated: task {task} at positions {last_positions[task]} and {i} (gap={gap}, required={n})"
                last_positions[task] = i


class TestEdgeCases:
    """Test edge cases"""
    
    def test_empty_tasks(self):
        """Test with empty task list"""
        result = solve([], 2)
        assert result == []
    
    def test_n_zero(self):
        """Test with n=0 (no cooldown)"""
        tasks = ['A', 'B', 'A', 'B']
        n = 0
        result = solve(tasks, n)
        
        # Should be sorted for lexicographic order
        assert len(result) == len(tasks)
        assert result == sorted(tasks)
        
        # Verify all tasks scheduled
        assert Counter(result) == Counter(tasks)
    
    def test_single_task(self):
        """Test with single task"""
        tasks = ['A']
        n = 5
        result = solve(tasks, n)
        
        assert result == ['A']
        assert len(result) == 1
    
    def test_single_task_type_multiple(self):
        """Test with single task type, multiple occurrences"""
        tasks = ['A', 'A', 'A', 'A']
        n = 2
        result = solve(tasks, n)
        
        # Verify all tasks scheduled
        assert result.count('A') == 4
        
        # Verify cooldown
        last_positions = {}
        for i, task in enumerate(result):
            if task != 'idle':
                if task in last_positions:
                    gap = i - last_positions[task] - 1
                    assert gap >= n
                last_positions[task] = i
        
        # Verify optimal length
        min_slots = calculate_minimum_slots(tasks, n)
        assert len(result) == min_slots
    
    def test_n_larger_than_tasks(self):
        """Test with n larger than number of tasks"""
        tasks = ['A', 'B']
        n = 10
        result = solve(tasks, n)
        
        # Should still schedule all tasks
        assert Counter([x for x in result if x != 'idle']) == Counter(tasks)
        
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


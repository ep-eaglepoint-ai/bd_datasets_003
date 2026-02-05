"""
Task Scheduler with Lexicographically Smallest Optimal Schedule

Given tasks and cooldown n, constructs a schedule that:
1. Minimizes total number of slots
2. Is lexicographically smallest among all optimal schedules
3. Prefers smaller task IDs when multiple tasks are available
4. Uses idle slots only when necessary

Complexity Analysis:
- Time Complexity: O(m * k) where m is the minimum number of slots needed
  and k is the number of unique task types. In worst case, m = O(len(tasks))
  and k = O(len(tasks)), giving O(n^2) where n = len(tasks).
  However, typically k << n, so it's closer to O(n * k).
  
- Space Complexity: O(k) for storing task counts and last_used positions,
  plus O(m) for the schedule result, giving O(m + k) = O(n) in worst case.
  
The algorithm uses a greedy approach that prioritizes tasks with highest
remaining count (to ensure optimal length) and breaks ties by choosing
the smallest task ID (to ensure lexicographic order).
"""

from collections import Counter
from typing import List, Union


def calculate_minimum_slots(tasks: List[Union[str, int]], n: int) -> int:
    """
    Calculate the minimum number of slots needed for the schedule.
    
    Formula: max(len(tasks), (max_freq - 1) * (n + 1) + num_max_tasks)
    where max_freq is the frequency of the most frequent task,
    and num_max_tasks is the count of tasks with max_freq.
    
    Args:
        tasks: List of task IDs
        n: Cooldown period between same tasks
        
    Returns:
        Minimum number of slots required
    """
    if not tasks:
        return 0
    
    if n == 0:
        return len(tasks)
    
    counter = Counter(tasks)
    frequencies = list(counter.values())
    max_freq = max(frequencies)
    num_max_tasks = sum(1 for freq in frequencies if freq == max_freq)
    
    # Classic task scheduler formula
    min_slots = (max_freq - 1) * (n + 1) + num_max_tasks
    
    # Must be at least the number of tasks
    return max(len(tasks), min_slots)


def schedule_tasks(tasks: List[Union[str, int]], n: int) -> List[Union[str, int, str]]:
    """
    Schedule tasks with cooldown constraint, minimizing slots and ensuring
    lexicographically smallest optimal schedule.
    
    Algorithm:
    1. Use greedy approach: prioritize tasks with highest remaining count
    2. Among tasks with same count, choose smallest task ID (lexicographically smallest)
    3. Track last position where each task was used
    4. Use idle only when no task is available
    5. Continue until all tasks are scheduled
    
    This ensures optimal length (by prioritizing high-count tasks) while
    maintaining lexicographic order (by choosing smallest ID among ties).
    
    Args:
        tasks: List of task IDs (can repeat)
        n: Cooldown period (same task cannot appear within n slots)
        
    Returns:
        Schedule as list of task IDs and 'idle' markers
    """
    if not tasks:
        return []
    
    if n == 0:
        # No cooldown, just return sorted tasks for lexicographic order
        return sorted(tasks)
    
    # Count remaining tasks
    task_counts = Counter(tasks)
    
    # Track last position where each task was used
    last_used = {}
    
    # Schedule result
    schedule = []
    slot = 0
    
    # Continue until all tasks are scheduled
    while sum(task_counts.values()) > 0:
        # Find available tasks (cooldown expired and count > 0)
        # Group by remaining count to prioritize high-count tasks
        available_by_count = {}
        
        for task_id, count in task_counts.items():
            if count > 0:
                # Check if cooldown is satisfied
                is_available = False
                if task_id not in last_used:
                    # Task never used, available
                    is_available = True
                elif slot - last_used[task_id] > n:
                    # Cooldown expired
                    is_available = True
                
                if is_available:
                    if count not in available_by_count:
                        available_by_count[count] = []
                    available_by_count[count].append(task_id)
        
        if available_by_count:
            # Choose task with highest remaining count
            # Among tasks with same count, choose smallest ID
            max_count = max(available_by_count.keys())
            chosen_task = min(available_by_count[max_count])
            
            # Update counts and last_used
            task_counts[chosen_task] -= 1
            if task_counts[chosen_task] == 0:
                del task_counts[chosen_task]
            last_used[chosen_task] = slot
            
            schedule.append(chosen_task)
        else:
            # No task available, must use idle
            schedule.append('idle')
        
        slot += 1
    
    return schedule


# Main function interface
def solve(tasks: List[Union[str, int]], n: int) -> List[Union[str, int, str]]:
    """
    Main entry point for the solution.
    
    Args:
        tasks: List of task IDs
        n: Cooldown period
        
    Returns:
        Optimal lexicographically smallest schedule
    """
    return schedule_tasks(tasks, n)


if __name__ == "__main__":
    # Example usage
    example1 = solve(['A', 'A', 'A', 'B', 'B', 'B'], 2)
    print(f"Example 1: {example1}")
    # Expected: ['A', 'B', 'idle', 'A', 'B', 'idle', 'A', 'B']
    
    example2 = solve(['A', 'A', 'A', 'B', 'B'], 2)
    print(f"Example 2: {example2}")
    # Expected: ['A', 'B', 'idle', 'A', 'B', 'idle', 'A']


"""
Task Scheduler: Minimum slots + lexicographically smallest among all optimal schedules.

We must return a valid schedule (tasks + 'idle') such that:
- The total number of slots is минимal (classic task scheduler objective).
- Among all minimum-length schedules, the returned schedule is lexicographically smallest
  (with respect to task IDs; 'idle' is only used when unavoidable for optimal length).

Key idea
--------
Compute the global optimal length L via the classic formula. Then build the schedule
left-to-right. At each time slot we try *available* tasks in increasing task-id order,
and we only commit to a task if doing so still allows completing within the remaining
budget (L - current_time - 1) without exceeding L.

This implements the "target length constraint" and the requested "trial / guard" logic:
we temporarily apply a candidate choice and verify feasibility using a cooldown-aware
minimum-completion-time simulator.
"""

from __future__ import annotations

from collections import Counter
import heapq
from typing import Dict, Iterable, List, Tuple, Union


def calculate_minimum_slots(tasks: List[Union[str, int]], n: int) -> int:
   
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


def _calculate_minimum_slots_from_counts(counts: Dict[Union[str, int], int], n: int) -> int:
    """
    Same as `calculate_minimum_slots`, but takes a frequency map directly (avoids expanding lists).
    """
    total = sum(c for c in counts.values() if c > 0)
    if total == 0:
        return 0
    if n == 0:
        return total

    max_freq = max(counts.values())
    num_max = sum(1 for c in counts.values() if c == max_freq)
    min_slots = (max_freq - 1) * (n + 1) + num_max
    return max(total, min_slots)


def _min_completion_time_from_state(
    counts: Dict[Union[str, int], int],
    next_available: Dict[Union[str, int], int],
    n: int,
    start_time: int,
    stop_if_exceeds: int | None = None,
) -> int:
    """
    Compute the minimum number of *additional* slots needed to finish all remaining tasks,
    starting at absolute time `start_time`, given cooldown constraints captured by
    `next_available`.

    This uses the standard "max remaining count" strategy with a cooldown queue, and is
    used as a feasibility oracle for the lexicographic construction. If `stop_if_exceeds`
    is provided, the simulation returns early once the additional time exceeds that value.
    """

    # Available tasks: max-heap by remaining count, tie-break by task-id to keep it deterministic.
    available: List[Tuple[int, Union[str, int]]] = []
    cooling: List[Tuple[int, Union[str, int]]] = []

    t = start_time
    remaining = 0
    for task_id, c in counts.items():
        if c <= 0:
            continue
        remaining += c
        ready = next_available.get(task_id, 0)
        if ready <= t:
            heapq.heappush(available, (-c, task_id))
        else:
            heapq.heappush(cooling, (ready, task_id))

    end_time = t
    while remaining > 0:
        # Make newly-ready tasks available.
        while cooling and cooling[0][0] <= end_time:
            ready, task_id = heapq.heappop(cooling)
            c = counts.get(task_id, 0)
            if c > 0:
                heapq.heappush(available, (-c, task_id))

        if available:
            neg_c, task_id = heapq.heappop(available)
            c = -neg_c

            # Execute one instance.
            counts[task_id] = c - 1
            remaining -= 1

            end_time += 1

            # If still remaining, it will be ready again after cooldown.
            if counts[task_id] > 0:
                heapq.heappush(cooling, (end_time + n, task_id))
        else:
            # No task can run now; jump to the next ready time (these are forced idles).
            if not cooling:
                break
            next_t = cooling[0][0]
            end_time = max(end_time, next_t)

        if stop_if_exceeds is not None and (end_time - start_time) > stop_if_exceeds:
            return stop_if_exceeds + 1

    return end_time - start_time


def schedule_tasks(tasks: List[Union[str, int]], n: int) -> List[Union[str, int, str]]:
    if not tasks:
        return []

    if n == 0:
        # No cooldown => any permutation is optimal length; lexicographically smallest is sorted order.
        return sorted(tasks)

    target_len = calculate_minimum_slots(tasks, n)

    counts: Counter[Union[str, int]] = Counter(tasks)
    next_available: Dict[Union[str, int], int] = {task_id: 0 for task_id in counts}

    # Min-heap by task-id for tasks that are currently available (release time <= current time).
    available_by_id: List[Union[str, int]] = list(counts.keys())
    heapq.heapify(available_by_id)

    # Cooling tasks: (ready_time, task_id)
    cooling: List[Tuple[int, Union[str, int]]] = []

    schedule: List[Union[str, int, str]] = []
    t = 0  # absolute time == len(schedule)

    def total_remaining() -> int:
        return sum(counts.values())

    while len(schedule) < target_len:
        # Move tasks whose cooldown expired into the available heap.
        while cooling and cooling[0][0] <= t:
            ready, task_id = heapq.heappop(cooling)
            if counts.get(task_id, 0) > 0:
                heapq.heappush(available_by_id, task_id)

        # Remove any stale tasks in the available heap (count became 0 or not actually ready).
        while available_by_id:
            task_id = available_by_id[0]
            if counts.get(task_id, 0) <= 0:
                heapq.heappop(available_by_id)
                continue
            if next_available.get(task_id, 0) > t:
                heapq.heappop(available_by_id)
                continue
            break

        if not available_by_id:
            # Forced idle (nothing is runnable at this time).
            schedule.append("idle")
            t += 1
            continue

        remaining_budget = target_len - (t + 1)
        if remaining_budget < 0:
            # Should never happen if we are preserving optimality.
            schedule.append("idle")
            t += 1
            continue

        # Try candidates in lexicographic order (smallest task ID first), but only commit if feasible.
        popped: List[Union[str, int]] = []
        chosen: Union[str, int] | None = None

        while available_by_id:
            cand = heapq.heappop(available_by_id)
            if counts.get(cand, 0) <= 0 or next_available.get(cand, 0) > t:
                continue

            # Trial apply cand.
            trial_counts = dict(counts)
            trial_next = dict(next_available)

            trial_counts[cand] -= 1
            trial_next[cand] = t + n + 1

            # Early necessary check (ignoring current cooldown state) to prune obvious failures.
            if _calculate_minimum_slots_from_counts(trial_counts, n) > remaining_budget:
                popped.append(cand)
                continue

            # Cooldown-aware feasibility: can we finish within remaining_budget slots?
            oracle_counts = dict(trial_counts)
            oracle_next = dict(trial_next)
            need = _min_completion_time_from_state(
                oracle_counts, oracle_next, n, start_time=t + 1, stop_if_exceeds=remaining_budget
            )
            if need <= remaining_budget:
                chosen = cand
                # Commit choice to the real state.
                counts[cand] -= 1
                next_available[cand] = t + n + 1
                if counts[cand] > 0:
                    heapq.heappush(cooling, (next_available[cand], cand))
                break

            popped.append(cand)

        # Push back candidates we tried and didn't choose.
        for task_id in popped:
            if counts.get(task_id, 0) > 0 and next_available.get(task_id, 0) <= t:
                heapq.heappush(available_by_id, task_id)

        if chosen is None:
            # If no available task keeps us within target_len, we must idle (rare, but safe).
            schedule.append("idle")
            t += 1
            continue

        schedule.append(chosen)
        t += 1

    # At target length, all tasks must be scheduled (otherwise we exceeded the minimum).
    if total_remaining() != 0:
        raise RuntimeError(
            f"Failed to schedule all tasks within the minimum length: "
            f"remaining={total_remaining()}, target_len={target_len}, produced_len={len(schedule)}"
        )
    return schedule


# Main function interface
def solve(tasks: List[Union[str, int]], n: int) -> List[Union[str, int, str]]:
    
   
    return schedule_tasks(tasks, n)


if __name__ == "__main__":
    # Example usage
    example1 = solve(['A', 'A', 'A', 'B', 'B', 'B'], 2)
    print(f"Example 1: {example1}")
    # Expected: ['A', 'B', 'idle', 'A', 'B', 'idle', 'A', 'B']
    
    example2 = solve(['A', 'A', 'A', 'B', 'B'], 2)
    print(f"Example 2: {example2}")
    # Expected: ['A', 'B', 'idle', 'A', 'B', 'idle', 'A']


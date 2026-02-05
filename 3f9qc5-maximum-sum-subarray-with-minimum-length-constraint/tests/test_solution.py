import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "repository_after"))
from solution import max_sum_subarray


def test_example_1():
    result = max_sum_subarray([1, -3, 2, 4, -1, 5], 2)
    assert result["maxSum"] == 10
    assert result["startIndex"] == 2
    assert result["endIndex"] == 5


def test_example_2():
    result = max_sum_subarray([-2, 1, -3, 4, -1, 2, 1, -5, 4], 3)
    assert result["maxSum"] == 6
    assert result["startIndex"] == 3
    assert result["endIndex"] == 6


def test_example_3_all_negative():
    result = max_sum_subarray([-1, -2, -3], 2)
    assert result["maxSum"] == -3
    assert result["startIndex"] == 0
    assert result["endIndex"] == 1


def test_example_4():
    result = max_sum_subarray([5, -2, 3, 1, -4, 2], 3)
    assert result["maxSum"] == 7
    assert result["startIndex"] == 0
    assert result["endIndex"] == 3


def test_edge_single_element():
    result = max_sum_subarray([7], 1)
    assert result["maxSum"] == 7
    assert result["startIndex"] == 0
    assert result["endIndex"] == 0


def test_edge_whole_array():
    result = max_sum_subarray([1, 2, 3], 3)
    assert result["maxSum"] == 6
    assert result["startIndex"] == 0
    assert result["endIndex"] == 2


def test_tie_smallest_start():
    result = max_sum_subarray([3, 2, -10, 3, 2], 2)
    assert result["maxSum"] == 5
    assert result["startIndex"] == 0
    assert result["endIndex"] == 1


def test_tie_shorter_subarray():
    nums = [2, 3, 0, 0, 0]
    result = max_sum_subarray(nums, 2)
    assert result["maxSum"] == 5
    assert result["startIndex"] == 0
    assert result["endIndex"] == 1


def test_return_keys():
    result = max_sum_subarray([1, 2, 3], 1)
    assert "maxSum" in result
    assert "startIndex" in result
    assert "endIndex" in result
    assert result["maxSum"] == 6
    assert result["startIndex"] == 0
    assert result["endIndex"] == 2


def test_minimum_length_respected():
    result = max_sum_subarray([10, -5, 10], 2)
    assert result["maxSum"] == 15
    assert result["endIndex"] - result["startIndex"] + 1 >= 2


def test_large_input():
    n = 1000
    nums = [1] * n
    result = max_sum_subarray(nums, 100)
    assert result["maxSum"] == n
    assert result["startIndex"] == 0
    assert result["endIndex"] == n - 1

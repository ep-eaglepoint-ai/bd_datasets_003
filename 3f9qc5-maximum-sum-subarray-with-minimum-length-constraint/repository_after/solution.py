def max_sum_subarray(nums: list[int], k: int) -> dict:
    """
    Maximum sum of a contiguous subarray of length >= k. Tie-break: smallest
    start index, then shorter subarray. Time O(n^2), space O(n).
    """
    n = len(nums)
    prefix = [0]
    for x in nums:
        prefix.append(prefix[-1] + x)

    best_sum = None
    best_start = None
    best_end = None

    for L in range(k, n + 1):
        for i in range(n - L + 1):
            s = prefix[i + L] - prefix[i]
            if best_sum is None or s > best_sum or (s == best_sum and i < best_start):
                best_sum = s
                best_start = i
                best_end = i + L - 1

    return {"maxSum": best_sum, "startIndex": best_start, "endIndex": best_end}

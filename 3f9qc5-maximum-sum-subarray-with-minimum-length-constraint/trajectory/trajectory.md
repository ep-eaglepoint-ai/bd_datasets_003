# Trajectory

Trajectory: Maximum Sum Subarray with a Minimum Length

The Problem: Finding the Best Slice Without Going Too Short

We have a list of numbers, some positive and some negative. We want to find one contiguous block of numbers that adds up to the biggest possible sum. The catch is that this block cannot be too short: it has to have at least a given length. So we are not allowed to pick a single huge number and call it a day if the rules say we need at least two or three elements. We have to find the best slice that is long enough, and we have to report not only that sum but exactly where that slice starts and ends. When two slices have the same sum, we break the tie by preferring the one that starts earlier, and if they start at the same place we prefer the shorter one.

The Solution: Check Every Valid Slice and Remember the Best

We need to consider every contiguous block that has length at least k. For each such block we compute its sum, and we keep track of the best sum we have seen so far, along with where that block starts and ends. To avoid adding up the same numbers over and over, we first build a prefix-sum list: at each position we store the total of everything from the start of the array up to that point. Then the sum of any slice is just two prefix values subtracted. That way we can check every valid slice quickly and compare it to our current best, updating when we find a better sum or when we find the same sum but with a smaller start index.

Implementation Steps

Prefix sums first: We walk through the array once and build a list where each entry is the running total. The first entry is zero so that the sum of the whole array from the start up to a given index is easy to get.

Two loops: We loop over every possible length from k up to the full array length. For each length we loop over every valid starting position. That way we look at every contiguous block that is long enough and nothing shorter.

Sum in one step: For each block we get its sum by subtracting two prefix values. No inner loop is needed, so each block takes constant time.

Tie-breaking in the update rule: When we find a block whose sum equals our current best, we only replace our answer if the new block starts at a smaller index. We never replace when the new block starts later. And because we try shorter lengths before longer ones for the same start, when two blocks have the same sum and the same start we keep the first one we found, which is the shorter one. So both tie-breaking rules are baked into the order we look at blocks and the condition we use to update.

Return a single object: We return one dictionary with three keys: the maximum sum, the start index, and the end index, all 0-based so they match the problem.

Why I did it this way (Refinement)

I could have used a different order, for example trying every start first and then every length. The important part was to try shorter lengths before longer lengths for the same start so that when we first set the best answer for a given start we get the shortest block with that sum. By looping length from k upward and then start from left to right, we naturally see the smallest start first for a given sum and the shortest length first for a given start, so the tie-breaking falls out without extra logic.

I kept the solution in one function with no extra helpers so that the idea is easy to follow: build prefixes, then scan all valid blocks, then return the best. For the given limits on array size this approach is fast enough.

Testing

The tests are written to match the requirements one by one. We have one test per example from the problem so we know the implementation matches the expected answers. We test a single-element array and the case where the whole array is the only valid block to cover the edges. We use one array where two different blocks have the same maximum sum to check that we pick the one with the smaller start index, and another array where the same start can be extended to a longer block with the same sum to check that we keep the shorter block. We test an array of all negative numbers to make sure we still return the best possible sum and the right indices instead of breaking or returning zero. We also test that the returned object has the right keys and that a larger input still gives the correct result. The tests add the solution folder to the path and import the function from there so they run against the real implementation without changing the code.

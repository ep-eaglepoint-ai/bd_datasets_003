/**
 * Optimized analytics service for calculating unique visitors.
 * Refactored from O(n^2) to O(n) using Set data structure.
 *
 * Performance Requirements:
 * - Time Complexity: O(n)
 * - Memory Limit: 250MB heap
 * - Target: Process 200k entries in <100ms
 */

/**
 * Calculate the number of unique visitors from log entries.
 *
 * @param {Array} logs - Array of log entries with userId property
 * @returns {number} Count of unique visitors
 *
 * @example
 * const logs = [
 *   { userId: '123' },
 *   { userId: '456' },
 *   { userId: '123' }
 * ];
 * getUniqueVisitors(logs); // Returns 2
 */
export function getUniqueVisitors(logs) {
  // Fast path for non-array or empty inputs
  if (!Array.isArray(logs) || logs.length === 0) {
    return 0;
  }

  // Use Set for O(1) membership checks and inserts – overall O(n)
  const uniqueUsers = new Set();
  // Classic for loop is slightly faster than for...of in tight loops
  for (let i = 0, len = logs.length; i < len; i++) {
    const entry = logs[i];
    if (!entry) continue;

    const userId = entry.userId;
    // Filter out null/undefined userIds but allow other falsy values like 0 or ""
    if (userId === null || userId === undefined) continue;

    uniqueUsers.add(userId);
  }

  return uniqueUsers.size;
}

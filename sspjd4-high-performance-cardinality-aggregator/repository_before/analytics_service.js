
// filename: analytics_service.js

/**
 * Current implementation is too slow for production logs.
 * Refactor to meet performance and memory constraints.
 */
// entry : { userId: uuid}
export function getUniqueVisitors(logs) {
    const uniqueUsers = [];
    for (const entry of logs) {
        // THE TRAP: Array.includes is O(n), making the total O(n^2)
        if (!uniqueUsers.includes(entry.userId)) {
            uniqueUsers.push(entry.userId);
        }
    }
    return uniqueUsers.length;
}
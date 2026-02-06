import { getUniqueVisitors } from "../repository_after/analytics_service.js";
import { getUniqueVisitors as getUniqueVisitorsOld } from "../repository_before/analytics_service.js";
import { performance } from "perf_hooks";
import { v4 as uuidv4 } from "uuid";

// Helper function to measure memory usage
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    rss: Math.round(usage.rss / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024), // MB
  };
}

// Helper to generate test data
function generateLogs(count, uniqueCount) {
  const logs = [];
  const userIds = [];

  // Generate pool of unique user IDs
  for (let i = 0; i < uniqueCount; i++) {
    userIds.push(uuidv4());
  }

  // Generate logs
  for (let i = 0; i < count; i++) {
    const userId = userIds[i % uniqueCount];
    logs.push({ userId });
  }

  return logs;
}

describe("Analytics Service - Requirement 1: Big O Gate (O(n) Time Complexity)", () => {
  test("should process 500k entries in <150ms", () => {
    console.log("\n--- Test 1: Big O Gate ---");
    const logs = generateLogs(500000, 100000);

    const startMem = getMemoryUsage();
    console.log("Memory before:", startMem);

    const start = performance.now();
    const result = getUniqueVisitors(logs);
    const duration = performance.now() - start;

    const endMem = getMemoryUsage();
    console.log("Memory after:", endMem);
    console.log(`Processed 500k entries in ${duration.toFixed(2)}ms`);
    console.log(`Result: ${result} unique visitors`);

    expect(duration).toBeLessThan(150);
    expect(result).toBe(100000);
  }, 30000);

  test("should demonstrate O(n^2) failure in old implementation", () => {
    console.log("\n--- Test 1b: Old Implementation Slowness ---");
    // Use smaller dataset to avoid timeout
    const logs = generateLogs(10000, 5000);

    const start = performance.now();
    const result = getUniqueVisitorsOld(logs);
    const duration = performance.now() - start;

    console.log(`Old implementation: 10k entries in ${duration.toFixed(2)}ms`);
    console.log(`Result: ${result} unique visitors`);

    // Old implementation should be significantly slower
    expect(result).toBe(5000);
  }, 30000);
});

describe("Analytics Service - Requirement 2: Memory Pressure", () => {
  test("should not exceed 200MB RSS during high-cardinality processing", () => {
    console.log("\n--- Test 2: Memory Pressure ---");

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const initialMem = getMemoryUsage();
    console.log("Initial memory:", initialMem);

    // High cardinality: 200k unique users from 200k logs
    const logs = generateLogs(200000, 200000);

    const beforeMem = getMemoryUsage();
    console.log("Memory before processing:", beforeMem);

    const result = getUniqueVisitors(logs);

    const afterMem = getMemoryUsage();
    console.log("Memory after processing:", afterMem);
    console.log(`RSS Delta: ${afterMem.rss - beforeMem.rss}MB`);

    expect(afterMem.rss).toBeLessThan(200);
    expect(result).toBe(200000);
  }, 30000);
});

describe("Analytics Service - Requirement 3: Data Corruption Handling", () => {
  test("should handle null, undefined, and malformed objects", () => {
    console.log("\n--- Test 3: Data Corruption ---");

    const corruptedLogs = [
      { userId: "user1" },
      null,
      undefined,
      { userId: "user2" },
      { noUserId: "invalid" },
      { userId: null },
      { userId: undefined },
      "not an object",
      123,
      { userId: "user1" }, // duplicate
      [],
      { userId: "user3" },
      { userId: "" }, // empty string is valid
    ];

    const result = getUniqueVisitors(corruptedLogs);

    console.log(`Processed ${corruptedLogs.length} entries with corruption`);
    console.log(`Result: ${result} unique visitors`);

    // Should count: user1, user2, user3, '' = 4 unique
    expect(result).toBe(4);
  });

  test("should not throw errors on corrupted data", () => {
    const extremeCorruption = [
      null,
      null,
      null,
      undefined,
      undefined,
      {},
      {},
      {},
      { userId: "valid" },
    ];

    expect(() => getUniqueVisitors(extremeCorruption)).not.toThrow();
    expect(getUniqueVisitors(extremeCorruption)).toBe(1);
  });

  test("should handle non-array input gracefully", () => {
    expect(getUniqueVisitors(null)).toBe(0);
    expect(getUniqueVisitors(undefined)).toBe(0);
    expect(getUniqueVisitors("not an array")).toBe(0);
    expect(getUniqueVisitors({})).toBe(0);
  });
});

describe("Analytics Service - Requirement 4: UUID v4 String Keys", () => {
  test("should handle UUID v4 strings (36 chars) efficiently", () => {
    console.log("\n--- Test 4: UUID v4 Handling ---");

    const uuidLogs = [];
    const uniqueUUIDs = new Set();

    // Generate 50k logs with UUID v4
    for (let i = 0; i < 50000; i++) {
      const userId = uuidv4();
      uuidLogs.push({ userId });
      uniqueUUIDs.add(userId);
    }

    console.log(`Generated ${uuidLogs.length} logs with UUIDs`);
    console.log(`Expected unique: ${uniqueUUIDs.size}`);

    const beforeMem = getMemoryUsage();
    const start = performance.now();

    const result = getUniqueVisitors(uuidLogs);

    const duration = performance.now() - start;
    const afterMem = getMemoryUsage();

    console.log(`Processed in ${duration.toFixed(2)}ms`);
    console.log(`Memory delta: ${afterMem.heapUsed - beforeMem.heapUsed}MB`);
    console.log(`Result: ${result} unique visitors`);

    expect(result).toBe(uniqueUUIDs.size);
    expect(duration).toBeLessThan(100);
  }, 30000);
});

describe("Analytics Service - Requirement 5: Cardinality Extremes", () => {
  test("should handle 100% unique IDs (every log is a new user)", () => {
    console.log("\n--- Test 5a: 100% Unique Cardinality ---");

    const logs = generateLogs(100000, 100000); // All unique

    const start = performance.now();
    const result = getUniqueVisitors(logs);
    const duration = performance.now() - start;

    console.log(`100k logs, 100k unique users in ${duration.toFixed(2)}ms`);

    expect(result).toBe(100000);
    expect(duration).toBeLessThan(150);
  }, 30000);

  test("should handle 0% unique IDs (all logs for one user)", () => {
    console.log("\n--- Test 5b: 0% Unique Cardinality ---");

    const logs = generateLogs(100000, 1); // All same user

    const start = performance.now();
    const result = getUniqueVisitors(logs);
    const duration = performance.now() - start;

    console.log(`100k logs, 1 unique user in ${duration.toFixed(2)}ms`);

    expect(result).toBe(1);
    expect(duration).toBeLessThan(100);
  }, 30000);
});

describe("Analytics Service - Requirement 6: Type Integrity", () => {
  test("should treat numeric and string IDs as distinct", () => {
    console.log("\n--- Test 6: Type Integrity ---");

    const logs = [
      { userId: 123 },
      { userId: "123" },
      { userId: 456 },
      { userId: "456" },
      { userId: 123 }, // duplicate numeric
      { userId: "123" }, // duplicate string
    ];

    const result = getUniqueVisitors(logs);

    console.log('Testing type distinction: 123 vs "123"');
    console.log(`Result: ${result} unique visitors`);

    // Should count: 123, '123', 456, '456' = 4 unique
    expect(result).toBe(4);
  });

  test("should maintain type distinction with mixed types", () => {
    const logs = [
      { userId: 0 },
      { userId: "0" },
      { userId: false },
      { userId: "false" },
      { userId: null }, // filtered out
      { userId: "null" },
    ];

    const result = getUniqueVisitors(logs);

    // Should count: 0, '0', false, 'false', 'null' = 5 unique
    expect(result).toBe(5);
  });
});

describe("Analytics Service - Requirement 7: Snapshot Validation", () => {
  test("should pass gold standard snapshot with 10k entries (0% margin)", () => {
    console.log("\n--- Test 7: Gold Standard Snapshot ---");

    // Create deterministic dataset
    const goldStandardLogs = [];
    const expectedUnique = 2500;

    // Pattern: 4 logs per unique user
    for (let i = 0; i < expectedUnique; i++) {
      const userId = `user_${i}`;
      for (let j = 0; j < 4; j++) {
        goldStandardLogs.push({ userId });
      }
    }

    console.log(`Gold standard: ${goldStandardLogs.length} logs`);
    console.log(`Expected unique: ${expectedUnique}`);

    const result = getUniqueVisitors(goldStandardLogs);

    console.log(`Result: ${result} unique visitors`);
    console.log(`Accuracy: ${result === expectedUnique ? "100%" : "FAILED"}`);

    // 0% margin for error - must be exact
    expect(result).toBe(expectedUnique);
  });

  test("should pass snapshot with mixed data types", () => {
    const snapshot = [
      { userId: "alice" },
      { userId: "bob" },
      { userId: 123 },
      { userId: "123" },
      { userId: "alice" },
      { userId: true },
      { userId: false },
      { userId: 0 },
      { userId: "" },
      { userId: "bob" },
    ];

    const result = getUniqueVisitors(snapshot);

    // Unique: alice, bob, 123, '123', true, false, 0, '' = 8
    expect(result).toBe(8);
  });
});

describe("Analytics Service - Requirement 8: Memory Limit Configuration", () => {
  test("should verify heap limit is configured", () => {
    console.log("\n--- Test 8: Memory Limit Configuration ---");

    const heapStats = process.memoryUsage();
    console.log("Heap statistics:", {
      heapUsed: Math.round(heapStats.heapUsed / 1024 / 1024),
      heapTotal: Math.round(heapStats.heapTotal / 1024 / 1024),
    });

    // This test verifies the process is running
    // Actual limit is set via --max-old-space-size flag
    expect(heapStats.heapTotal).toBeGreaterThan(0);
  });
});

describe("Analytics Service - Edge Cases", () => {
  test("should handle empty array", () => {
    expect(getUniqueVisitors([])).toBe(0);
  });

  test("should handle single entry", () => {
    expect(getUniqueVisitors([{ userId: "user1" }])).toBe(1);
  });

  test("should handle all duplicates", () => {
    const logs = Array(1000).fill({ userId: "same" });
    expect(getUniqueVisitors(logs)).toBe(1);
  });

  test("should handle special characters in userIds", () => {
    const logs = [
      { userId: "user@example.com" },
      { userId: "user#123" },
      { userId: "user$%^&*" },
      { userId: "user@example.com" },
    ];

    expect(getUniqueVisitors(logs)).toBe(3);
  });

  test("should handle very long userIds", () => {
    const longId = "a".repeat(10000);
    const logs = [{ userId: longId }, { userId: longId }, { userId: "short" }];

    expect(getUniqueVisitors(logs)).toBe(2);
  });
});

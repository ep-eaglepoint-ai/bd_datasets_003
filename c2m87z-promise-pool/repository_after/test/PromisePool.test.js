import { PromisePool } from "../PromisePool.js";

// Test utilities
class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.tests = [];
  }

  async test(name, fn) {
    try {
      await fn();
      this.passed++;
      this.tests.push({ name, status: "PASS" });
      console.log(`✓ ${name}`);
    } catch (error) {
      this.failed++;
      this.tests.push({ name, status: "FAIL", error: error.message });
      console.error(`✗ ${name}`);
      console.error(`  Error: ${error.message}`);
      if (error.stack) {
        console.error(`  ${error.stack.split("\n").slice(1, 3).join("\n  ")}`);
      }
    }
  }

  report() {
    console.log("\n" + "=".repeat(60));
    console.log(`Test Results: ${this.passed} passed, ${this.failed} failed`);
    console.log("=".repeat(60));
    return this.failed === 0;
  }
}

// Helper functions
function delay(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function createTask(duration, value, shouldFail = false) {
  return async () => {
    await delay(duration);
    if (shouldFail) {
      throw new Error(`Task failed: ${value}`);
    }
    return value;
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertThrows(fn, expectedMessage) {
  let threw = false;
  try {
    fn();
  } catch (error) {
    threw = true;
    if (expectedMessage && !error.message.includes(expectedMessage)) {
      throw new Error(
        `Expected error message to include "${expectedMessage}", got "${error.message}"`,
      );
    }
  }
  if (!threw) {
    throw new Error("Expected function to throw an error");
  }
}

async function assertRejects(promise, expectedMessage) {
  let threw = false;
  try {
    await promise;
  } catch (error) {
    threw = true;
    if (expectedMessage && !error.message.includes(expectedMessage)) {
      throw new Error(
        `Expected error message to include "${expectedMessage}", got "${error.message}"`,
      );
    }
  }
  if (!threw) {
    throw new Error("Expected promise to reject");
  }
}

// Main test suite
async function runTests() {
  const runner = new TestRunner();

  // Constructor validation
  await runner.test("Constructor accepts valid concurrency limit", () => {
    const pool = new PromisePool(3);
    assert(pool.concurrency === 3, "Concurrency should be set to 3");
  });

  await runner.test("Constructor validates minimum concurrency", () => {
    assertThrows(() => new PromisePool(0), "positive integer");
    assertThrows(() => new PromisePool(-1), "positive integer");
  });

  await runner.test("Constructor validates integer concurrency", () => {
    assertThrows(() => new PromisePool(2.5), "positive integer");
    assertThrows(() => new PromisePool("3"), "positive integer");
    assertThrows(() => new PromisePool(null), "positive integer");
  });

  // Execute method basic functionality
  await runner.test(
    "Execute returns Promise that resolves with results",
    async () => {
      const pool = new PromisePool(2);
      const tasks = [
        createTask(10, "a"),
        createTask(10, "b"),
        createTask(10, "c"),
      ];
      const results = await pool.execute(tasks);
      assert(Array.isArray(results), "Results should be an array");
      assert(results.length === 3, "Results length should match tasks length");
      assert(results[0] === "a", 'First result should be "a"');
      assert(results[1] === "b", 'Second result should be "b"');
      assert(results[2] === "c", 'Third result should be "c"');
    },
  );

  await runner.test("Results maintain input order", async () => {
    const pool = new PromisePool(2);
    const tasks = [
      createTask(50, "slow"),
      createTask(10, "fast1"),
      createTask(10, "fast2"),
    ];
    const results = await pool.execute(tasks);
    assert(
      results[0] === "slow",
      'First result should be "slow" (maintains order)',
    );
    assert(results[1] === "fast1", 'Second result should be "fast1"');
    assert(results[2] === "fast2", 'Third result should be "fast2"');
  });

  // Concurrency limit enforcement
  await runner.test("Maintains exact concurrency limit", async () => {
    const pool = new PromisePool(2);
    const runningTasks = [];
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 6 }, (_, i) => async () => {
      runningTasks.push(i);
      maxConcurrent = Math.max(maxConcurrent, runningTasks.length);
      await delay(20);
      runningTasks.splice(runningTasks.indexOf(i), 1);
      return i;
    });

    await pool.execute(tasks);
    assert(
      maxConcurrent === 2,
      `Max concurrent should be 2, got ${maxConcurrent}`,
    );
  });

  await runner.test(
    "Starts new task immediately when one completes",
    async () => {
      const pool = new PromisePool(2);
      const startTimes = [];
      const completeTimes = [];

      const tasks = [
        async () => {
          startTimes.push(Date.now());
          await delay(30);
          completeTimes.push(Date.now());
          return 1;
        },
        async () => {
          startTimes.push(Date.now());
          await delay(30);
          completeTimes.push(Date.now());
          return 2;
        },
        async () => {
          startTimes.push(Date.now());
          await delay(30);
          completeTimes.push(Date.now());
          return 3;
        },
        async () => {
          startTimes.push(Date.now());
          await delay(30);
          completeTimes.push(Date.now());
          return 4;
        },
      ];

      await pool.execute(tasks);

      // Task 3 should start shortly after task 1 or 2 completes
      assert(startTimes.length === 4, "All tasks should have started");
      const timeBetweenBatches = startTimes[2] - startTimes[0];
      assert(
        timeBetweenBatches >= 25 && timeBetweenBatches <= 50,
        `Task 3 should start ~30ms after task 1, got ${timeBetweenBatches}ms`,
      );
    },
  );

  // Error handling
  await runner.test("Failed tasks do not stop other tasks", async () => {
    const pool = new PromisePool(2);
    const tasks = [
      createTask(10, "success1"),
      createTask(10, "fail", true),
      createTask(10, "success2"),
      createTask(10, "success3"),
    ];

    const results = await pool.execute(tasks);
    assert(results.length === 4, "Should return all results");
    assert(results[0] === "success1", "First task should succeed");
    assert(results[1].error !== undefined, "Second task should have error");
    assert(results[2] === "success2", "Third task should succeed");
    assert(results[3] === "success3", "Fourth task should succeed");
  });

  await runner.test("Error objects contain task information", async () => {
    const pool = new PromisePool(1);
    const tasks = [createTask(10, "fail", true)];

    const results = await pool.execute(tasks);
    const errorResult = results[0];
    assert(errorResult.error !== undefined, "Should have error property");
    assert(errorResult.taskIndex === 0, "Should have taskIndex");
    assert(
      errorResult.message.includes("Task failed"),
      "Should have error message",
    );
  });

  // onProgress callback
  await runner.test("onProgress called after each task", async () => {
    const pool = new PromisePool(2);
    const progressCalls = [];

    const tasks = [createTask(10, 1), createTask(10, 2), createTask(10, 3)];

    await pool.execute(tasks, {
      onProgress: (index, total, success) => {
        progressCalls.push({ index, total, success });
      },
    });

    assert(progressCalls.length === 3, "Should call onProgress 3 times");
    assert(progressCalls[0].total === 3, "Total should be 3");
    assert(
      progressCalls.every((call) => call.success === true),
      "All should be successful",
    );
  });

  await runner.test("onProgress indicates failures", async () => {
    const pool = new PromisePool(1);
    const progressCalls = [];

    const tasks = [createTask(10, 1), createTask(10, 2, true)];

    await pool.execute(tasks, {
      onProgress: (index, total, success) => {
        progressCalls.push({ index, total, success });
      },
    });

    assert(progressCalls[0].success === true, "First task should succeed");
    assert(progressCalls[1].success === false, "Second task should fail");
  });

  // onTaskComplete callback
  await runner.test("onTaskComplete receives results immediately", async () => {
    const pool = new PromisePool(2);
    const completions = [];

    const tasks = [createTask(30, "slow"), createTask(10, "fast")];

    await pool.execute(tasks, {
      onTaskComplete: (index, result) => {
        completions.push({ index, result, time: Date.now() });
      },
    });

    assert(completions.length === 2, "Should complete both tasks");
    // Fast task should complete first
    assert(completions[0].index === 1, "Fast task should complete first");
    assert(completions[0].result === "fast", "Should receive fast result");
    assert(completions[1].index === 0, "Slow task should complete second");
  });

  await runner.test("onTaskComplete receives errors", async () => {
    const pool = new PromisePool(1);
    const completions = [];

    const tasks = [createTask(10, "fail", true)];

    await pool.execute(tasks, {
      onTaskComplete: (index, result) => {
        completions.push({ index, result });
      },
    });

    assert(
      completions[0].result.error !== undefined,
      "Should receive error object",
    );
  });

  // Cancellation support
  await runner.test("AbortSignal stops starting new tasks", async () => {
    const pool = new PromisePool(1);
    const controller = new AbortController();
    const started = [];

    const tasks = Array.from({ length: 5 }, (_, i) => async () => {
      started.push(i);
      await delay(30);
      return i;
    });

    // Abort after a short delay
    setTimeout(() => controller.abort(), 50);

    try {
      await pool.execute(tasks, { signal: controller.signal });
      throw new Error("Should have thrown AbortError");
    } catch (error) {
      assert(
        error.name === "AbortError" || error.message.includes("aborted"),
        "Should throw AbortError",
      );
      assert(
        started.length < 5,
        `Should not start all tasks, started ${started.length}`,
      );
    }
  });

  await runner.test("Already aborted signal rejects immediately", async () => {
    const pool = new PromisePool(2);
    const controller = new AbortController();
    controller.abort();

    const tasks = [createTask(10, 1)];

    await assertRejects(
      pool.execute(tasks, { signal: controller.signal }),
      "aborted",
    );
  });

  // Static map method
  await runner.test("Static map processes items with mapper", async () => {
    const items = [1, 2, 3, 4];
    const mapper = async (x) => {
      await delay(10);
      return x * 2;
    };

    const results = await PromisePool.map(items, mapper, 2);
    assert(results.length === 4, "Should return all results");
    assert(results[0] === 2, "First result should be 2");
    assert(results[1] === 4, "Second result should be 4");
    assert(results[2] === 6, "Third result should be 6");
    assert(results[3] === 8, "Fourth result should be 8");
  });

  await runner.test(
    "Static map maintains order and limits concurrency",
    async () => {
      const items = [1, 2, 3, 4, 5];
      let concurrent = 0;
      let maxConcurrent = 0;

      const mapper = async (x) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await delay(20);
        concurrent--;
        return x * 2;
      };

      const results = await PromisePool.map(items, mapper, 2);
      assert(
        maxConcurrent === 2,
        `Max concurrent should be 2, got ${maxConcurrent}`,
      );
      assert(results[0] === 2 && results[4] === 10, "Should maintain order");
    },
  );

  await runner.test("Static map passes index to mapper", async () => {
    const items = ["a", "b", "c"];
    const mapper = async (item, index) => {
      return `${item}-${index}`;
    };

    const results = await PromisePool.map(items, mapper, 2);
    assert(results[0] === "a-0", "Should pass index 0");
    assert(results[1] === "b-1", "Should pass index 1");
    assert(results[2] === "c-2", "Should pass index 2");
  });

  await runner.test("Static map validates inputs", async () => {
    try {
      await PromisePool.map("not an array", (x) => x, 2);
      throw new Error("Should have thrown for invalid array");
    } catch (error) {
      assert(error.message.includes("array"), "Should error about array");
    }

    try {
      await PromisePool.map([1, 2], "not a function", 2);
      throw new Error("Should have thrown for invalid function");
    } catch (error) {
      assert(error.message.includes("function"), "Should error about function");
    }
  });

  // Metrics tracking
  await runner.test("Tracks completed tasks", async () => {
    const pool = new PromisePool(2);
    const tasks = [createTask(10, 1), createTask(10, 2), createTask(10, 3)];

    const promise = pool.execute(tasks);
    await delay(5); // Let some tasks start

    let status = pool.status();
    assert(status.total === 3, "Total should be 3");

    await promise;
    status = pool.status();
    assert(status.completed === 3, "Completed should be 3");
    assert(status.running === 0, "Running should be 0");
    assert(status.failed === 0, "Failed should be 0");
  });

  await runner.test("Tracks failed tasks", async () => {
    const pool = new PromisePool(2);
    const tasks = [
      createTask(10, 1),
      createTask(10, 2, true),
      createTask(10, 3, true),
    ];

    await pool.execute(tasks);
    const status = pool.status();
    assert(status.completed === 3, "Completed should be 3");
    assert(status.failed === 2, "Failed should be 2");
  });

  await runner.test("Tracks running count", async () => {
    const pool = new PromisePool(2);
    const tasks = [createTask(50, 1), createTask(50, 2), createTask(50, 3)];

    const promise = pool.execute(tasks);
    await delay(10); // Let tasks start

    const status = pool.status();
    assert(status.running === 2, `Running should be 2, got ${status.running}`);

    await promise;
  });

  // Edge cases
  await runner.test("Empty array resolves immediately", async () => {
    const pool = new PromisePool(2);
    const start = Date.now();
    const results = await pool.execute([]);
    const duration = Date.now() - start;

    assert(Array.isArray(results), "Should return array");
    assert(results.length === 0, "Should return empty array");
    assert(duration < 10, "Should resolve immediately");
  });

  await runner.test("Concurrency greater than task count", async () => {
    const pool = new PromisePool(10);
    const tasks = [createTask(10, 1), createTask(10, 2), createTask(10, 3)];

    const results = await pool.execute(tasks);
    assert(results.length === 3, "Should complete all tasks");
    assert(
      results.every((r, i) => r === i + 1),
      "All results should be correct",
    );
  });

  await runner.test("Synchronous task resolution", async () => {
    const pool = new PromisePool(2);
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ];

    const results = await pool.execute(tasks);
    assert(results[0] === 1, "First result should be 1");
    assert(results[1] === 2, "Second result should be 2");
    assert(results[2] === 3, "Third result should be 3");
  });

  await runner.test("Mixed sync and async tasks", async () => {
    const pool = new PromisePool(2);
    const tasks = [
      () => Promise.resolve("sync"),
      createTask(20, "async"),
      () => "immediate",
    ];

    const results = await pool.execute(tasks);
    assert(results[0] === "sync", "Sync promise should work");
    assert(results[1] === "async", "Async task should work");
    assert(results[2] === "immediate", "Immediate value should work");
  });

  // Memory management
  await runner.test("Handles large batches", async () => {
    const pool = new PromisePool(10);
    const tasks = Array.from({ length: 100 }, (_, i) => createTask(1, i));

    const results = await pool.execute(tasks);
    assert(results.length === 100, "Should complete all 100 tasks");
    assert(results[99] === 99, "Last result should be correct");
  });

  // Additional comprehensive tests
  await runner.test("Integration: Real-world API simulation", async () => {
    // Simulate API with rate limiting
    let requestsInLastSecond = 0;
    let maxRequestsInWindow = 0;

    setInterval(() => {
      maxRequestsInWindow = Math.max(maxRequestsInWindow, requestsInLastSecond);
      requestsInLastSecond = 0;
    }, 1000);

    const makeAPICall = async (id) => {
      requestsInLastSecond++;
      await delay(50); // Simulate API latency
      return { id, data: `Record ${id}` };
    };

    const recordIds = Array.from({ length: 20 }, (_, i) => i);
    const results = await PromisePool.map(
      recordIds,
      async (id) => makeAPICall(id),
      5, // Max 5 concurrent requests
    );

    assert(results.length === 20, "Should process all records");
    assert(results[0].id === 0, "Should maintain order");
    assert(results[19].id === 19, "Should maintain order");
  });

  await runner.test("Integration: Progress tracking", async () => {
    const pool = new PromisePool(3);
    const progressUpdates = [];

    const tasks = Array.from({ length: 10 }, (_, i) => createTask(10, i));

    await pool.execute(tasks, {
      onProgress: (index, total, success) => {
        progressUpdates.push({
          percent: Math.round(((index + 1) / total) * 100),
          index,
          success,
        });
      },
    });

    assert(progressUpdates.length === 10, "Should have 10 progress updates");
    assert(
      progressUpdates[progressUpdates.length - 1].percent === 100,
      "Final progress should be 100%",
    );
  });

  await runner.test("Integration: Callback error handling", async () => {
    const pool = new PromisePool(2);
    const tasks = [createTask(10, 1), createTask(10, 2)];

    // Callback that throws should not break execution
    const results = await pool.execute(tasks, {
      onProgress: () => {
        throw new Error("Callback error");
      },
      onTaskComplete: () => {
        throw new Error("Another callback error");
      },
    });

    assert(results.length === 2, "Should complete despite callback errors");
  });

  await runner.test("Stress: High concurrency with many tasks", async () => {
    const pool = new PromisePool(50);
    const tasks = Array.from({ length: 200 }, (_, i) => createTask(5, i));

    const start = Date.now();
    const results = await pool.execute(tasks);
    const duration = Date.now() - start;

    assert(results.length === 200, "Should complete all tasks");
    // With concurrency 50, should complete in ~4 batches = ~20ms
    assert(duration < 100, `Should complete quickly, took ${duration}ms`);
  });

  return runner.report();
}

// Run tests
if (typeof window === "undefined") {
  // Node.js environment
  runTests().then((success) => {
    process.exit(success ? 0 : 1);
  });
} else {
  // Browser environment
  runTests();
}

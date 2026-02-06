# PromisePool Implementation Trajectory

## What is PromisePool?

A JavaScript class that runs multiple async tasks at the same time, but limits how many can run at once. Think of it like having 5 workers who can each handle one task at a time - when one finishes, the next task starts immediately.

---

## 1. Analysis: Understanding the Problem

### What We Need to Build

Looking at the test file, PromisePool needs to:

1. **Control concurrency** - Only run X tasks at the same time (e.g., max 5 parallel API calls)
2. **Keep results in order** - Even if task 3 finishes before task 1, results[0] should still be task 1's result
3. **Handle errors gracefully** - If task 2 fails, tasks 3, 4, 5... should keep running
4. **Track progress** - Tell the user "3 out of 10 tasks complete"
5. **Allow cancellation** - Stop starting new tasks if user cancels

### The Real-World Problem

Imagine you need to fetch data for 1000 user IDs from an API:

```javascript
// ❌ Bad: Launches all 1000 requests at once!
const results = await Promise.all(userIds.map((id) => fetchUser(id)));

// ✅ Good: Only 10 requests at a time
const results = await PromisePool.map(userIds, fetchUser, 10);
```

**Why this matters:**

- APIs have rate limits (e.g., "max 10 requests per second")
- Too many parallel requests can crash your browser
- Server resources are limited

---

## 2. Strategy: How to Solve It

### The Core Algorithm: "Slot-Based Scheduling"

Think of it like a restaurant with 5 tables:

1. Seat 5 customers immediately (fill all tables)
2. When someone finishes eating and leaves, seat the next person in line
3. Keep doing this until everyone has been served

## 3. Execution: Building It Step by Step

### Step 1: Constructor - Set Up the Pool

```javascript
constructor(concurrency) {
  // Make sure concurrency is a positive whole number
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Concurrency must be a positive integer (>= 1)");
  }

  this.concurrency = concurrency; // Max 5, 10, etc.
  this.metrics = {
    completed: 0,  // How many finished
    failed: 0,     // How many had errors
    running: 0,    // How many currently executing
    total: 0       // Total tasks
  };
}
```

### Step 2: The Execute Method - The Heart of It

#### Setup

```javascript
async execute(tasks, options = {}) {
  // Create an empty array to store results
  const results = new Array(tasks.length);

  // Track which task to start next
  let nextTaskIndex = 0;

  // Reset our counters
  this.metrics = { completed: 0, failed: 0, running: 0, total: tasks.length };
```

**Why preallocate the array?** So we can do `results[5] = "result"` even if task 5 finishes before task 1.

#### The Magic Function: startNextTask

```javascript
const startNextTask = () => {
  // Stop if we've started all tasks
  if (nextTaskIndex >= tasks.length) return;

  // Get the next task
  const taskIndex = nextTaskIndex++;
  const task = tasks[taskIndex];

  this.metrics.running++;

  // Run the task
  Promise.resolve()
    .then(() => task())
    .then(
      (result) => {
        results[taskIndex] = result; // Save at correct position
      },
      (error) => {
        results[taskIndex] = { error }; // Save error, keep going
        this.metrics.failed++;
      },
    )
    .then(() => {
      // Task finished (success or fail)
      this.metrics.running--;
      this.metrics.completed++;

      startNextTask(); // 👈 THE KEY LINE - fill the slot!

      // Are we done with everything?
      if (this.metrics.completed === tasks.length) {
        resolve(results);
      }
    });
};
```

#### Start the Initial Batch

```javascript
  // Start as many tasks as we have slots for
  const initialBatch = Math.min(this.concurrency, tasks.length);
  for (let i = 0; i < initialBatch; i++) {
    startNextTask();
  }
}
```

### Step 3: Static Map Method - Convenience Wrapper

```javascript
static async map(items, mapper, concurrency) {
  const pool = new PromisePool(concurrency);

  // Convert items into task functions
  const tasks = items.map((item, index) => {
    return () => mapper(item, index);
  });

  return pool.execute(tasks);
}
```

**Usage:**

```javascript
// Instead of creating a pool manually:
const pool = new PromisePool(5);
const tasks = userIds.map((id) => () => fetchUser(id));
await pool.execute(tasks);

// Just use the shorthand:
await PromisePool.map(userIds, fetchUser, 5);
```

---

## 4. Key Concepts Explained

### Concept 1: Keeping Results in Order

```javascript
// Tasks finish in random order: [3, 1, 5, 2, 4]
// But results array keeps them ordered: [1, 2, 3, 4, 5]

// How? By using the original index:
results[taskIndex] = result; // Always saves to correct spot
```

### Concept 2: Error Handling

```javascript
// Don't let one error stop everything
.then(
  (result) => results[taskIndex] = result,
  (error) => results[taskIndex] = { error }  // Save error as result
)
```

### Concept 3: The Recursive Loop

```javascript
task.run().then(() => {
  startNextTask(); // This creates a chain that keeps going
});

// Visual:
// Start task 1 → finishes → start task 6 → finishes → start task 11 → ...
// Start task 2 → finishes → start task 7 → finishes → start task 12 → ...
```

---

## 5. Real-World Example

### Use Case: Fetching User Data

```javascript
// You have 100 user IDs and an API that limits you to 10 requests/sec
const userIds = [1, 2, 3, ..., 100];

const results = await PromisePool.map(
  userIds,
  async (userId) => {
    const response = await fetch(`/api/users/${userId}`);
    return response.json();
  },
  10  // Max 10 concurrent requests
);

// Results array has all 100 user objects in the same order as userIds
```

### How It Works Behind the Scenes

```
Time 0ms:  Start tasks 1-10 (fill all slots)
Time 50ms: Task 3 finishes → immediately start task 11
Time 51ms: Task 7 finishes → immediately start task 12
Time 60ms: Task 1 finishes → immediately start task 13
...
Time 500ms: All 100 tasks complete
```

Without concurrency control, all 100 would start at once and likely fail!

---

## 6. Resources & Learning

### Main Resource

- [JavaScript Concurrency with Promises](https://www.honeybadger.io/blog/javascript-concurrency/) - Excellent article explaining concurrency patterns

### Key JavaScript Concepts Used

1. **Promises** - Asynchronous operations
   - [MDN: Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)

2. **Closures** - `startNextTask` captures `nextTaskIndex`
   - [MDN: Closures](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures)

3. **AbortSignal** - Cancellation pattern
   - [MDN: AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)

### Related Patterns

- **Promise.all()** - Run all at once (no limit)
- **Promise.allSettled()** - Like Promise.all but doesn't stop on errors
- **Worker Pools** - For CPU-intensive tasks
- **Rate Limiting** - Time-based throttling

---

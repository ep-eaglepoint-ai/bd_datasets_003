# Trajectory: Robust Bounded Blocking Queue

## The Problem: Thread Coordination in Producer-Consumer Systems
In high-traffic systems, producers may generate data faster than consumers can process it. A naive queue will either grow indefinitely (risking Out-Of-Memory errors) or drop data. We need a way to:
1. **Limit Capacity**: Set a strict upper bound on memory usage.
2. **Block Gracefully**: Make producers wait when the queue is full and consumers wait when it's empty.
3. **Avoid Deadlocks**: Ensure threads are woken up only when the state actually changes in their favor.
4. **Handle Timeouts**: Allow threads to give up after a certain duration rather than blocking forever.
5. **Clean Shutdown**: Provide a way to stop the system without leaving threads stranded in a blocked state.

## The Solution: Circular Buffer + Wait-Notify Monitor

Instead of using high-level `java.util.concurrent` utilities, we implemented a low-level synchronization primitives to control thread flow precisely:

### 1. **Circular Buffer Strategy**
Using a standard `ArrayList` would require $O(n)$ shifts on every removal. Using a circular array with `head` and `tail` pointers allows for $O(1)$ `put` and `take` operations:
- **Tail**: Pointer for the next insertion.
- **Head**: Pointer for the next extraction.
- **Count**: Tracks current size to differentiate between "Empty" and "Full" (as both often result in `head == tail`).

### 2. **Monitor Synchronization**
The entire queue acts as a single monitor. We use `synchronized` methods to ensure that only one thread modifies the internal array or pointers at a time. The coordination follows the classic **Guard/Wait pattern**.

### 3. **Spurious Wakeup Protection**
A critical nuance in Java multithreading is that `wait()` can return even without a `notify()`. We wrap every `wait()` call in a `while` loop that re-verifies the condition (e.g., `while(count == capacity)`).

## Implementation Steps

### Step 1: Defined the Circular Buffer
I used an `Object[]` array since generic arrays cannot be directly instantiated in Java. We initialized `head`, `tail`, and `count` to zero.

### Step 2: Implemented Blocking Put/Take
- **Put**: Synchronizes, waits while `count == capacity`, inserts at `tail`, increments via modulo `% capacity`, and calls `notifyAll()`.
- **Take**: Synchronizes, waits while `count == 0`, extracts from `head`, nulls the slot (for GC), increments via modulo, and calls `notifyAll()`.

### Step 3: Precise Timeout Tracking
For `offer(timeout)` and `poll(timeout)`, I couldn't just call `wait(timeout)`. If a spurious wakeup occurs after 50ms of a 100ms timeout, the thread must calculate that it only has 50ms *remaining* before waiting again. I used `System.nanoTime()` for high-precision deadline tracking.

### Step 4: Shutdown Mechanism
I added a `shutdown` boolean. When `shutdown()` is called, it flips the flag and sends a `notifyAll()`. Every blocking loop checks this flag immediately after waking, throwing an `IllegalStateException` to prevent threads from hanging in a terminal system state.

## Why I Did It This Way

### Initial Thought: Using `notify()`
I considered using `notify()` to wake a single thread, as it's more "efficient."

**Correction**: With a single monitor, `notify()` might wake another producer when space only became available for a consumer (or vice-versa), leading to a **Lost Wakeup** where all threads end up waiting while the queue actually has work. Using `notifyAll()` ensures the right type of thread is always given a chance to progress.

### Refinement: Handling Memory Leaks
Simply moving the `head` pointer isn't enough. The array would still hold a reference to the consumed object.

**Decision**: Explicitly setting `buffer[head] = null` ensures the object can be Garbage Collected even if its slot isn't immediately reused by a producer.

### Design Choice: `System.nanoTime()` over `System.currentTimeMillis()`
Wall-clock time can jump due to NTP syncs or system clock changes.

**Decision**: `nanoTime()` is monotonic and far more reliable for calculating relative durations like "remaining wait time."

## Testing Strategy

### Unit Tests (Verified 15 Scenarios)
1. **Basic FIFO**: Verified items come out in the exact order they went in.
2. **Circular Wraparound**: Verified indices wrap correctly after 1000+ operations on a small array.
3. **Blocking Behavior**: Used `CountDownLatch` to verify a producer actually stops when the queue is full and only resumes after a `take()`.
4. **Timeout Accuracy**: verified `poll` returns `null` after the specified milliseconds.
5. **Shutdown Safety**: Verified all blocked threads wake up and throw exceptions upon shutdown.
6. **Concurrent Stress**: Ran 5 producers and 5 consumers simultaneously to ensure no data loss or corruption.

### Docker Evaluation System
Setup a three-tier evaluation:
- `tester-before`: Baseline check (intended failure).
- `tester-after`: Validation of the new implementation.
- `evaluator`: Automated Java-based reporting tool.

## Key Learnings

1. **State Re-verification is Mandatory**
   - Never trust a wakeup. Always re-check your "Full" or "Empty" conditions in a `while` loop.

2. **notifyAll() is the Safe Default**
   - In single-condition monitors, `notify()` is a dangerous optimization that causes deadlocks.

3. **Modulo Arithmetic Simplifies Logic**
   - Using `(i + 1) % capacity` is the cleanest way to manage circular buffers.

4. **Shutdown is a First-Class Citizen**
   - Thread-safe components must have an exit strategy, otherwise they become "zombie" threads during application teardown.

---

## 📚 Recommended Resources

**1. Read: Java Concurrency in Practice**
The definitive guide for understanding the wait/notify pattern and monitor synchronization.
*   [Java Concurrency in Practice (Chapter 14)](https://jcip.net/)

**2. Explore: The LMAX Disruptor**
A more advanced implementation of circular buffers (Ring Buffers) for ultra-high-performance messaging.
*   [LMAX Disruptor Architecture](https://lmax-exchange.github.io/disruptor/)

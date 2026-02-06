# Trajectory:  LRU Cache Testing & Time Travel

## The Problem: Invisible Bugs in Session Management

We are integrating a Least Recently Used (LRU) cache to manage user sessions. While the code looks functional, caching bugs are notoriously difficult to spot.

1. **Stale Data:** If the Time-To-Live (TTL) logic fails, users might stay logged in long after their session should have expired.
2. **Memory Leaks:** If the eviction policy (removing the oldest items) fails, the cache could grow indefinitely, crashing the application.
3. **Flaky Tests:** Testing time-based logic is hard. We cannot put `time.sleep(60)` in a test suite; it would make the tests agonizingly slow and unreliable.

## The Solution: Deterministic Testing with Pytest

We will build a test suite using `pytest` that verifies the logic instantly, without waiting for actual time to pass.

1. **Pytest Fixtures:** We use `@pytest.fixture` to spin up fresh `LRUCache` instances for every test, ensuring one test doesn't break another.
2. **Mocking Time:** We use `unittest.mock` to "freeze" or "fast-forward" the system clock. This allows us to simulate an hour passing in a fraction of a millisecond.
3. **Boundary Analysis:** We specifically target edge cases, such as a cache with `capacity=1` or initializing with negative numbers, to ensure the class rejects invalid states.

## Implementation Steps

1. **Core Mechanics:** Verify `put` and `get`. If I put "A", do I get "A"? If I request "B" (which doesn't exist), do I get `None`?
2. **Eviction Logic:** Fill the cache to capacity. Access an older item to "refresh" it. Add a new item. Ensure the *least recently used* item (the one we didn't touch) is the one that gets kicked out.
3. **The "Time Travel" Test:**
* Patch `time.time` to return `1000.0`.
* Insert an item with a 5-second TTL.
* Update the mock to return `1006.0`.
* Assert that `get` returns `None`.


4. **Lazy Expiration:** Acknowledge that `size()` might report items that are technically expired but haven't been accessed yet. Our tests must respect the implementation's "lazy" cleanup strategy.

## Why I did it this way (Refinement)

I initially considered checking `size()` immediately after time "passed" to see if the count dropped.

* **Correction:** The implementation uses **lazy eviction** (items are only removed when accessed). Therefore, checking `size()` immediately after the TTL expires would fail because the item is still technically in memory. I adjusted the test strategy to call `get()` first—triggering the cleanup—before asserting that the item is gone.

## Testing Strategy

We are avoiding `unittest.TestCase` in favor of functional `pytest` patterns. This is more Pythonic and allows for cleaner fixture usage. The critical component is the **Time Mock**: we are effectively playing god with the system clock to ensure 100% determinism.

---

### 📚 Recommended Resources

**1. Watch: The LRU Cache Algorithm**
A clear conceptual overview of how Least Recently Used eviction works and why we move items to the "front" or "back" of the line.

* [YouTube: LRU Cache Explained](https://www.youtube.com/watch?v=S6IfqDXWa10)

**2. Read: Mocking in Python**
Understanding how `unittest.mock` works is essential for the TTL tests. This guide explains how to replace real objects (like `time.time`) with fake ones.

* [Article: Real Python - Python Mocking 101](https://www.google.com/search?q=https://realpython.com/python-mocking-101/)

**3. Read: Pytest Fixtures**
We use fixtures to avoid repeating `cache = LRUCache(2)` in every single test function.

* [Docs: Pytest Fixtures - Explicit, Modular, Scalable](https://docs.pytest.org/en/6.2.x/fixture.html)
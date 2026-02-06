# Trajectory - NUH5RM AsyncCache Bug Fix

## What I Did

I was given an AsyncCache.js file that had bugs and I needed to fix it while keeping the same method signatures. The cache is used to store results from expensive async operations like API calls and database queries.

## The Problems I Found

When I read the original code, I identified four main issues:

1. Duplicate API calls were happening when the cache should have prevented them
2. Stale data was being returned even after the TTL expired
3. Memory usage was growing because timers were not being cleaned up
4. Failed requests could not be retried because the cache state got corrupted

Let me explain how I found and fixed each problem.

---

## Problem 1: Duplicate API Calls

### How I Found It

I was reading the get() method line by line. I noticed that every time get() was called, it would run the loader() function even if another call with the same key was already in progress. This meant if multiple components requested the same data at the same time, they would all trigger separate API calls instead of sharing one result.

The original code looked like this:

```
async get(key, loader, ttl) {
  const cached = this.cache.get(key);
  if (cached && !this._isExpired(cached)) {
    return cached.value;
  }
  // No check for ongoing loads!
  const value = await loader();
  this.set(key, value, ttl);
  return value;
}
```

I realized there was no mechanism to deduplicate concurrent requests.

### How I Searched for Solution

I searched for "JavaScript async cache concurrent requests deduplication" and "Promise memoization pattern". The common solution was to keep track of promises that are currently loading.

### What I Did

I added a pending Map to store in-flight promises. When a get() call comes in, I first check if a load for that key is already in progress. If yes, I return the same promise so all callers wait for the same result.

The key changes:

- Added this.pending = new Map() in the constructor
- Before running loader, check if pending.has(key)
- Store the promise in pending before awaiting
- Clean up pending in a finally() block so it happens whether the loader succeeds or fails

---

## Problem 2: Stale Data After TTL

### How I Found It

I looked at the \_isExpired() method which determines if cached data should be considered old. The original code was:

```
_isExpired(entry) {
  return entry.expiresAt !== null && entry.expiresAt > Date.now();
}
```

This was wrong. The comparison was checking if expiresAt is greater than now, which means it returns true when the entry is NOT expired yet. When expiresAt is 1000 and now is 500, it returns true, but that's before expiration.

### How I Searched for Solution

I searched for "JavaScript setTimeout expiration check" to understand the correct way to compare timestamps.

### What I Did

I changed the comparison from > to <=:

```
_isExpired(entry) {
  if (entry.expiresAt === null) return false;
  return entry.expiresAt <= Date.now();
}
```

Now it correctly returns true when the current time has passed the expiration time.

---

## Problem 3: Memory Leaks from Uncleaned Timers

### How I Found It

I noticed the code was using setTimeout to automatically delete entries after TTL expires. The timers were stored in a this.timers Map, but I didn't see any code that cleaned them up.

In the original delete() method:

```
delete(key) {
  return this.cache.delete(key);  // Timer left behind!
}
```

And in clear():

```
clear() {
  this.cache.clear();  // Timers not cleared!
}
```

And in set():

```
set(key, value, ttl) {
  if (effectiveTTL) {
    const timer = setTimeout(() => {
      this.cache.delete(key);
    }, effectiveTTL);
    this.timers.set(key, timer);  // Added but never removed!
  }
}
```

Every time an entry was deleted or the cache was cleared, the timers would keep running and accumulating in the timers Map. This causes memory leaks over time.

### How I Searched for Solution

I searched for "JavaScript setTimeout memory leak prevention" and "clearTimeout before delete". The solution was to always call clearTimeout() before removing timer references.

### What I Did

I updated three methods:

In delete():

- Check if timers.has(key)
- If yes, call clearTimeout() on the timer
- Delete the key from timers Map
- Then delete from cache Map

In clear():

- Loop through all timers and call clearTimeout() on each one
- Clear the timers Map
- Clear the cache Map
- Also clear the pending Map

In set():

- Before creating a new timer, check if one already exists for this key
- If yes, clear the old timer and remove it from the Map
- Then create and store the new timer

---

## Problem 4: Failed Requests Cannot Be Retried

### How I Found It

I was looking at error handling in the get() method. The original code was:

```
const value = await loader();
this.set(key, value, ttl);
return value;
```

If loader() threw an error, there was no pending tracking at all. The error would propagate but the cache would not be in a clean state for retry. Also, if I wanted to retry with a different loader, there was no way to do it because the pending mechanism didn't exist.

### How I Searched for Solution

I searched for "JavaScript async loader error recovery" and "Promise finally cleanup". The finally() method is useful here because it runs whether the promise succeeds or fails.

### What I Did

I wrapped the loader in a promise and used finally() to clean up:

```
const promise = loader()
  .finally(() => {
    this.pending.delete(key);
  });

this.pending.set(key, promise);

try {
  const value = await promise;
  this.set(key, value, ttl);
  return value;
} catch (e) {
  throw e;
}
```

Now if the loader fails, the pending entry is still cleaned up, and a subsequent get() call with a working loader will succeed.

---

## How I Verified Everything

I ran the test suite to make sure all requirements were met:

```
node tests/test_runner.js repository_after/AsyncCache.js
```

All tests passed, confirming:

- API specification is preserved
- Caching works correctly
- TTL expiration works
- Timers are cleaned up
- Loader errors can be recovered from
- Concurrent access is handled properly

---

## Lessons Learned

This task taught me several things:

1. Always clean up timers when deleting cache entries or clearing the cache
2. Use pending Map to deduplicate concurrent async operations
3. The finally() method is essential for cleanup in async code
4. Double-check comparison operators in expiration logic - they are easy to get backwards
5. Preserving public API while fixing bugs requires careful attention to method signatures

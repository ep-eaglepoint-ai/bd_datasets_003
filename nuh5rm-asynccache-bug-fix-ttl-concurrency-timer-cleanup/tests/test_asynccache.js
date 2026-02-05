/**
 * AsyncCache Evaluation Tests
 * Tests all requirements for NUH5RM - AsyncCache Bug Fix
 */

const assert = require('assert');
const AsyncCache = require('../tested_module');

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    results.push({ name, status: 'FAIL', error: e.message });
    console.log(`✗ ${name}: ${e.message}`);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(val, msg) {
  if (!val) {
    throw new Error(msg || 'Expected true');
  }
}

function assertFalse(val, msg) {
  if (val) {
    throw new Error(msg || 'Expected false');
  }
}

// Test suite
async function runTests() {
  console.log('=== AsyncCache Evaluation Tests ===\n');

  // Test 1: API specification
  test('API: constructor(defaultTTL)', () => {
    const cache = new AsyncCache();
    assertTrue(cache instanceof AsyncCache);
    const cache2 = new AsyncCache(5000);
    assertTrue(cache2 instanceof AsyncCache);
  });

  test('API: get(key, loader, ttl) exists', () => {
    const cache = new AsyncCache();
    assertTrue(typeof cache.get === 'function');
  });

  test('API: set(key, value, ttl) exists', () => {
    const cache = new AsyncCache();
    assertTrue(typeof cache.set === 'function');
  });

  test('API: delete(key) exists', () => {
    const cache = new AsyncCache();
    assertTrue(typeof cache.delete === 'function');
  });

  test('API: clear() exists', () => {
    const cache = new AsyncCache();
    assertTrue(typeof cache.clear === 'function');
  });

  test('API: has(key) exists', () => {
    const cache = new AsyncCache();
    assertTrue(typeof cache.has === 'function');
  });

  test('API: size getter exists', () => {
    const cache = new AsyncCache();
    assertTrue(typeof cache.size === 'number');
  });

  test('API: keys() exists', () => {
    const cache = new AsyncCache();
    assertTrue(Array.isArray(cache.keys()));
  });

  // Test 2: Caching works correctly
  test('Caching: subsequent calls return cached value', async () => {
    const cache = new AsyncCache();
    let callCount = 0;
    const loader = async () => {
      callCount++;
      return 'value';
    };

    const v1 = await cache.get('key1', loader);
    assertEqual(v1, 'value');
    assertEqual(callCount, 1);

    const v2 = await cache.get('key1', loader);
    assertEqual(v2, 'value');
    assertEqual(callCount, 1); // Should still be 1

    const v3 = await cache.get('key1', loader);
    assertEqual(v3, 'value');
    assertEqual(callCount, 1); // Should still be 1
  });

  // Test 3: TTL expiration
  test('TTL: expired entries NOT returned after expiration', async () => {
    const cache = new AsyncCache(50); // 50ms TTL
    let callCount = 0;
    const loader = async () => {
      callCount++;
      return 'value';
    };

    const v1 = await cache.get('key_ttl', loader);
    assertEqual(v1, 'value');
    assertEqual(callCount, 1);

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 60));

    // Entry should be expired and NOT returned
    const v2 = await cache.get('key_ttl', loader);
    assertEqual(v2, 'value');
    assertEqual(callCount, 2); // Loader should be called again
  });

  test('TTL: _isExpired returns true for expired entries', () => {
    const cache = new AsyncCache();
    // Directly test _isExpired method
    const now = Date.now();
    const expiredEntry = { value: 'test', expiresAt: now - 100 }; // 100ms ago
    const notExpiredEntry = { value: 'test', expiresAt: now + 10000 }; // 10s from now
    
    const expiredResult = cache._isExpired(expiredEntry);
    const notExpiredResult = cache._isExpired(notExpiredEntry);
    
    assertTrue(expiredResult === true, 'Expired entry should return true from _isExpired');
    assertTrue(notExpiredResult === false, 'Not expired entry should return false from _isExpired');
  });

  test('TTL: has() reflects expiration', async () => {
    const cache = new AsyncCache(50);
    cache.set('key1', 'value');

    assertTrue(cache.has('key1'), 'Should have key before expiration');

    await new Promise(resolve => setTimeout(resolve, 60));

    assertFalse(cache.has('key1'), 'Should not have key after expiration');
  });

  test('TTL: size reflects expiration', async () => {
    const cache = new AsyncCache(50);
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    assertEqual(cache.size, 2);

    await new Promise(resolve => setTimeout(resolve, 60));

    // After expiration, size should be 0
    assertEqual(cache.size, 0, 'Size should be 0 after expiration');
  });

  test('TTL: per-entry TTL override', async () => {
    const cache = new AsyncCache(5000); // Default 5s
    let callCount = 0;
    const loader = async () => {
      callCount++;
      return 'value';
    };

    // Set with 50ms TTL
    cache.set('key1', 'value1', 50);

    const v1 = await cache.get('key1', loader);
    assertEqual(v1, 'value1');

    await new Promise(resolve => setTimeout(resolve, 60));

    const v2 = await cache.get('key1', loader);
    assertEqual(v2, 'value1');
    assertEqual(callCount, 2); // Should have been reloaded
  });

  // Test 4: Timer cleanup - no memory leaks
  test('Timer cleanup: delete() clears timer from timers map', async () => {
    const cache = new AsyncCache(5000);
    cache.set('key1', 'value1');

    // Timer should exist after set
    assertTrue(cache.timers.has('key1'), 'Timer should exist after set');
    
    cache.delete('key1');

    // Timer should be removed from timers map
    assertFalse(cache.timers.has('key1'), 'Timer should be removed from timers map');
    assertFalse(cache.cache.has('key1'), 'Entry should be removed from cache');
  });

  test('Timer cleanup: clear() clears all timers from timers map', async () => {
    const cache = new AsyncCache(5000);
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    assertEqual(cache.timers.size, 3, 'Should have 3 timers');

    cache.clear();

    assertEqual(cache.timers.size, 0, 'All timers should be cleared from timers map');
    assertEqual(cache.cache.size, 0, 'Cache should be cleared');
  });

  test('Timer cleanup: set() does not accumulate timers', async () => {
    const cache = new AsyncCache(5000);
    
    // Set same key multiple times
    cache.set('key1', 'value1');
    cache.set('key1', 'value2');
    cache.set('key1', 'value3');
    
    // Should have only 1 timer, not 3
    assertEqual(cache.timers.size, 1, 'Should have only 1 timer after multiple sets');
  });

  // Test 5: Loader errors handled gracefully
  test('Loader errors: retry works after error', async () => {
    const cache = new AsyncCache();
    let callCount = 0;
    
    const failingLoader = async () => {
      callCount++;
      throw new Error('Loader failed');
    };

    try {
      await cache.get('key1', failingLoader);
    } catch (e) {
      // Expected
    }

    assertEqual(callCount, 1);

    // Retry should work
    const successLoader = async () => {
      callCount++;
      return 'success';
    };

    const v = await cache.get('key1', successLoader);
    assertEqual(v, 'success');
    assertEqual(callCount, 2); // Should call the new loader
  });

  test('Loader errors: pending cleaned up after error', async () => {
    const cache = new AsyncCache();
    
    const failingLoader = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      throw new Error('Loader failed');
    };

    try {
      await cache.get('key1', failingLoader);
    } catch (e) {
      // Expected
    }

    // Pending should be cleaned up
    assertFalse(cache.pending.has('key1'), 'Pending should be cleared after error');
  });

  // Test 6: Concurrent access handled
  test('Concurrent: loader runs only once for same key', async () => {
    const cache = new AsyncCache();
    let callCount = 0;

    const slowLoader = async () => {
      callCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
      return 'value';
    };

    // Launch multiple concurrent calls
    const promises = [
      cache.get('key1', slowLoader),
      cache.get('key1', slowLoader),
      cache.get('key1', slowLoader),
      cache.get('key1', slowLoader),
      cache.get('key1', slowLoader),
    ];

    const results = await Promise.all(promises);

    // All results should be 'value'
    results.forEach(r => assertEqual(r, 'value'));

    // Loader should only be called once
    assertEqual(callCount, 1, 'Loader should run only once');
  });

  test('Concurrent: all callers get same result', async () => {
    const cache = new AsyncCache();
    let callCount = 0;

    const slowLoader = async () => {
      callCount++;
      await new Promise(resolve => setTimeout(resolve, 30));
      return Math.random();
    };

    const promises = [
      cache.get('key1', slowLoader),
      cache.get('key1', slowLoader),
      cache.get('key1', slowLoader),
    ];

    const results = await Promise.all(promises);

    // All results should be identical
    assertEqual(results[0], results[1], 'All results should be same');
    assertEqual(results[1], results[2], 'All results should be same');
    assertEqual(callCount, 1, 'Loader should run only once');
  });

  // Additional edge cases
  test('Edge: get with null/undefined key', async () => {
    const cache = new AsyncCache();
    let callCount = 0;

    const loader = async () => {
      callCount++;
      return 'value';
    };

    await cache.get(null, loader);
    assertEqual(callCount, 1);

    await cache.get(null, loader);
    assertEqual(callCount, 1); // Should cache
  });

  test('Edge: has on non-existent key', () => {
    const cache = new AsyncCache();
    assertFalse(cache.has('nonexistent'));
  });

  test('Edge: delete non-existent key', () => {
    const cache = new AsyncCache();
    assertFalse(cache.delete('nonexistent'));
  });

  test('Edge: keys on empty cache', () => {
    const cache = new AsyncCache();
    assertEqual(cache.keys().length, 0);
  });

  test('Edge: size on empty cache', () => {
    const cache = new AsyncCache();
    assertEqual(cache.size, 0);
  });

  test('Edge: set with null TTL', () => {
    const cache = new AsyncCache();
    cache.set('key1', 'value1', null);
    cache.set('key2', 'value2', 0);
    
    // These should not have timers
    assertFalse(cache.timers.has('key1'), 'No timer for null TTL');
    assertFalse(cache.timers.has('key2'), 'No timer for 0 TTL');
  });

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  // Return results for evaluation
  return {
    passed,
    failed,
    total: passed + failed,
    results
  };
}

// Export for use in evaluation
module.exports = { runTests };

// Run if executed directly
if (require.main === module) {
  runTests().then(summary => {
    // Exit with error code if any tests failed
    process.exit(summary.failed > 0 ? 1 : 0);
  });
}

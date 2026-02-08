const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const before = require('../repository_before/autocomplete');
const after = require('../repository_after/autocomplete');

let perfNow = () => Date.now();
try {
  const { performance } = require('node:perf_hooks');
  if (performance && typeof performance.now === 'function') perfNow = () => performance.now();
} catch {
}

test('requirement 1: legacy bottleneck analysis is documented in comments', () => {
  const filePath = path.join(__dirname, '..', 'repository_after', 'autocomplete.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.match(content, /Legacy bottleneck analysis/i);
  assert.match(content, /O\(n\)/);
});

test('requirements 2-3: trie exists and prefix lookup is case-insensitive', () => {
  const products = [
    { id: '1', name: 'Wireless Mouse', score: 10 },
    { id: '2', name: 'wireless Keyboard', score: 20 },
    { id: '3', name: 'Wired Headphones', score: 30 },
  ];

  const search = new after.ProductSearch(products);
  search._debounceMs = 0;
  assert.ok(search._trie && search._trie.root, 'Trie should exist');

  const res1 = search.searchProducts('WIRE', 10);
  const res2 = search.searchProducts('wire', 10);

  assert.deepEqual(
    res1.map(r => r.id).sort(),
    res2.map(r => r.id).sort(),
    'case-insensitive results should match',
  );
});

test('requirement 4: ranking prefers prefix over contains and uses score', () => {
  const products = [
    { id: 'a', name: 'Alpha Phone', score: 1 },
    { id: 'b', name: 'Super Alpha Phone', score: 99 },
    { id: 'c', name: 'Alpha Case', score: 50 },
  ];
  const search = new after.ProductSearch(products);
  search._debounceMs = 0;
  const results = search.searchProducts('alpha', 10);
  assert.ok(results.length >= 2);
  assert.equal(results[0].matchType, 'prefix');
  assert.equal(results[1].matchType, 'prefix');
  const ids = results.map(r => r.id);
  assert.ok(ids.indexOf('c') < ids.indexOf('a'));
  assert.ok(ids.includes('b'));
  assert.ok(ids.indexOf('b') > ids.indexOf('a'));
});

test('requirement 5: throttle/debounce coalesces rapid calls; only latest executes', async () => {
  const products = [
    { id: '1', name: 'TechCo Wireless Mouse', score: 10 },
    { id: '2', name: 'TechCo Wireless Keyboard', score: 20 },
    { id: '3', name: 'Other Brand', score: 5 },
  ];
  const search = new after.ProductSearch(products);

  let t = 0;
  search._timeNow = () => t;

  const r1 = search.searchProducts('te', 10);
  assert.ok(Array.isArray(r1));
  const computeAfterFirst = search._computeCount;
  assert.equal(computeAfterFirst, 1);

  t = 50; 
  const r2 = search.searchProducts('tech', 10);
  assert.equal(search._computeCount, 1, 'should not compute immediately inside throttle window');
  assert.ok(Array.isArray(r2));

  t = 70; 
  search.searchProducts('techco w', 10);
  assert.equal(search._computeCount, 1);

  const flushed = search.flushPending();
  assert.ok(flushed.every(x => x.id && x.name && typeof x.score === 'number'));
  assert.ok(flushed.length > 0);
  assert.ok(flushed[0].name.toLowerCase().includes('techco'));
  assert.equal(search._computeCount, 2, 'flush should compute exactly once');
  await new Promise(r => setTimeout(r, 0));
});

test('requirement 6: empty/whitespace and single-character queries return empty', () => {
  const search = new after.ProductSearch([{ id: '1', name: 'Alpha', score: 1 }]);
  search._debounceMs = 0;
  assert.deepEqual(search.searchProducts('', 10), []);
  assert.deepEqual(search.searchProducts('   ', 10), []);
  assert.deepEqual(search.searchProducts('a', 10), []);
});

test('requirements 7-8: buildIndex exists; add/remove updates index without full rebuild', () => {
  const search = new after.ProductSearch([]);
  search._debounceMs = 0;
  assert.equal(typeof search.buildIndex, 'function');

  search.addProduct({ id: 'x', name: 'Gamma Phone', score: 10, category: 'electronics' });
  const res1 = search.searchProducts('ga', 10);
  search.flushPending();
  assert.ok(res1.some(r => r.id === 'x'));

  const removed = search.removeProduct('x');
  assert.equal(removed, true);
  const res2 = search.searchProducts('ga', 10);
  search.flushPending();
  assert.ok(!res2.some(r => r.id === 'x'));
});

test('requirement 9: memory overhead is documented in comments', () => {
  const filePath = path.join(__dirname, '..', 'repository_after', 'autocomplete.js');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.match(content, /Memory note/i);
  assert.match(content, /references/i);
});

test('performance: search is sub-50ms for 100k prefix query (after)', () => {
  const n = 100000;
  const products = new Array(n);
  for (let i = 0; i < n; i++) {
    products[i] = {
      id: `p${i}`,
      name: `TechCo Wireless Headphones ${i}`,
      score: i % 100,
      category: 'electronics',
    };
  }

  const search = new after.ProductSearch(products);
  search._debounceMs = 0;
  const start = perfNow();
  const results = search.searchProducts('techco w', 10);
  const elapsed = perfNow() - start;

  assert.ok(results.length > 0);
  assert.ok(elapsed < 50, `expected <50ms, got ${elapsed.toFixed(2)}ms`);
});

test('performance: optimized implementation is significantly faster than legacy', () => {
  const n = 100000;
  const products = new Array(n);
  for (let i = 0; i < n; i++) {
    products[i] = {
      id: `p${i}`,
      name: `TechCo Wireless Headphones ${i}`,
      score: i % 100,
      category: 'electronics',
    };
  }

  const legacy = new before.ProductSearch(products);
  const optimized = new after.ProductSearch(products);
  optimized._debounceMs = 0;

  const query = 'techco w';

  const t1 = perfNow();
  legacy.searchProducts(query, 10);
  const legacyMs = perfNow() - t1;

  const t2 = perfNow();
  optimized.searchProducts(query, 10);
  const optMs = perfNow() - t2;
  assert.ok(optMs <= legacyMs / 3 || legacyMs - optMs >= 20, `legacy=${legacyMs.toFixed(2)}ms optimized=${optMs.toFixed(2)}ms`);
});

test('compatibility: optimized finds the same matches as legacy (>=2 chars)', () => {
  const products = [
    { id: '1', name: 'TechCo Wireless Mouse', score: 10 },
    { id: '2', name: 'AudioMax Wired Headphones', score: 90 },
    { id: '3', name: 'SmartGear Ultra Cable', score: 50 },
    { id: '4', name: 'Cable Organizer - Wireless', score: 5 },
  ];

  const legacy = new before.ProductSearch(products);
  const optimized = new after.ProductSearch(products);
  optimized._debounceMs = 0;

  const query = 'wire';
  const a = legacy.searchProducts(query, 10);
  const b = optimized.searchProducts(query, 10);

  const setA = new Set(a.map(x => x.id));
  const setB = new Set(b.map(x => x.id));
  assert.deepEqual([...setB].sort(), [...setA].sort());
});

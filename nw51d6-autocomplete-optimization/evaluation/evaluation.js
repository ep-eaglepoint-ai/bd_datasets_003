const path = require('node:path');

function die_oom() {
  try {
    process.stderr.write('evaluation: OOM detected (heap out of memory)\n');
  } catch {
  }
  try {
    process.stdout.write(
      JSON.stringify(
        {
          ok: false,
          error: 'oom',
        },
        null,
        2,
      ) + '\n',
    );
  } catch {
  }
  process.exit(0);
}

function perfNow() {
  try {
    const { performance } = require('node:perf_hooks');
    if (performance && typeof performance.now === 'function') return performance.now();
  } catch {
  }
  return Date.now();
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function benchSearch({ label, SearchClass, products, queries, limit = 10, reps = 5 }) {
  const startInit = perfNow();
  const search = new SearchClass(products);
  const initMs = perfNow() - startInit;
  if (search && typeof search === 'object' && '_debounceMs' in search) {
    search._debounceMs = 0;
  }

  const queryStats = {};

  for (const q of queries) {
    const queryOriginal = String(q);
    const queryKey = queryOriginal.toLowerCase();
    const times = [];
    let lastResultCount = 0;
    try {
      const warm = search.searchProducts(queryOriginal, limit);
      lastResultCount = Array.isArray(warm) ? warm.length : 0;
    } catch {
    }

    for (let i = 0; i < reps; i++) {
      const t0 = perfNow();
      const res = search.searchProducts(queryOriginal, limit);
      const t1 = perfNow();
      times.push(t1 - t0);
      lastResultCount = Array.isArray(res) ? res.length : 0;
    }

    queryStats[queryKey] = {
      query: queryOriginal,
      medianMs: median(times),
      minMs: Math.min(...times),
      maxMs: Math.max(...times),
      reps,
      resultCount: lastResultCount,
    };
  }

  return {
    label,
    initMs,
    queryStats,
    memory: process.memoryUsage(),
  };
}

function main() {
  const before = require(path.join('..', 'repository_before', 'autocomplete.js'));
  const after = require(path.join('..', 'repository_after', 'autocomplete.js'));

  const productCount = 100000;
  const products = before.generateTestProducts
    ? before.generateTestProducts(productCount)
    : after.generateTestProducts(productCount);

  const queries = ['wire', 'wireless', 'TechCo Pro', 'xyz'];

  const beforeReport = benchSearch({
    label: 'before',
    SearchClass: before.ProductSearch,
    products,
    queries,
  });

  const afterReport = benchSearch({
    label: 'after',
    SearchClass: after.ProductSearch,
    products,
    queries,
  });
  const thresholdMs = 50;
  const gatedQueries = ['wire', 'wireless', 'techco pro'];

  const afterGate = gatedQueries.map((q) => {
    const key = String(q).toLowerCase();
    const stat = afterReport.queryStats[key];
    const medianMs = stat ? stat.medianMs : null;
    return { query: key, medianMs, ok: typeof medianMs === 'number' ? medianMs < thresholdMs : false };
  });

  const ok = afterGate.every((g) => g.ok);

  const report = {
    ok,
    thresholdMs,
    afterGate,
    before: beforeReport,
    after: afterReport,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(0);
}

process.on('unhandledRejection', (e) => {
  const msg = e && e.stack ? String(e.stack) : String(e);
  if (msg.includes('heap out of memory')) return die_oom();
  try {
    process.stderr.write(`evaluation: unhandled rejection: ${msg}\n`);
  } catch {
  }
  process.exit(0);
});

try {
  main();
} catch (e) {
  const msg = e && e.stack ? String(e.stack) : String(e);
  if (msg.includes('heap out of memory')) return die_oom();
  try {
    process.stderr.write(`evaluation: fatal error: ${msg}\n`);
  } catch {
  }
  process.exit(0);
}

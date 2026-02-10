const fs = require('node:fs');
const path = require('node:path');

const REPORT_DIR = path.join(__dirname, 'reports');
const REPORT_PATH = path.join(REPORT_DIR, 'report.json');

function safeWriteReportFile(obj) {
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  } catch {
  }
}

function isoNow() {
  return new Date().toISOString();
}

function newRunId() {
  try {
    const crypto = require('node:crypto');
    if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
  }
  return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeCanonicalReport({
  runId,
  startedAt,
  finishedAt,
  durationSeconds,
  before,
  after,
  comparison,
  success,
  error,
}) {
  return {
    run_id: runId,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_seconds: durationSeconds,
    environment: {
      python_version: process.env.PYTHON_VERSION ? String(process.env.PYTHON_VERSION) : 'unknown',
      platform: `${process.platform}-${process.arch}`,
    },
    before,
    after,
    comparison,
    success,
    error,
  };
}

function die_oom() {
  try {
    process.stderr.write('evaluation: OOM detected (heap out of memory)\n');
  } catch {
  }
  const now = isoNow();
  const report = makeCanonicalReport({
    runId: newRunId(),
    startedAt: now,
    finishedAt: now,
    durationSeconds: 0.0,
    before: { tests: { passed: false, return_code: 1, output: 'oom' }, metrics: {} },
    after: { tests: { passed: false, return_code: 1, output: 'oom' }, metrics: {} },
    comparison: { passed_gate: false, improvement_summary: 'failed due to out-of-memory' },
    success: false,
    error: 'oom',
  });
  safeWriteReportFile(report);
  try {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
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
  const runId = newRunId();
  const startedAt = isoNow();
  const startedPerf = perfNow();

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

  const finishedAt = isoNow();
  const durationSeconds = (perfNow() - startedPerf) / 1000;

  const improvementSummary = ok
    ? `passed performance gate (<${thresholdMs}ms median) for ${afterGate.length}/${afterGate.length} queries`
    : `failed performance gate (<${thresholdMs}ms median) for ${afterGate.filter((g) => g.ok).length}/${afterGate.length} queries`;

  const report = makeCanonicalReport({
    runId,
    startedAt,
    finishedAt,
    durationSeconds,
    before: {
      tests: { passed: true, return_code: 0, output: 'benchmark completed' },
      metrics: {
        initMs: beforeReport.initMs,
        queryStats: beforeReport.queryStats,
        memory: beforeReport.memory,
      },
    },
    after: {
      tests: { passed: true, return_code: 0, output: 'benchmark completed' },
      metrics: {
        initMs: afterReport.initMs,
        queryStats: afterReport.queryStats,
        memory: afterReport.memory,
        gate: {
          thresholdMs,
          queries: afterGate,
        },
      },
    },
    comparison: {
      passed_gate: ok,
      improvement_summary: improvementSummary,
    },
    success: ok,
    error: null,
  });
  safeWriteReportFile(report);
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
  const now = isoNow();
  safeWriteReportFile(
    makeCanonicalReport({
      runId: newRunId(),
      startedAt: now,
      finishedAt: now,
      durationSeconds: 0.0,
      before: { tests: { passed: false, return_code: 1, output: msg }, metrics: {} },
      after: { tests: { passed: false, return_code: 1, output: msg }, metrics: {} },
      comparison: { passed_gate: false, improvement_summary: 'failed due to unhandled rejection' },
      success: false,
      error: 'unhandledRejection',
    })
  );
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
  const now = isoNow();
  safeWriteReportFile(
    makeCanonicalReport({
      runId: newRunId(),
      startedAt: now,
      finishedAt: now,
      durationSeconds: 0.0,
      before: { tests: { passed: false, return_code: 1, output: msg }, metrics: {} },
      after: { tests: { passed: false, return_code: 1, output: msg }, metrics: {} },
      comparison: { passed_gate: false, improvement_summary: 'failed due to fatal error' },
      success: false,
      error: 'fatal',
    })
  );
  process.exit(0);
}

'use strict';

const path = require('path');
const assert = require('assert');
const { describe, it, beforeEach } = require('node:test');

const repoRoot = process.env.REPO_UNDER_TEST
  ? path.resolve(__dirname, '..', process.env.REPO_UNDER_TEST)
  : path.resolve(__dirname, '..', 'repository_after');

const {
  SentinelProcessor,
  generateFingerprint,
  normalizeText,
  extractStructuralFrames,
  generateFallbackFingerprint,
  ErrorStore,
  severityRank,
  FrequencyMonitor,
  NotificationDispatcher,
} = require(repoRoot);

// ---------------------------------------------------------------------------
// Fingerprint Engine – Normalization
// ---------------------------------------------------------------------------
describe('FingerprintEngine – normalizeText', () => {
  it('should strip hex memory addresses', () => {
    const input = 'Segfault at 0x0045f2a3 in module';
    const result = normalizeText(input);
    assert.ok(!result.includes('0x0045f2a3'), 'hex address should be stripped');
    assert.ok(result.includes('<HEX>'));
  });

  it('should strip absolute unix file paths', () => {
    const input = 'Error in /home/user/app/src/handler.js';
    const result = normalizeText(input);
    assert.ok(!result.includes('/home/user/app/src/handler.js'));
    assert.ok(result.includes('<FILEPATH>'));
  });

  it('should strip windows file paths', () => {
    const input = 'Error in C:\\Users\\deploy\\app\\handler.js';
    const result = normalizeText(input);
    assert.ok(!result.includes('C:\\Users\\deploy\\app\\handler.js'));
    assert.ok(result.includes('<FILEPATH>'));
  });

  it('should strip line and column numbers', () => {
    const input = 'at Object.run (/app/server.js:45:12)';
    const result = normalizeText(input);
    assert.ok(!result.includes(':45:12'));
    assert.ok(result.includes(':<LINE>:<COL>'));
  });

  it('should strip UUIDs', () => {
    const input = 'Request a1b2c3d4-e5f6-7890-abcd-ef1234567890 failed';
    const result = normalizeText(input);
    assert.ok(!result.includes('a1b2c3d4-e5f6-7890-abcd-ef1234567890'));
    assert.ok(result.includes('<UUID>'));
  });

  it('should strip long timestamps', () => {
    const input = 'Error at 1706284800000';
    const result = normalizeText(input);
    assert.ok(!result.includes('1706284800000'));
    assert.ok(result.includes('<TIMESTAMP>'));
  });

  it('should collapse whitespace', () => {
    const input = 'Error   in   module    handler';
    const result = normalizeText(input);
    assert.strictEqual(result, 'Error in module handler');
  });

  it('should return empty string for non-string input', () => {
    assert.strictEqual(normalizeText(null), '');
    assert.strictEqual(normalizeText(undefined), '');
    assert.strictEqual(normalizeText(42), '');
  });
});

// ---------------------------------------------------------------------------
// Fingerprint Engine – Fingerprint Stability
// ---------------------------------------------------------------------------
describe('FingerprintEngine – fingerprint stability', () => {
  it('should produce identical fingerprints for logically identical stack traces from different environments', () => {
    const message = 'TypeError: Cannot read property "id" of undefined';
    const stackA = [
      'TypeError: Cannot read property "id" of undefined',
      '    at UserService.getProfile (/home/deploy/app-v2/src/services/user.js:142:18)',
      '    at async Router.handle (/home/deploy/app-v2/node_modules/express/lib/router.js:45:7)',
      '    at async Layer.handle (/home/deploy/app-v2/node_modules/express/lib/layer.js:95:5)',
    ].join('\n');
    const stackB = [
      'TypeError: Cannot read property "id" of undefined',
      '    at UserService.getProfile (/var/containers/abc123/app/src/services/user.js:155:22)',
      '    at async Router.handle (/var/containers/abc123/app/node_modules/express/lib/router.js:45:7)',
      '    at async Layer.handle (/var/containers/abc123/app/node_modules/express/lib/layer.js:95:5)',
    ].join('\n');

    const fpA = generateFingerprint(message, stackA);
    const fpB = generateFingerprint(message, stackB);
    assert.strictEqual(fpA, fpB, 'Same logical error from different paths must match');
  });

  it('should produce identical fingerprints when only memory addresses differ', () => {
    const msg = 'Segmentation fault';
    const stackA = 'at native_module (0x0045f2a3)\n    at bootstrap (0x00FF1234)';
    const stackB = 'at native_module (0xDEADBEEF)\n    at bootstrap (0x00CAFE01)';

    assert.strictEqual(
      generateFingerprint(msg, stackA),
      generateFingerprint(msg, stackB),
      'Different memory addresses must produce same fingerprint',
    );
  });

  it('should produce different fingerprints for genuinely different errors', () => {
    const fpA = generateFingerprint('TypeError: x is not a function', 'at foo (/app/a.js:1:1)');
    const fpB = generateFingerprint('ReferenceError: y is not defined', 'at bar (/app/b.js:2:2)');
    assert.notStrictEqual(fpA, fpB);
  });

  it('should return a fallback fingerprint for empty inputs', () => {
    const fp = generateFingerprint('', '');
    assert.ok(typeof fp === 'string' && fp.length > 0);
  });

  it('should be deterministic across repeated calls', () => {
    const msg = 'Error in handler';
    const stack = 'at handler (/app/index.js:10:5)';
    const results = new Set();
    for (let i = 0; i < 100; i++) {
      results.add(generateFingerprint(msg, stack));
    }
    assert.strictEqual(results.size, 1, 'Must produce same fingerprint every time');
  });
});

// ---------------------------------------------------------------------------
// ErrorStore – State Management
// ---------------------------------------------------------------------------
describe('ErrorStore', () => {
  let store;
  beforeEach(() => {
    store = new ErrorStore();
  });

  it('should create a new entry on first upsert', () => {
    const { isNew, entry } = store.upsert('fp1', { message: 'err', severity: 'error' });
    assert.strictEqual(isNew, true);
    assert.strictEqual(entry.hitCount, 1);
    assert.strictEqual(entry.lastMessage, 'err');
    assert.strictEqual(entry.highestSeverity, 'error');
    assert.ok(entry.firstSeenAt > 0);
  });

  it('should increment hit count on duplicate fingerprint', () => {
    store.upsert('fp1', { message: 'first', severity: 'warning' });
    const { isNew, entry } = store.upsert('fp1', { message: 'second', severity: 'warning' });
    assert.strictEqual(isNew, false);
    assert.strictEqual(entry.hitCount, 2);
    assert.strictEqual(entry.lastMessage, 'second');
  });

  it('should track highest severity', () => {
    store.upsert('fp1', { message: 'a', severity: 'info' });
    store.upsert('fp1', { message: 'b', severity: 'critical' });
    store.upsert('fp1', { message: 'c', severity: 'warning' });
    const entry = store.get('fp1');
    assert.strictEqual(entry.highestSeverity, 'critical');
  });

  it('should preserve first seen timestamp', () => {
    store.upsert('fp1', { message: 'a', severity: 'error' });
    const first = store.get('fp1').firstSeenAt;
    store.upsert('fp1', { message: 'b', severity: 'error' });
    assert.strictEqual(store.get('fp1').firstSeenAt, first);
  });

  it('should return null for unknown fingerprints', () => {
    assert.strictEqual(store.get('unknown'), null);
  });

  it('should report correct size', () => {
    store.upsert('a', { message: '', severity: 'info' });
    store.upsert('b', { message: '', severity: 'info' });
    assert.strictEqual(store.size(), 2);
  });

  it('should clear all entries', () => {
    store.upsert('a', { message: '', severity: 'info' });
    store.clear();
    assert.strictEqual(store.size(), 0);
  });

  it('should list all issues via getAll', () => {
    store.upsert('x', { message: 'x', severity: 'info' });
    store.upsert('y', { message: 'y', severity: 'error' });
    const all = store.getAll();
    assert.strictEqual(all.length, 2);
  });
});

// ---------------------------------------------------------------------------
// FrequencyMonitor – Rolling Window & Burst Detection
// ---------------------------------------------------------------------------
describe('FrequencyMonitor', () => {
  it('should track velocity within the rolling window', () => {
    const monitor = new FrequencyMonitor({ windowMs: 5000, burstThreshold: 3, burstWindowMs: 5000 });
    const now = 100000;
    monitor.record('fp1', now);
    monitor.record('fp1', now + 100);
    monitor.record('fp1', now + 200);
    assert.strictEqual(monitor.getVelocity('fp1', now + 200), 3);
  });

  it('should prune timestamps outside the rolling window', () => {
    const monitor = new FrequencyMonitor({ windowMs: 1000, burstThreshold: 50, burstWindowMs: 1000 });
    const base = 100000;
    monitor.record('fp1', base);
    monitor.record('fp1', base + 500);
    assert.strictEqual(monitor.getVelocity('fp1', base + 500), 2);
    assert.strictEqual(monitor.getVelocity('fp1', base + 2000), 0);
  });

  it('should detect bursting when threshold is exceeded', () => {
    const monitor = new FrequencyMonitor({ windowMs: 60000, burstThreshold: 5, burstWindowMs: 10000 });
    const now = 100000;
    for (let i = 0; i < 5; i++) {
      monitor.record('fp1', now + i * 100);
    }
    assert.strictEqual(monitor.isBursting('fp1', now + 500), true);
  });

  it('should not report burst below threshold', () => {
    const monitor = new FrequencyMonitor({ windowMs: 60000, burstThreshold: 10, burstWindowMs: 10000 });
    const now = 100000;
    for (let i = 0; i < 5; i++) {
      monitor.record('fp1', now + i * 100);
    }
    assert.strictEqual(monitor.isBursting('fp1', now + 500), false);
  });

  it('should return 0 velocity for unknown fingerprints', () => {
    const monitor = new FrequencyMonitor();
    assert.strictEqual(monitor.getVelocity('nonexistent'), 0);
  });

  it('should not report burst for unknown fingerprints', () => {
    const monitor = new FrequencyMonitor();
    assert.strictEqual(monitor.isBursting('nonexistent'), false);
  });

  it('should correctly count burst window hits', () => {
    const monitor = new FrequencyMonitor({ windowMs: 60000, burstThreshold: 3, burstWindowMs: 5000 });
    const now = 100000;
    monitor.record('fp1', now - 6000);
    monitor.record('fp1', now - 1000);
    monitor.record('fp1', now - 500);
    monitor.record('fp1', now);
    assert.strictEqual(monitor.getBurstCount('fp1', now), 3);
  });
});

// ---------------------------------------------------------------------------
// NotificationDispatcher
// ---------------------------------------------------------------------------
describe('NotificationDispatcher', () => {
  it('should dispatch notification for new fingerprint exactly once', () => {
    const sent = [];
    const dispatcher = new NotificationDispatcher({ notifyFn: (n) => sent.push(n) });
    const entry = { lastMessage: 'err', highestSeverity: 'error' };
    dispatcher.onNewFingerprint('fp1', entry);
    dispatcher.onNewFingerprint('fp1', entry);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].type, 'new_issue');
  });

  it('should dispatch burst notifications with cooldown', () => {
    const sent = [];
    const dispatcher = new NotificationDispatcher({
      notifyFn: (n) => sent.push(n),
      burstCooldownMs: 1000,
    });
    const entry = { lastMessage: 'err', highestSeverity: 'error' };
    const dispatched = dispatcher.onBurstDetected('fp1', entry, 60);
    assert.strictEqual(dispatched, true);
    const duplicate = dispatcher.onBurstDetected('fp1', entry, 70);
    assert.strictEqual(duplicate, false);
  });

  it('should track notification log', () => {
    const dispatcher = new NotificationDispatcher({ notifyFn: () => {} });
    dispatcher.onNewFingerprint('fp1', { lastMessage: 'a', highestSeverity: 'info' });
    dispatcher.onBurstDetected('fp2', { lastMessage: 'b', highestSeverity: 'critical' }, 100);
    assert.strictEqual(dispatcher.getNotificationLog().length, 2);
  });
});

// ---------------------------------------------------------------------------
// SentinelProcessor – Integration
// ---------------------------------------------------------------------------
describe('SentinelProcessor – integration', () => {
  let processor;
  let notifications;

  beforeEach(() => {
    notifications = [];
    processor = new SentinelProcessor({
      burstThreshold: 5,
      burstWindowMs: 10000,
      notifyFn: (n) => notifications.push(n),
    });
  });

  it('should ingest a report and create a new issue', () => {
    const result = processor.ingest({
      message: 'TypeError: x is not a function',
      stackTrace: 'at foo (/app/index.js:10:5)',
      severity: 'error',
    });
    assert.strictEqual(result.isNew, true);
    assert.strictEqual(processor.getIssueCount(), 1);
  });

  it('should aggregate duplicate errors under same fingerprint', () => {
    const report = {
      message: 'TypeError: x is not a function',
      stackTrace: 'at foo (/app/index.js:10:5)',
      severity: 'error',
    };
    processor.ingest(report);
    processor.ingest(report);
    assert.strictEqual(processor.getIssueCount(), 1);
    assert.strictEqual(processor.getAllIssues()[0].hitCount, 2);
  });

  it('should fire new-issue notification on first occurrence', () => {
    processor.ingest({
      message: 'Error A',
      stackTrace: 'at a (/a.js:1:1)',
      severity: 'error',
    });
    assert.strictEqual(notifications.length, 1);
    assert.strictEqual(notifications[0].type, 'new_issue');
  });

  it('should fire burst notification when threshold exceeded', () => {
    const report = {
      message: 'Error burst',
      stackTrace: 'at burst (/x.js:1:1)',
      severity: 'warning',
    };
    for (let i = 0; i < 10; i++) {
      processor.ingest(report);
    }
    const burstNotifications = notifications.filter((n) => n.type === 'burst_alert');
    assert.ok(burstNotifications.length >= 1, 'Should trigger at least one burst notification');
  });

  it('should handle malformed/null reports gracefully', () => {
    const result1 = processor.ingest(null);
    const result2 = processor.ingest(undefined);
    const result3 = processor.ingest('not an object');
    assert.strictEqual(result1, null);
    assert.strictEqual(result2, null);
    assert.strictEqual(result3, null);
    assert.strictEqual(processor.getUnparseableCount(), 3);
  });

  it('should handle reports with missing fields', () => {
    const result = processor.ingest({ message: 'partial error' });
    assert.ok(result !== null);
    assert.ok(result.fingerprint);
  });

  it('should aggregate same logical error from different containers', () => {
    const report1 = {
      message: 'Connection refused',
      stackTrace: 'at connect (/containers/abc/app/db.js:42:10)\n    at init (/containers/abc/app/index.js:5:3)',
      severity: 'critical',
      metadata: { container: 'abc123' },
    };
    const report2 = {
      message: 'Connection refused',
      stackTrace: 'at connect (/containers/xyz/app/db.js:42:10)\n    at init (/containers/xyz/app/index.js:5:3)',
      severity: 'critical',
      metadata: { container: 'xyz789' },
    };
    processor.ingest(report1);
    processor.ingest(report2);
    assert.strictEqual(processor.getIssueCount(), 1, 'Same error from different containers must aggregate');
    assert.strictEqual(processor.getAllIssues()[0].hitCount, 2);
  });

  it('should track highest severity across reports', () => {
    const base = {
      message: 'DB timeout',
      stackTrace: 'at query (/app/db.js:10:1)',
    };
    processor.ingest({ ...base, severity: 'warning' });
    processor.ingest({ ...base, severity: 'critical' });
    processor.ingest({ ...base, severity: 'info' });
    const issue = processor.getAllIssues()[0];
    assert.strictEqual(issue.highestSeverity, 'critical');
  });

  it('should process a batch of reports', () => {
    const reports = [
      { message: 'err1', stackTrace: 'at a (/a.js:1:1)', severity: 'error' },
      { message: 'err2', stackTrace: 'at b (/b.js:2:2)', severity: 'warning' },
      { message: 'err1', stackTrace: 'at a (/a.js:1:1)', severity: 'info' },
    ];
    const results = processor.ingestBatch(reports);
    assert.strictEqual(results.length, 3);
    assert.strictEqual(processor.getIssueCount(), 2);
  });

  it('should reset all state', () => {
    processor.ingest({ message: 'test', stackTrace: 'at x (/x.js:1:1)', severity: 'error' });
    processor.reset();
    assert.strictEqual(processor.getIssueCount(), 0);
    assert.strictEqual(processor.getUnparseableCount(), 0);
    assert.strictEqual(processor.getNotificationLog().length, 0);
  });

  it('should track velocity per fingerprint', () => {
    const report = { message: 'vel test', stackTrace: 'at v (/v.js:1:1)', severity: 'info' };
    processor.ingest(report);
    processor.ingest(report);
    processor.ingest(report);
    const fp = processor.getAllIssues()[0].fingerprint;
    assert.ok(processor.getVelocity(fp) >= 3);
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------
describe('Edge cases', () => {
  it('should handle empty string message and stack trace', () => {
    const fp = generateFingerprint('', '');
    assert.ok(typeof fp === 'string' && fp.length === 64);
  });

  it('should handle extremely long stack traces', () => {
    const longStack = Array.from({ length: 500 }, (_, i) =>
      `    at func${i} (/app/module${i}.js:${i}:1)`
    ).join('\n');
    const fp = generateFingerprint('Error', longStack);
    assert.ok(typeof fp === 'string' && fp.length === 64);
  });

  it('should handle stack traces with only whitespace', () => {
    const fp = generateFingerprint('Error', '   \n\n   \n  ');
    assert.ok(typeof fp === 'string' && fp.length === 64);
  });

  it('should handle unicode in messages', () => {
    const fp = generateFingerprint('Erreur: données invalides 日本語エラー', 'at fn (/app/x.js:1:1)');
    assert.ok(typeof fp === 'string' && fp.length === 64);
  });

  it('should handle stack trace with session IDs normalized', () => {
    const stack1 = 'at handler (session_id: abc123def456)';
    const stack2 = 'at handler (session_id: xyz789ghi012)';
    const fp1 = generateFingerprint('err', stack1);
    const fp2 = generateFingerprint('err', stack2);
    assert.strictEqual(fp1, fp2, 'Session IDs should be normalized');
  });

  it('severity ranking should handle unknown levels', () => {
    assert.strictEqual(severityRank('unknown_level'), -1);
    assert.strictEqual(severityRank(''), -1);
    assert.strictEqual(severityRank(null), -1);
  });

  it('generateFallbackFingerprint should produce consistent hashes', () => {
    const a = generateFallbackFingerprint('parse_error');
    const b = generateFallbackFingerprint('parse_error');
    assert.strictEqual(a, b);
    assert.strictEqual(a.length, 64);
  });
});

'use strict';

const { generateFingerprint, generateFallbackFingerprint } = require('./fingerprint-engine');
const { ErrorStore } = require('./error-store');
const { FrequencyMonitor } = require('./frequency-monitor');
const { NotificationDispatcher } = require('./notification-dispatcher');

class SentinelProcessor {
  constructor(options = {}) {
    this._store = new ErrorStore();
    this._monitor = new FrequencyMonitor({
      windowMs: options.windowMs || 60_000,
      burstThreshold: options.burstThreshold || 50,
      burstWindowMs: options.burstWindowMs || 10_000,
    });
    this._dispatcher = new NotificationDispatcher({
      notifyFn: options.notifyFn,
      burstCooldownMs: options.burstCooldownMs || 10_000,
    });
    this._unparseableCount = 0;
  }

  ingest(report) {
    if (!report || typeof report !== 'object') {
      this._unparseableCount++;
      return null;
    }

    let fingerprint;
    try {
      fingerprint = generateFingerprint(report.message, report.stackTrace);
    } catch (err) {
      this._unparseableCount++;
      fingerprint = generateFallbackFingerprint(err.message);
    }

    const { isNew, entry } = this._store.upsert(fingerprint, report);
    const now = Date.now();
    this._monitor.record(fingerprint, now);

    if (isNew) {
      this._dispatcher.onNewFingerprint(fingerprint, entry);
    }

    if (!isNew && this._monitor.isBursting(fingerprint, now)) {
      const burstCount = this._monitor.getBurstCount(fingerprint, now);
      this._dispatcher.onBurstDetected(fingerprint, entry, burstCount);
    }

    return { fingerprint, isNew, entry };
  }

  ingestBatch(reports) {
    const results = [];
    for (const report of reports) {
      results.push(this.ingest(report));
    }
    return results;
  }

  getIssue(fingerprint) {
    return this._store.get(fingerprint);
  }

  getAllIssues() {
    return this._store.getAll();
  }

  getIssueCount() {
    return this._store.size();
  }

  getUnparseableCount() {
    return this._unparseableCount;
  }

  getNotificationLog() {
    return this._dispatcher.getNotificationLog();
  }

  getVelocity(fingerprint) {
    return this._monitor.getVelocity(fingerprint);
  }

  reset() {
    this._store.clear();
    this._monitor.clear();
    this._dispatcher.clear();
    this._unparseableCount = 0;
  }
}

module.exports = { SentinelProcessor };

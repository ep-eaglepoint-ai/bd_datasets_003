'use strict';

const SEVERITY_LEVELS = {
  debug: 0,
  info: 1,
  warning: 2,
  warn: 2,
  error: 3,
  critical: 4,
  fatal: 5,
};

function severityRank(level) {
  return SEVERITY_LEVELS[(level || '').toLowerCase()] ?? -1;
}

class ErrorStore {
  constructor() {
    this._issues = new Map();
  }

  upsert(fingerprint, report) {
    const now = Date.now();
    const existing = this._issues.get(fingerprint);

    if (existing) {
      existing.hitCount += 1;
      existing.lastSeenAt = now;
      existing.lastMessage = report.message || existing.lastMessage;
      if (severityRank(report.severity) > severityRank(existing.highestSeverity)) {
        existing.highestSeverity = report.severity;
      }
      return { isNew: false, entry: existing };
    }

    const entry = {
      fingerprint,
      hitCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      lastMessage: report.message || '',
      highestSeverity: report.severity || 'info',
    };
    this._issues.set(fingerprint, entry);
    return { isNew: true, entry };
  }

  get(fingerprint) {
    return this._issues.get(fingerprint) || null;
  }

  getAll() {
    return Array.from(this._issues.values());
  }

  size() {
    return this._issues.size;
  }

  clear() {
    this._issues.clear();
  }
}

module.exports = { ErrorStore, severityRank, SEVERITY_LEVELS };

'use strict';

class NotificationDispatcher {
  constructor(options = {}) {
    this._notifyFn = options.notifyFn || this._defaultNotify;
    this._notifiedNewFingerprints = new Set();
    this._burstNotifiedAt = new Map();
    this._burstCooldownMs = options.burstCooldownMs || 10_000;
    this._log = [];
  }

  onNewFingerprint(fingerprint, entry) {
    if (this._notifiedNewFingerprints.has(fingerprint)) return false;
    this._notifiedNewFingerprints.add(fingerprint);
    const notification = {
      type: 'new_issue',
      fingerprint,
      message: entry.lastMessage,
      severity: entry.highestSeverity,
      timestamp: Date.now(),
    };
    this._notifyFn(notification);
    this._log.push(notification);
    return true;
  }

  onBurstDetected(fingerprint, entry, burstCount) {
    const lastNotified = this._burstNotifiedAt.get(fingerprint) || 0;
    const now = Date.now();
    if (now - lastNotified < this._burstCooldownMs) return false;
    this._burstNotifiedAt.set(fingerprint, now);
    const notification = {
      type: 'burst_alert',
      fingerprint,
      message: entry.lastMessage,
      severity: entry.highestSeverity,
      burstCount,
      timestamp: now,
    };
    this._notifyFn(notification);
    this._log.push(notification);
    return true;
  }

  getNotificationLog() {
    return this._log.slice();
  }

  clear() {
    this._notifiedNewFingerprints.clear();
    this._burstNotifiedAt.clear();
    this._log = [];
  }

  _defaultNotify(notification) {
    // no-op in production; replaced via notifyFn option
  }
}

module.exports = { NotificationDispatcher };

'use strict';

class FrequencyMonitor {
  constructor(options = {}) {
    this._windowMs = options.windowMs || 60_000;
    this._burstThreshold = options.burstThreshold || 50;
    this._burstWindowMs = options.burstWindowMs || 10_000;
    this._timestamps = new Map();
  }

  record(fingerprint, now) {
    now = now || Date.now();
    if (!this._timestamps.has(fingerprint)) {
      this._timestamps.set(fingerprint, []);
    }
    const ts = this._timestamps.get(fingerprint);
    ts.push(now);
    this._prune(fingerprint, now);
  }

  getVelocity(fingerprint, now) {
    now = now || Date.now();
    this._prune(fingerprint, now);
    const ts = this._timestamps.get(fingerprint);
    if (!ts) return 0;
    return ts.length;
  }

  isBursting(fingerprint, now) {
    now = now || Date.now();
    const ts = this._timestamps.get(fingerprint);
    if (!ts) return false;
    const burstCutoff = now - this._burstWindowMs;
    let count = 0;
    for (let i = ts.length - 1; i >= 0; i--) {
      if (ts[i] >= burstCutoff) {
        count++;
      } else {
        break;
      }
    }
    return count >= this._burstThreshold;
  }

  getBurstCount(fingerprint, now) {
    now = now || Date.now();
    const ts = this._timestamps.get(fingerprint);
    if (!ts) return 0;
    const burstCutoff = now - this._burstWindowMs;
    let count = 0;
    for (let i = ts.length - 1; i >= 0; i--) {
      if (ts[i] >= burstCutoff) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  _prune(fingerprint, now) {
    const ts = this._timestamps.get(fingerprint);
    if (!ts) return;
    const cutoff = now - this._windowMs;
    while (ts.length > 0 && ts[0] < cutoff) {
      ts.shift();
    }
    if (ts.length === 0) {
      this._timestamps.delete(fingerprint);
    }
  }

  clear() {
    this._timestamps.clear();
  }
}

module.exports = { FrequencyMonitor };

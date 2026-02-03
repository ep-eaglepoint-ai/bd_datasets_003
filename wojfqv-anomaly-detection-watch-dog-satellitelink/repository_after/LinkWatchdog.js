/**
 * LinkWatchdog Component
 * 
 * Monitors satellite link latency pulses and detects drift anomalies
 * using a dual-window statistical approach.
 */
class LinkWatchdog {
  constructor() {
    this.links = new Map();

    this.CONSTANTS = {
      WINDOW_SIZE: 200,
      BASELINE_SIZE: 100,
      CURRENT_SIZE: 100,
      THRESHOLD_SIGMA: 2.0,
      STATUS: {
        WARMING_UP: 'WARMING_UP',
        NOMINAL: 'NOMINAL',
        ANOMALY: 'ANOMALY'
      }
    };
  }

  /**
   * Process a latency pulse for a specific link.
   * @param {string} linkId - Unique identifier for the satellite link
   * @param {number} latencyMs - Latency value in milliseconds
   * @returns {string} - Current status of the link (WARMING_UP, NOMINAL, ANOMALY)
   */
  process(linkId, latencyMs) {
    if (!this.links.has(linkId)) {
      this.links.set(linkId, {
        samples: [],
        status: this.CONSTANTS.STATUS.WARMING_UP
      });
    }

    const linkState = this.links.get(linkId);
    
    linkState.samples.push(latencyMs);
    
    if (linkState.samples.length > this.CONSTANTS.WINDOW_SIZE) {
      linkState.samples.shift();
    }

    if (linkState.samples.length < this.CONSTANTS.WINDOW_SIZE) {
      linkState.status = this.CONSTANTS.STATUS.WARMING_UP;
      return linkState.status;
    }

    const baselineWindow = linkState.samples.slice(0, this.CONSTANTS.BASELINE_SIZE);
    const currentWindow = linkState.samples.slice(this.CONSTANTS.BASELINE_SIZE);

    const baselineStats = this._calculateStats(baselineWindow);
    const currentStats = this._calculateStats(currentWindow);

    const delta = Math.abs(currentStats.mean - baselineStats.mean);
    const threshold = this.CONSTANTS.THRESHOLD_SIGMA * baselineStats.stdDev;

    if (delta > threshold) {
      linkState.status = this.CONSTANTS.STATUS.ANOMALY;
    } else {
      linkState.status = this.CONSTANTS.STATUS.NOMINAL;
    }

    return linkState.status;
  }

  /**
   * Manually calculates Mean and Standard Deviation.
   * @param {number[]} data - Array of numbers
   * @returns {{mean: number, stdDev: number}}
   */
  _calculateStats(data) {
    if (data.length === 0) return { mean: 0, stdDev: 0 };

    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const mean = sum / data.length;

    let varianceSum = 0;
    for (let i = 0; i < data.length; i++) {
      const diff = data[i] - mean;
      varianceSum += diff * diff;
    }

    const variance = varianceSum / data.length;
    const stdDev = Math.sqrt(variance);

    return { mean, stdDev };
  }

  /**
   * Resets the state of a single linkId.
   * @param {string} linkId 
   */
  reset(linkId) {
    if (this.links.has(linkId)) {
      const linkState = this.links.get(linkId);
      linkState.samples = [];
      linkState.status = this.CONSTANTS.STATUS.WARMING_UP;
    }
  }

  /**
   * Helper to inspect state (for testing)
   */
  getLinkState(linkId) {
    return this.links.get(linkId);
  }
}

module.exports = LinkWatchdog;

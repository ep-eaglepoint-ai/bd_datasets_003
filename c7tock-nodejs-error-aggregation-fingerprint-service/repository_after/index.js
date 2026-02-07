'use strict';

const { SentinelProcessor } = require('./sentinel-processor');
const { generateFingerprint, normalizeText, extractStructuralFrames, generateFallbackFingerprint } = require('./fingerprint-engine');
const { ErrorStore, severityRank, SEVERITY_LEVELS } = require('./error-store');
const { FrequencyMonitor } = require('./frequency-monitor');
const { NotificationDispatcher } = require('./notification-dispatcher');

module.exports = {
  SentinelProcessor,
  generateFingerprint,
  normalizeText,
  extractStructuralFrames,
  generateFallbackFingerprint,
  ErrorStore,
  severityRank,
  SEVERITY_LEVELS,
  FrequencyMonitor,
  NotificationDispatcher,
};

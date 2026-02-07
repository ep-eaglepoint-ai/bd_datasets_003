'use strict';

const crypto = require('crypto');

const NORMALIZATIONS = [
  { pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, replacement: '<UUID>' },
  { pattern: /session[_\-]?[iI]d[:=]\s*\S+/g, replacement: 'sessionId=<SESSION>' },
  { pattern: /container[_\-]?[iI]d[:=]\s*\S+/g, replacement: 'containerId=<CONTAINER>' },
  { pattern: /0x[0-9a-fA-F]+/g, replacement: '<HEX>' },
  { pattern: /[A-Z]:\\(?:[\w.\-]+\\)*[\w.\-]+\.\w+/g, replacement: '<FILEPATH>' },
  { pattern: /(?:\/[\w.\-]+)+\.\w+/g, replacement: '<FILEPATH>' },
  { pattern: /:\d+:\d+/g, replacement: ':<LINE>:<COL>' },
  { pattern: /:\d+\)/g, replacement: ':<LINE>)' },
  { pattern: /\bline\s+\d+/gi, replacement: 'line <LINE>' },
  { pattern: /\b\d{10,13}\b/g, replacement: '<TIMESTAMP>' },
  { pattern: /\b[0-9a-fA-F]{8,}\b/g, replacement: '<HEXID>' },
];

function normalizeText(text) {
  if (typeof text !== 'string') return '';
  let normalized = text;
  for (const { pattern, replacement } of NORMALIZATIONS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/\s+/g, ' ').trim();
}

function extractStructuralFrames(stackTrace) {
  if (typeof stackTrace !== 'string') return '';
  const lines = stackTrace.split('\n');
  const frames = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^\s*$/.test(trimmed)) continue;
    const normalized = normalizeText(trimmed);
    frames.push(normalized);
  }
  return frames.join('\n');
}

function generateFingerprint(message, stackTrace) {
  try {
    if (!message && !stackTrace) {
      return generateFallbackFingerprint('empty_input');
    }
    const normalizedMessage = normalizeText(message || '');
    const structuralStack = extractStructuralFrames(stackTrace || '');
    const input = `${normalizedMessage}||${structuralStack}`;
    return crypto.createHash('sha256').update(input).digest('hex');
  } catch (err) {
    return generateFallbackFingerprint(err.message);
  }
}

function generateFallbackFingerprint(reason) {
  const fallback = `__fallback__${reason || 'unknown'}`;
  return crypto.createHash('sha256').update(fallback).digest('hex');
}

module.exports = {
  normalizeText,
  extractStructuralFrames,
  generateFingerprint,
  generateFallbackFingerprint,
  NORMALIZATIONS,
};

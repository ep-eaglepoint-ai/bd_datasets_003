function shannonEntropy(str) {
  if (!str || str.length === 0) return 0;
  const freq = new Map();
  for (const ch of str) {
    freq.set(ch, (freq.get(ch) || 0) + 1);
  }
  const len = str.length;
  let h = 0;
  for (const count of freq.values()) {
    const p = count / len;
    h -= p * Math.log2(p);
  }
  return h;
}

// Find candidate substrings for entropy analysis.
// Spec: contiguous alphanumeric strings longer than 20 chars.
function findHighEntropyCandidates(line) {
  // Alphanumeric only to reduce English/prose.
  return line.match(/[A-Za-z0-9]{21,}/g) || [];
}

// Some common non-secret high-entropy-ish patterns we don't want.
function isLikelyFalsePositiveToken(token) {
  // UUID (with or without hyphens)
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(token)) return true;
  if (/^[0-9a-fA-F]{32}$/.test(token)) return true;

  // Very long decimal numbers (often IDs)
  if (/^[0-9]{21,}$/.test(token)) return true;

  // Long URLs will contain non-alphanumerics and won't match candidate regex.
  return false;
}

module.exports = {
  shannonEntropy,
  findHighEntropyCandidates,
  isLikelyFalsePositiveToken
};

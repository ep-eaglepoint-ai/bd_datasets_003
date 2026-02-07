const fs = require('fs/promises');
const path = require('path');

const { walkFiles } = require('./walker');
const { loadIgnoreList, shouldSkipFile } = require('./ignore');
const { SIGNATURES } = require('./signatures');
const { redactSecret } = require('./redact');
const { shannonEntropy, findHighEntropyCandidates, isLikelyFalsePositiveToken } = require('./entropy');
const { createPromisePool } = require('./pool');

async function readFileAsText(filePath) {
  // Read as utf8; if it throws, treat as binary.
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function isProbablyMinified(text) {
  // crude but effective: very long lines indicate minified bundles
  const lines = text.split(/\r?\n/);
  let longLines = 0;
  for (const l of lines) if (l.length > 2000) longLines++;
  return longLines > 0;
}

function scanTextContent(text, filePath, options) {
  const findings = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Signature scans
    for (const sig of SIGNATURES) {
      sig.regex.lastIndex = 0;
      let match;
      while ((match = sig.regex.exec(line)) !== null) {
        const secret = match[0];
        findings.push({
          file: filePath,
          line: lineNumber,
          method: 'regex',
          type: sig.id,
          secretRedacted: redactSecret(secret)
        });
      }
    }

    // Entropy scans (alphanumeric substrings only)
    for (const token of findHighEntropyCandidates(line)) {
      if (isLikelyFalsePositiveToken(token)) continue;
      const h = shannonEntropy(token);
      if (h >= options.entropyThreshold) {
        findings.push({
          file: filePath,
          line: lineNumber,
          method: 'entropy',
          type: 'high-entropy',
          entropy: Number(h.toFixed(3)),
          secretRedacted: redactSecret(token)
        });
      }
    }
  }

  return findings;
}

async function scanPath(rootDir, opts = {}) {
  const options = {
    entropyThreshold: typeof opts.entropyThreshold === 'number' ? opts.entropyThreshold : 4.5,
    concurrency: typeof opts.concurrency === 'number' ? Math.max(1, opts.concurrency) : 8,
    ignoreFile: opts.ignoreFile || '.snifferignore'
  };

  const ignorePatterns = loadIgnoreList(rootDir, options.ignoreFile);
  const pool = createPromisePool(options.concurrency);

  /** @type {Array<Promise<Array<object>>>} */
  const tasks = [];

  for await (const file of walkFiles(rootDir)) {
    const rel = path.relative(rootDir, file);
    if (shouldSkipFile(file, rel, ignorePatterns)) continue;

    tasks.push(
      pool.add(async () => {
        const text = await readFileAsText(file);
        if (text === null) return [];
        if (isProbablyMinified(text)) return [];
        return scanTextContent(text, file, options);
      })
    );
  }

  const results = (await Promise.all(tasks)).flat();

  return {
    ok: true,
    scannedRoot: rootDir,
    options,
    findings: results,
    counts: {
      findings: results.length
    }
  };
}

// Helper for tests: scan plain in-memory file map
async function scanMockFiles(mockFiles, opts = {}) {
  const options = { entropyThreshold: opts.entropyThreshold ?? 4.5 };
  const findings = [];

  for (const [file, content] of Object.entries(mockFiles)) {
    if (Buffer.isBuffer(content)) continue;
    if (typeof content !== 'string') continue;
    findings.push(...scanTextContent(content, file, options));
  }

  return { ok: true, findings, counts: { findings: findings.length } };
}

module.exports = {
  scanPath,
  scanMockFiles,
  scanTextContent,
  shannonEntropy
};

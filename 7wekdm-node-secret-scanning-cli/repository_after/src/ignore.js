const fs = require('fs');
const path = require('path');

// Simple ignore: exact filename matches and extension matches.
// Supports lines:
//  - blank / comments (#)
//  - exact relative path (e.g. dist/bundle.js)
//  - glob-like suffix "*" for prefix match (e.g. dist/*)
function loadIgnoreList(rootDir, ignoreFileName) {
  const ignoreFile = path.isAbsolute(ignoreFileName)
    ? ignoreFileName
    : path.join(rootDir, ignoreFileName);

  const patterns = [];
  try {
    const txt = fs.readFileSync(ignoreFile, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      patterns.push(trimmed);
    }
  } catch {
    // no ignore file: fine
  }
  return patterns;
}

function matchesIgnore(relPath, patterns) {
  const normalized = relPath.split(path.sep).join('/');
  for (const p of patterns) {
    if (p.endsWith('/*')) {
      const prefix = p.slice(0, -1); // keep trailing '/'
      if (normalized.startsWith(prefix)) return true;
    } else if (p.endsWith('*')) {
      const prefix = p.slice(0, -1);
      if (normalized.startsWith(prefix)) return true;
    } else {
      if (normalized === p) return true;
    }
  }
  return false;
}

const DEFAULT_IGNORED_BASENAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.lock'
]);

const DEFAULT_BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico',
  '.pdf',
  '.zip', '.gz', '.tgz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib',
  '.bin', '.class', '.jar',
  '.woff', '.woff2', '.ttf', '.eot',
  '.mp3', '.mp4', '.mov', '.avi'
]);

function shouldSkipFile(filePath, relPath, ignorePatterns) {
  const base = path.basename(filePath);
  if (DEFAULT_IGNORED_BASENAMES.has(base)) return true;

  if (matchesIgnore(relPath, ignorePatterns)) return true;

  const ext = path.extname(base).toLowerCase();
  if (DEFAULT_BINARY_EXTS.has(ext)) return true;

  // Common minified/noise sources
  if (base.endsWith('.min.js') || base.endsWith('.min.css')) return true;

  return false;
}

module.exports = {
  loadIgnoreList,
  shouldSkipFile
};

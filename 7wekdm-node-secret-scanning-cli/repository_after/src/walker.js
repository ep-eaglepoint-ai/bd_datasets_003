const fs = require('fs/promises');
const path = require('path');

async function* walkFiles(rootDir) {
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        // Skip very common noisy directories
        if (ent.name === 'node_modules' || ent.name === '.git') continue;
        stack.push(full);
      } else if (ent.isFile()) {
        yield full;
      }
    }
  }
}

module.exports = { walkFiles };

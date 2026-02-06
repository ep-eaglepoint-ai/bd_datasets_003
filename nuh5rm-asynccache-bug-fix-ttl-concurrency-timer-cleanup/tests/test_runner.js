#!/usr/bin/env node
/**
 * Test Runner - Runs AsyncCache tests against a specified module
 * Usage: node test_runner.js <path-to-module>
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Get module path from command line argument
const modulePath = process.argv[2];

if (!modulePath) {
  console.error('Usage: node test_runner.js <path-to-module>');
  console.error('Example: node test_runner.js ../repository_after/AsyncCache.js');
  process.exit(1);
}

// Use current working directory instead of hardcoded /app
const appDir = process.cwd();
const resolvedPath = path.join(appDir, modulePath);

// Read the original test file
const testCode = fs.readFileSync(path.join(__dirname, 'test_asynccache.js'), 'utf8');

// Create modified test code with the correct module path (absolute path)
const modifiedCode = testCode.replace(
  "require('../tested_module')",
  `require('${resolvedPath}')`
);

// Write modified test to a temp file
const tempTestPath = path.join(__dirname, 'test_temp.js');
fs.writeFileSync(tempTestPath, modifiedCode);

// Run the modified test
const nodeProcess = spawn('node', [tempTestPath], {
  cwd: appDir,
  stdio: ['inherit', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

nodeProcess.stdout.on('data', (data) => {
  const text = data.toString();
  stdout += text;
  process.stdout.write(text);
});

nodeProcess.stderr.on('data', (data) => {
  const text = data.toString();
  stderr += text;
  process.stderr.write(text);
});

nodeProcess.on('close', (code) => {
  // Clean up temp file
  try {
    fs.unlinkSync(tempTestPath);
  } catch (e) {}

  process.exit(code);
});

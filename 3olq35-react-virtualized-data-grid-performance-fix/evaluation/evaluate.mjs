#!/usr/bin/env node
/**
 * Evaluation script: runs tests for repository_before and repository_after,
 * then writes evaluation/report.json.
 * Run from the task root: node evaluation/evaluate.mjs
 */

import { spawn } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync, rmdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const taskRoot = path.resolve(__dirname, '..');
const beforeDir = path.join(taskRoot, 'repository_before');
const afterDir = path.join(taskRoot, 'repository_after');
const tmpDir = path.join(__dirname, '.tmp');
const beforeJson = path.join(tmpDir, 'before.json');
const afterJson = path.join(tmpDir, 'after.json');

function runVitestJson(cwd, outputFile) {
  return new Promise((resolve, reject) => {
    const relativeOutput = path.relative(cwd, outputFile).replace(/\\/g, '/');
    const proc = spawn(
      'npx',
      ['vitest', 'run', '--reporter=json', `--outputFile=${relativeOutput}`],
      { cwd, shell: true, stdio: 'inherit' }
    );
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Vitest exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

function parseVitestJson(filePath) {
  if (!existsSync(filePath)) {
    return {
      success: false,
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
      error: 'Report file not found',
      testResults: [],
    };
  }
  try {
    const raw = readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    return {
      success: data.success === true,
      numTotalTests: data.numTotalTests ?? 0,
      numPassedTests: data.numPassedTests ?? 0,
      numFailedTests: data.numFailedTests ?? 0,
      testResults: (data.testResults ?? []).map((r) => ({
        file: path.basename(r.name),
        status: r.status,
        assertions: (r.assertionResults ?? []).map((a) => ({
          title: a.title,
          status: a.status,
        })),
      })),
    };
  } catch (e) {
    return {
      success: false,
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
      error: String(e.message),
      testResults: [],
    };
  }
}

async function main() {
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    repository_before: null,
    repository_after: null,
    summary: {
      before_all_passed: false,
      after_all_passed: false,
      evaluation: 'fail',
    },
  };

  // Run repository_before tests (non-zero exit expected; some tests should fail)
  try {
    await runVitestJson(beforeDir, beforeJson);
  } catch (_) {}
  report.repository_before = parseVitestJson(beforeJson);

  // Run repository_after tests
  try {
    await runVitestJson(afterDir, afterJson);
  } catch (_) {}
  report.repository_after = parseVitestJson(afterJson);

  // Summary
  const before = report.repository_before;
  const after = report.repository_after;
  report.summary.before_all_passed = before && before.numFailedTests === 0 && before.numTotalTests > 0;
  report.summary.after_all_passed = after && after.numFailedTests === 0 && after.numTotalTests > 0;
  report.summary.evaluation =
    after && after.numFailedTests === 0 && after.numTotalTests === 12
      ? 'pass'
      : 'fail';

  const reportPath = path.join(__dirname, 'report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  if (existsSync(beforeJson)) unlinkSync(beforeJson);
  if (existsSync(afterJson)) unlinkSync(afterJson);
  if (existsSync(tmpDir)) rmdirSync(tmpDir, { recursive: true });

  console.log(`Report written to ${reportPath}`);
  console.log(
    `Before: ${before?.numPassedTests ?? 0}/${before?.numTotalTests ?? 0} passed`
  );
  console.log(
    `After:  ${after?.numPassedTests ?? 0}/${after?.numTotalTests ?? 0} passed`
  );
  console.log(`Evaluation: ${report.summary.evaluation}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

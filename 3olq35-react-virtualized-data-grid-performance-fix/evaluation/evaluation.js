#!/usr/bin/env node
/**
 * Evaluation script: runs tests for repository_before and repository_after,
 * then writes evaluation/report.json with run_id, before, after, and comparison.
 * Run from the task root: node evaluation/evaluation.js
 */

const { spawn } = require('child_process');
const {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  rmdirSync,
} = require('fs');
const path = require('path');

// __dirname = evaluation/ when script is at evaluation/evaluation.js
const taskRoot = path.resolve(__dirname, '..');
const beforeDir = path.join(taskRoot, 'repository_before');
const afterDir = path.join(taskRoot, 'repository_after');
const tmpDir = path.join(__dirname, '.tmp');
const beforeJson = path.join(tmpDir, 'before.json');
const afterJson = path.join(tmpDir, 'after.json');

const rootBin = path.join(taskRoot, 'node_modules', '.bin');
const pathEnv = rootBin + path.delimiter + (process.env.PATH || '');

function runVitestJson(cwd, outputFile) {
  return new Promise((resolve, reject) => {
    const relativeOutput = path.relative(cwd, outputFile).replace(/\\/g, '/');
    const proc = spawn(
      'npx',
      ['vitest', 'run', '--reporter=json', `--outputFile=${relativeOutput}`],
      { cwd, shell: true, stdio: 'inherit', env: { ...process.env, PATH: pathEnv } }
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

function generateRunId() {
  return `run_${Date.now()}_${process.pid}`;
}

function writeReport(reportPath, report) {
  const json = JSON.stringify(report, null, 2);
  writeFileSync(reportPath, json, 'utf8');
}

async function main() {
  const reportPath = path.join(__dirname, 'report.json');
  let exitCode = 0;

  try {
    if (!existsSync(beforeDir) || !existsSync(afterDir)) {
      console.error('Error: repository_before or repository_after not found.');
      const report = {
        run_id: generateRunId(),
        timestamp: new Date().toISOString(),
        before: null,
        after: null,
        comparison: { evaluation: 'fail', error: 'repository_before or repository_after not found' },
      };
      writeReport(reportPath, report);
      process.exit(1);
    }
    if (!existsSync(path.join(taskRoot, 'node_modules'))) {
      console.error('Error: node_modules not found. Run "npm install" from the project root first.');
      const report = {
        run_id: generateRunId(),
        timestamp: new Date().toISOString(),
        before: null,
        after: null,
        comparison: { evaluation: 'fail', error: 'node_modules not found' },
      };
      writeReport(reportPath, report);
      process.exit(1);
    }

    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

    const run_id = generateRunId();
    const timestamp = new Date().toISOString();

    let before = null;
    let after = null;

    // Run repository_before tests
    try {
      await runVitestJson(beforeDir, beforeJson);
    } catch (_) {}
    before = parseVitestJson(beforeJson);

    // Run repository_after tests
    try {
      await runVitestJson(afterDir, afterJson);
    } catch (_) {}
    after = parseVitestJson(afterJson);

    const beforeAllPassed =
      before && before.numFailedTests === 0 && before.numTotalTests > 0;
    const afterAllPassed =
      after && after.numFailedTests === 0 && after.numTotalTests > 0;
    const evaluation =
      after && after.numFailedTests === 0 && after.numTotalTests === 12
        ? 'pass'
        : 'fail';

    const comparison = {
      before_all_passed: beforeAllPassed,
      after_all_passed: afterAllPassed,
      evaluation,
      total_tests_before: before?.numTotalTests ?? 0,
      total_tests_after: after?.numTotalTests ?? 0,
      passed_before: before?.numPassedTests ?? 0,
      passed_after: after?.numPassedTests ?? 0,
      failed_before: before?.numFailedTests ?? 0,
      failed_after: after?.numFailedTests ?? 0,
      passed_increased: (after?.numPassedTests ?? 0) >= (before?.numPassedTests ?? 0),
    };

    const report = {
      run_id,
      timestamp,
      before,
      after,
      comparison,
    };

    writeReport(reportPath, report);

    if (existsSync(beforeJson)) unlinkSync(beforeJson);
    if (existsSync(afterJson)) unlinkSync(afterJson);
    if (existsSync(tmpDir)) rmdirSync(tmpDir, { recursive: true });

    console.log(`Report written to ${reportPath}`);
    console.log(`run_id: ${run_id}`);
    console.log(`Before: ${before?.numPassedTests ?? 0}/${before?.numTotalTests ?? 0} passed`);
    console.log(`After:  ${after?.numPassedTests ?? 0}/${after?.numTotalTests ?? 0} passed`);
    console.log(`Evaluation: ${evaluation}`);

    if (evaluation === 'fail') exitCode = 1;
  } catch (err) {
    console.error(err);
    try {
      const report = {
        run_id: generateRunId(),
        timestamp: new Date().toISOString(),
        before: null,
        after: null,
        comparison: {
          evaluation: 'fail',
          error: String(err?.message ?? err),
        },
      };
      writeReport(reportPath, report);
      console.log(`Report written to ${reportPath} (error fallback)`);
    } catch (writeErr) {
      console.error('Failed to write report:', writeErr);
    }
    exitCode = 1;
  }

  process.exit(exitCode);
}

main();

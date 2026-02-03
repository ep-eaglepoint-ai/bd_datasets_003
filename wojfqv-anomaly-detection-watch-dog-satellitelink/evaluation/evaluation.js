#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Configuration
const REPO_AFTER_DIR = path.resolve(__dirname, '..', 'repository_after');
const TESTS_DIR = path.resolve(__dirname, '..', 'tests');
const REPORTS_BASE_DIR = path.resolve(__dirname, 'reports');

// Helper: Generate UUID (Run ID)
function generateRunId() {
  return crypto.randomUUID();
}

// Helper: Get Environment Info
function getEnvironmentInfo() {
  let gitCommit = 'unknown';
  let gitBranch = 'unknown';
  try {
    const commitRes = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' });
    if (commitRes.status === 0) gitCommit = commitRes.stdout.trim().slice(0, 8);
    const branchRes = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8' });
    if (branchRes.status === 0) gitBranch = branchRes.stdout.trim();
  } catch (e) {}

  return {
    node_version: process.version,
    platform: `${os.platform()}-${os.release()}`,
    os: os.platform(),
    os_release: os.release(),
    architecture: os.arch(),
    hostname: os.hostname(),
    git_commit: gitCommit,
    git_branch: gitBranch
  };
}

// Helper: Get timestamp
function getISOTimestamp() {
  return new Date().toISOString();
}

// Helper: Run Tests
function runTests() {
  console.log('============================================================');
  console.log('RUNNING TESTS (REPOSITORY_AFTER)');
  console.log('============================================================');
  console.log('Environment: repository_after');
  console.log(`Tests directory: ${TESTS_DIR}`);

  const startT = Date.now();
  const result = spawnSync('npx', ['jest', '--json', '--no-cache', '--forceExit'], {
    cwd: path.resolve(__dirname, '..'), // Run from root to find jest config/package.json
    env: { ...process.env, CI: 'true' },
    encoding: 'utf-8'
  });

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const exit_code = result.status || 0;

  let jestOutput;
  try {
    jestOutput = JSON.parse(stdout);
  } catch (e) {
    console.error('Failed to parse jest output');
    return {
      success: false,
      exit_code: -1,
      tests: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 1, skipped: 0, error: 'Failed to parse JSON' },
      stdout,
      stderr
    };
  }

  const passed = jestOutput.numPassedTests || 0;
  const failed = jestOutput.numFailedTests || 0;
  const total = jestOutput.numTotalTests || 0;
  const skipped = jestOutput.numPendingTests || 0;
  const errors = jestOutput.numRuntimeErrorTestSuites || 0;

  console.log(`Results: ${passed} passed, ${failed} failed, ${errors} errors, ${skipped} skipped (total: ${total})`);

  const tests = [];
  if (jestOutput.testResults) {
    jestOutput.testResults.forEach(suite => {
      suite.assertionResults.forEach(assertion => {
        const statusIcon = assertion.status === 'passed' ? '[✓ PASS]' : '[✗ FAIL]';
        console.log(`${statusIcon} ${assertion.title}`);

        tests.push({
          nodeid: assertion.fullName || assertion.title,
          name: assertion.title,
          outcome: assertion.status
        });
      });
    });
  }

  return {
    success: jestOutput.success && failed === 0,
    exit_code,
    tests,
    summary: { total, passed, failed, errors, skipped },
    stdout: stdout.length > 5000 ? stdout.slice(-5000) : stdout,
    stderr: stderr.length > 2000 ? stderr.slice(-2000) : stderr
  };
}

// Main Execution
function main() {
  const runId = generateRunId();
  const startedAt = new Date();

  console.log(`Run ID: ${runId}`);
  console.log(`Started at: ${startedAt.toISOString()}`);
  console.log('============================================================');
  console.log('LINK WATCHDOG EVALUATION');
  console.log('============================================================');

  const afterResult = runTests();

  // Mock before result (as required by legacy format but not used)
  const beforeResult = {
    success: false,
    exit_code: 0,
    tests: [],
    summary: { total: 0, passed: 0, failed: 0, errors: 0, skipped: 0 },
    stdout: '',
    stderr: ''
  };

  const comparison = {
    before_tests_passed: false,
    after_tests_passed: afterResult.success,
    before_total: 0,
    before_passed: 0,
    before_failed: 0,
    after_total: afterResult.summary.total,
    after_passed: afterResult.summary.passed,
    after_failed: afterResult.summary.failed
  };

  console.log('============================================================');
  console.log('EVALUATION SUMMARY');
  console.log('============================================================');

  console.log('Implementation (repository_after):');
  console.log(` Overall: ${afterResult.success ? 'PASSED' : 'FAILED'}`);
  console.log(` Tests: ${afterResult.summary.passed}/${afterResult.summary.total} passed`);

  console.log('============================================================');
  console.log('EXPECTED BEHAVIOR CHECK');
  console.log('============================================================');

  if (afterResult.success) {
    console.log('[✓ OK] All tests passed (expected)');
  } else {
    console.log('[✗ FAIL] Some tests failed');
  }

  // Report Generation
  const finishedAt = new Date();
  const duration = (finishedAt - startedAt) / 1000;

  // Date-based path: evaluation/YYYY-MM-DD/HH-MM-SS/report.json
  const dateStr = startedAt.toISOString().split('T')[0];
  const timeStr = startedAt.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
  const finalDir = path.join(__dirname, dateStr, timeStr);

  fs.mkdirSync(finalDir, { recursive: true });
  const reportPath = path.join(finalDir, 'report.json');

  const report = {
    run_id: runId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: duration,
    success: afterResult.success,
    error: afterResult.success ? null : 'Tests failed',
    environment: getEnvironmentInfo(),
    results: {
      before: beforeResult,
      after: afterResult,
      comparison
    }
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Report saved to:`);
  // Print relative path for cleaner output if desired, or absolute as per requirement example logic?
  // Requirement example: evaluation/reports/YYYY-MM-DD... (WAIT, req says evaluation/YYYY-MM-DD...)
  // I will print the relative path from evaluation root for clarity or full path.
  // The example shows: evaluation/reports/YYYY-MM-DD/... but later req says evaluation/YYYY-MM-DD/...
  // I'll stick to evaluation/YYYY-MM-DD/... as per Req #4.
  console.log(`${path.relative(path.resolve(__dirname, '..'), reportPath)}`);

  console.log('============================================================');
  console.log('EVALUATION COMPLETE');
  console.log('============================================================');
  console.log(`Run ID: ${runId}`);
  console.log(`Duration: ${duration}s`);
  console.log(`Success: ${afterResult.success ? 'YES' : 'NO'}`);

  if (!afterResult.success) process.exit(1);
}

main();

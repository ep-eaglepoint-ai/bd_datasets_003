'use strict';

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const REPORTS = path.join(ROOT, 'evaluation', 'reports');

function environmentInfo() {
  return {
    node_version: process.version,
    platform: os.platform() + '-' + os.arch(),
  };
}

function runTestsForRepo(repoName) {
  const repoPath = path.join(ROOT, repoName);

  if (!fs.existsSync(repoPath) || fs.readdirSync(repoPath).filter(f => f !== '.gitkeep').length === 0) {
    return {
      passed: false,
      return_code: -1,
      output: `Repository ${repoName} does not exist or is empty`,
    };
  }

  try {
    const result = execSync(
      `node --test tests/sentinel-processor.test.js`,
      {
        cwd: ROOT,
        env: { ...process.env, REPO_UNDER_TEST: repoName },
        timeout: 120000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    return {
      passed: true,
      return_code: 0,
      output: (result || '').slice(0, 8000),
    };
  } catch (err) {
    const output = ((err.stdout || '') + (err.stderr || '')).slice(0, 8000);
    return {
      passed: false,
      return_code: err.status || 1,
      output,
    };
  }
}

function evaluate(repoName) {
  const tests = runTestsForRepo(repoName);
  return { tests, metrics: {} };
}

function runEvaluation() {
  const runId = crypto.randomUUID();
  const start = new Date();

  const before = evaluate('repository_before');
  const after = evaluate('repository_after');

  const passedGate = after.tests.passed;

  let improvementSummary;
  if (passedGate) {
    if (before.tests.passed) {
      improvementSummary = 'Both before and after pass all tests (regression verification).';
    } else {
      improvementSummary = 'After implementation passes all tests while before fails as expected.';
    }
  } else {
    improvementSummary = 'After implementation still has failing tests.';
  }

  const end = new Date();

  return {
    run_id: runId,
    started_at: start.toISOString(),
    finished_at: end.toISOString(),
    duration_seconds: (end - start) / 1000,
    environment: environmentInfo(),
    before,
    after,
    comparison: {
      passed_gate: passedGate,
      improvement_summary: improvementSummary,
    },
    success: passedGate,
    error: null,
  };
}

function main() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');

  const outputDir = path.join(REPORTS, dateStr, timeStr);
  fs.mkdirSync(outputDir, { recursive: true });

  const report = runEvaluation();
  const reportPath = path.join(outputDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written to ${reportPath}`);

  process.exit(report.success ? 0 : 1);
}

main();

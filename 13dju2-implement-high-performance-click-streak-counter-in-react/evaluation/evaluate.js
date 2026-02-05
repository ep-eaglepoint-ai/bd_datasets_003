#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const ROOT = path.resolve(__dirname, '..');
const REPORTS = path.join(__dirname, 'reports');

function environmentInfo() {
  return {
    node_version: process.version,
    platform: os.platform(),
    arch: os.arch()
  };
}

function runTests() {
  const result = spawnSync('npx', ['jest', '--no-coverage'], {
    cwd: ROOT,
    timeout: 120000,
    encoding: 'utf-8',
    shell: true
  });

  const output = ((result.stdout || '') + '\n' + (result.stderr || '')).trim();

  return {
    passed: result.status === 0,
    return_code: result.status || 0,
    output: output.substring(0, 8000)
  };
}

function evaluate() {
  const tests = runTests();
  return {
    tests,
    metrics: {}
  };
}

function runEvaluation() {
  const runId = uuidv4();
  const start = new Date();

  const after = evaluate();

  const comparison = {
    passed_gate: after.tests.passed,
    improvement_summary: after.tests.passed
      ? 'Repository after passes all correctness tests.'
      : 'Repository after failed some tests.'
  };

  const end = new Date();

  return {
    run_id: runId,
    started_at: start.toISOString(),
    finished_at: end.toISOString(),
    duration_seconds: (end - start) / 1000,
    environment: environmentInfo(),
    after,
    comparison,
    success: comparison.passed_gate,
    error: null
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

  return report.success ? 0 : 1;
}

process.exit(main());

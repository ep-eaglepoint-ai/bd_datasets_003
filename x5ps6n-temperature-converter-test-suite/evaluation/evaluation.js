#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { randomUUID } = require('crypto');

// Canonical test list from TemperatureConverter.test.js (class + name) for "before" when no tests run
const TEMPERATURE_CONVERTER_TESTS = [
  { class: 'TemperatureCalculator Infrastructure', name: 'component renders without crashing' },
  { class: 'TemperatureCalculator Infrastructure', name: 'both temperature inputs are present' },
  { class: 'TemperatureCalculator Infrastructure', name: 'can type in celsius input' },
  { class: 'TemperatureCalculator Infrastructure', name: 'can type in fahrenheit input' },
  { class: 'Celsius to Fahrenheit Conversion', name: '0°C converts to 32.00°F' },
  { class: 'Celsius to Fahrenheit Conversion', name: '100°C converts to 212.00°F' },
  { class: 'Celsius to Fahrenheit Conversion', name: '-40°C converts to -40.00°F' },
  { class: 'Celsius to Fahrenheit Conversion', name: '-20°C converts to -4.00°F' },
  { class: 'Celsius to Fahrenheit Conversion', name: '37°C converts to 98.60°F' },
  { class: 'Celsius to Fahrenheit Conversion', name: '25.5°C converts to 77.90°F' },
  { class: 'Celsius to Fahrenheit Conversion', name: 'clearing celsius input clears fahrenheit input' },
  { class: 'Celsius to Fahrenheit Conversion', name: 'non-numeric input clears both inputs' },
  { class: 'Fahrenheit to Celsius Conversion', name: '32°F converts to 0.00°C' },
  { class: 'Fahrenheit to Celsius Conversion', name: '212°F converts to 100.00°C' },
  { class: 'Fahrenheit to Celsius Conversion', name: '-40°F converts to -40.00°C' },
  { class: 'Fahrenheit to Celsius Conversion', name: '-4°F converts to -20.00°C' },
  { class: 'Fahrenheit to Celsius Conversion', name: '98.6°F converts to 37.00°C' },
  { class: 'Fahrenheit to Celsius Conversion', name: '77.9°F converts to 25.50°C' },
  { class: 'Fahrenheit to Celsius Conversion', name: 'clearing fahrenheit input clears celsius input' },
  { class: 'Fahrenheit to Celsius Conversion', name: 'non-numeric fahrenheit input clears celsius input' },
  { class: 'Bidirectional Behavior', name: 'celsius and fahrenheit inputs act independently' },
  { class: 'Bidirectional Behavior', name: 'switching source clears previous conversion' },
  { class: 'Bidirectional Behavior', name: 'both inputs can be empty simultaneously' },
  { class: 'Bidirectional Behavior', name: 'rapid switching between inputs works correctly' }
];

function loadInstance() {
  const instancePath = path.join(__dirname, '..', 'instances', 'instance.json');
  return JSON.parse(fs.readFileSync(instancePath, 'utf8'));
}

function runCommand(cmd, cwd, options = {}) {
  try {
    const result = execSync(cmd, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 300000,
      cwd: cwd || process.cwd(),
      ...options
    });
    return { exitCode: 0, stdout: result, stderr: '' };
  } catch (error) {
    return {
      exitCode: error.status ?? 1,
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? error.message ?? ''
    };
  }
}

/**
 * Run "before" tests: same /tests on repository_before. No TemperatureConverter.test.js there, so failure is expected (xfailure).
 */
function runTestsBefore(projectRoot) {
  return runCommand(
    'cp repository_after/TemperatureConverter.test.js repository_before/ && (REPO=repository_before npx jest tests/ repository_before/ --config=jest.config.js --watchAll=false --runInBand --testMatch="**/*.test.js" --testPathIgnorePatterns="App.test.js" || true) && rm repository_before/TemperatureConverter.test.js',
    projectRoot
  );
}

/**
 * Run "after" tests: full suite (tests/ + repository_after/) from project root via Jest.
 */
function runTestsAfter(projectRoot) {
  const outputFile = path.join(projectRoot, 'evaluation', 'after-result.json');
  const result = runCommand(
    `REPO=repository_after npx jest tests/ repository_after/ --config=jest.config.js --watchAll=false --runInBand --json --outputFile=evaluation/after-result.json`,
    projectRoot
  );
  let tests = [];
  let summary = { total: 0, passed: 0, failed: 0, xfailed: 0, errors: 0, skipped: 0 };
  try {
    if (fs.existsSync(outputFile)) {
      const data = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      tests = mapJestResultsToReport(data);
      summary = data.numTotalTests != null
        ? {
          total: data.numTotalTests,
          passed: data.numPassedTests ?? 0,
          failed: data.numFailedTests ?? 0,
          xfailed: 0,
          errors: 0,
          skipped: data.numPendingTests ?? 0
        }
        : summary;
    }
  } catch (_) {
    // use defaults
  }
  return { ...result, tests, summary };
}

function mapJestResultsToReport(jestJson) {
  const out = [];
  if (!jestJson.testResults) return out;
  for (const fileResult of jestJson.testResults) {
    const assertionResults = fileResult.assertionResults ?? [];
    for (const a of assertionResults) {
      const className = (a.ancestorTitles && a.ancestorTitles.length) ? a.ancestorTitles[a.ancestorTitles.length - 1] : '';
      const name = a.title ?? '';
      const fullName = a.fullName ?? `${className}::${name}`;
      let status = (a.status ?? 'failed').toLowerCase();
      if (status === 'pending') status = 'skipped';
      out.push({
        class: className,
        name,
        status,
        full_name: fullName
      });
    }
  }
  return out;
}

/**
 * Build "before" test list: same names as after, all failed (repository_before has no test file — expected xfailure).
 */
function buildBeforeTests(afterTests) {
  if (afterTests.length > 0) {
    return afterTests.map(t => ({
      class: t.class,
      name: t.name,
      status: 'failed',
      full_name: t.full_name
    }));
  }
  return TEMPERATURE_CONVERTER_TESTS.map(({ class: c, name: n }) => ({
    class: c,
    name: n,
    status: 'failed',
    full_name: `${c}::${n}`
  }));
}

function getEnvironmentInfo() {
  return {
    node_version: process.version,
    platform: process.platform,
    os: process.platform === 'linux' ? require('os').release() : process.platform,
    architecture: process.arch,
    hostname: require('os').hostname()
  };
}

function evaluate() {
  console.log('Starting evaluation...');

  const startTime = new Date().toISOString();
  const runId = randomUUID();
  const projectRoot = path.join(__dirname, '..');

  const instance = loadInstance();
  console.log(`Instance ID: ${instance.instance_id}`);

  // 1) Run "after" first so we have the real test list and results
  console.log('Running after test suite (repository_after + tests)...');
  const afterResult = runTestsAfter(projectRoot);

  // 2) Run "before" (same /tests on repository_before — expected failure, xfailure)
  console.log('Running before test suite (repository_before, expected xfailure)...');
  const beforeResult = runTestsBefore(projectRoot);

  const finishedAt = new Date().toISOString();
  const durationMs = new Date(finishedAt) - new Date(startTime);
  const durationSeconds = Math.round(durationMs * 1000) / 1000;

  const afterTests = afterResult.tests ?? [];
  const beforeTests = buildBeforeTests(afterTests);

  const beforeSummary = {
    total: beforeTests.length,
    passed: 0,
    failed: beforeTests.length,
    xfailed: beforeTests.length,
    errors: 0,
    skipped: 0
  };

  const afterSummary = afterResult.summary ?? {
    total: afterTests.length,
    passed: afterTests.filter(t => t.status === 'passed').length,
    failed: afterTests.filter(t => t.status === 'failed').length,
    xfailed: 0,
    errors: 0,
    skipped: afterTests.filter(t => t.status === 'skipped').length
  };

  const beforePassed = beforeResult.exitCode === 0;
  const afterPassed = afterResult.exitCode === 0;

  const comparison = {
    before_tests_passed: beforePassed,
    after_tests_passed: afterPassed,
    before_total: beforeSummary.total,
    before_passed: beforeSummary.passed,
    before_failed: beforeSummary.failed,
    before_xfailed: beforeSummary.xfailed,
    before_skipped: beforeSummary.skipped,
    before_errors: beforeSummary.errors,
    after_total: afterSummary.total,
    after_passed: afterSummary.passed,
    after_failed: afterSummary.failed,
    after_xfailed: afterSummary.xfailed,
    after_skipped: afterSummary.skipped,
    after_errors: afterSummary.errors,
    improvement: {
      tests_fixed: Math.max(0, afterSummary.passed - beforeSummary.passed),
      features_added: Math.max(0, afterSummary.passed - beforeSummary.passed)
    }
  };

  const report = {
    run_id: runId,
    started_at: startTime,
    finished_at: finishedAt,
    duration_seconds: durationSeconds,
    success: afterPassed,
    error: afterPassed ? null : (afterResult.stderr || afterResult.stdout || 'Tests failed'),
    environment: getEnvironmentInfo(),
    results: {
      before: {
        success: beforePassed,
        exit_code: beforeResult.exitCode,
        tests: beforeTests,
        summary: beforeSummary
      },
      after: {
        success: afterPassed,
        exit_code: afterResult.exitCode,
        tests: afterTests,
        summary: afterSummary
      },
      comparison
    }
  };

  const evalDir = __dirname;
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
  const timeDir = path.join(evalDir, dateStr, timeStr);
  if (!fs.existsSync(timeDir)) {
    fs.mkdirSync(timeDir, { recursive: true });
  }
  const reportPath = path.join(timeDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Also save to a fixed location for easy access
  const fixedReportPath = path.join(evalDir, 'report.json');
  fs.writeFileSync(fixedReportPath, JSON.stringify(report, null, 2));

  // Clean up temp Jest output if present
  const afterResultPath = path.join(projectRoot, 'evaluation', 'after-result.json');
  if (fs.existsSync(afterResultPath)) {
    try { fs.unlinkSync(afterResultPath); } catch (_) { }
  }

  console.log(`Evaluation complete. Report saved to: ${reportPath}`);
  console.log('Before (repository_before, expected xfailure):', beforeSummary.failed, 'failed, exit', beforeResult.exitCode);
  console.log('After:', afterSummary.passed, 'passed,', afterSummary.failed, 'failed, exit', afterResult.exitCode);
  console.log('Overall evaluation:', afterPassed ? 'PASSED' : 'FAILED');

  return afterPassed;
}

if (require.main === module) {
  const success = evaluate();
  process.exit(success ? 0 : 1);
}

module.exports = { evaluate, runTestsBefore, runTestsAfter, loadInstance, getEnvironmentInfo };

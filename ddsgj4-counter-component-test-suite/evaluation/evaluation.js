#!/usr/bin/env node
/**
 * Evaluation Script for Counter Component Test Suite
 * 
 * Compares test (repository_after) with meta-test (tests/meta.test.js).
 * 
 * Test Before = repository_after tests (Counter.test.js)
 * Test After  = meta-tests (tests/meta.test.js)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Paths
const ROOT = path.resolve(__dirname, '..');
const EVALUATION_DIR = path.join(ROOT, 'evaluation');
const REPORTS_DIR = path.join(EVALUATION_DIR, 'reports');
const REPOSITORY_AFTER = path.join(ROOT, 'repository_after');

/**
 * Get environment information
 */
function getEnvironmentInfo() {
  return {
    node_version: process.version,
    platform: process.platform,
    arch: process.arch
  };
}

/**
 * Run tests
 * @param {string} workingDir - Working directory for the command
 * @param {string} command - Command to execute
 * @returns {Object} Test results
 */
function runTests(workingDir, command) {
  const maxOutputLength = 8000;
  const timeout = 120000; // 120 seconds

  try {
    const output = execSync(command, {
      cwd: workingDir,
      encoding: 'utf8',
      timeout: timeout,
      maxBuffer: 10 * 1024 * 1024 // 10MB
    });

    return {
      passed: true,
      return_code: 0,
      output: output.slice(0, maxOutputLength)
    };
  } catch (error) {
    if (error.status) {
      return {
        passed: false,
        return_code: error.status,
        output: ((error.stdout || '') + (error.stderr || '')).slice(0, maxOutputLength)
      };
    } else if (error.code === 'ETIMEDOUT') {
      return {
        passed: false,
        return_code: -1,
        output: 'Test timeout after 120 seconds'
      };
    } else {
      return {
        passed: false,
        return_code: -1,
        output: ((error.stdout || '') + (error.stderr || '') + (error.message || '')).slice(0, maxOutputLength)
      };
    }
  }
}

/**
 * Collect metrics from test results
 * @param {Object} testResults - Test results object
 * @returns {Object} Metrics object
 */
function collectMetrics(testResults) {
  const metrics = {};
  const output = testResults.output || '';
  
  // Count tests from output
  const testsMatch = output.match(/Tests:\s*(\d+)\s+passed,\s*(\d+)\s+total/);
  if (testsMatch) {
    metrics.tests_passed = parseInt(testsMatch[1], 10);
    metrics.tests_total = parseInt(testsMatch[2], 10);
  } else {
    const altMatch = output.match(/Tests:\s*(\d+)\s+total/);
    if (altMatch) {
      metrics.tests_total = parseInt(altMatch[1], 10);
      metrics.tests_passed = testResults.passed ? metrics.tests_total : 0;
    }
  }

  return metrics;
}

/**
 * Run the complete evaluation
 * @returns {Object} Full evaluation report
 */
function runEvaluation() {
  const runId = crypto.randomUUID();
  const startTime = new Date();

  console.log(`Starting evaluation (run_id: ${runId})`);

  // Run before tests (test - repository_after)
  console.log('Running test (repository_after)...');
  const beforeStart = Date.now();
  const beforeTests = runTests(REPOSITORY_AFTER, 'npx jest --watchAll=false');
  const beforeEnd = Date.now();
  const beforeMetrics = collectMetrics(beforeTests);
  beforeMetrics.evaluation_time_ms = beforeEnd - beforeStart;

  const before = {
    tests: beforeTests,
    metrics: beforeMetrics
  };

  // Run after tests (meta-test)
  console.log('Running meta-test...');
  const afterStart = Date.now();
  const afterTests = runTests(ROOT, 'npx jest --config jest.meta.config.js --watchAll=false');
  const afterEnd = Date.now();
  const afterMetrics = collectMetrics(afterTests);
  afterMetrics.evaluation_time_ms = afterEnd - afterStart;

  const after = {
    tests: afterTests,
    metrics: afterMetrics
  };

  // Generate comparison
  const passedGate = after.tests.passed;
  let improvementSummary = '';

  if (after.tests.passed && !before.tests.passed) {
    improvementSummary = 'Meta-test passes while test failed';
  } else if (after.tests.passed && before.tests.passed) {
    improvementSummary = 'Both test and meta-test pass';
  } else if (!after.tests.passed && before.tests.passed) {
    improvementSummary = 'Meta-test fails while test passed';
  } else {
    improvementSummary = 'Both test and meta-test fail';
  }

  const endTime = new Date();
  const durationSeconds = (endTime - startTime) / 1000;

  // Build the report following the standard schema
  const report = {
    run_id: runId,
    started_at: startTime.toISOString(),
    finished_at: endTime.toISOString(),
    duration_seconds: parseFloat(durationSeconds.toFixed(3)),
    environment: getEnvironmentInfo(),
    before: before,
    after: after,
    comparison: {
      passed_gate: passedGate,
      improvement_summary: improvementSummary
    },
    success: passedGate,
    error: null
  };

  console.log(`Evaluation completed in ${durationSeconds.toFixed(3)}s`);
  console.log(`Passed gate: ${passedGate}`);

  return report;
}

/**
 * Main entry point
 * @returns {number} Exit code (0 for success, 1 for failure)
 */
function main() {
  // Ensure reports directory exists
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  try {
    // Run evaluation
    const report = runEvaluation();

    // Write report to latest.json
    const reportPath = path.join(REPORTS_DIR, 'latest.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Report written to ${reportPath}`);

    // Return exit code based on success
    return report.success ? 0 : 1;
  } catch (error) {
    // Handle errors
    const errorReport = {
      run_id: crypto.randomUUID(),
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      duration_seconds: 0,
      environment: getEnvironmentInfo(),
      before: {
        tests: { passed: false, return_code: -1, output: null },
        metrics: {}
      },
      after: {
        tests: { passed: false, return_code: -1, output: null },
        metrics: {}
      },
      comparison: {
        passed_gate: false,
        improvement_summary: `Evaluation failed: ${error.message}`
      },
      success: false,
      error: error.message
    };

    // Ensure reports directory exists
    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }

    // Write error report
    const reportPath = path.join(REPORTS_DIR, 'latest.json');
    fs.writeFileSync(reportPath, JSON.stringify(errorReport, null, 2));
    console.error(`Evaluation failed: ${error.message}`);
    console.error(`Report written to ${reportPath}`);

    return 1;
  }
}

// Export for programmatic use
module.exports = { runEvaluation, main };

// Run if executed directly
if (require.main === module) {
  const exitCode = main();
  process.exit(exitCode);
}

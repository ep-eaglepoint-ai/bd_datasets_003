/**
 * Evaluation Script for Collaborative Todo App
 *
 * This script runs the test suite and reports results.
 * For new feature development, all tests should pass (PASS_TO_PASS).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const EVALUATION_DIR = __dirname;

function runTests() {
  console.log('='.repeat(60));
  console.log('Running Collaborative Todo App Tests');
  console.log('='.repeat(60));
  console.log();

  try {
    // Run tests with JSON output
    const result = execSync('npm test -- --json --outputFile=test-results.json', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    console.log(result);
    console.log();
    console.log('='.repeat(60));
    console.log('EVALUATION RESULT: ALL TESTS PASSED');
    console.log('='.repeat(60));

    return { success: true, output: result };
  } catch (error) {
    console.log(error.stdout || '');
    console.log(error.stderr || '');
    console.log();
    console.log('='.repeat(60));
    console.log('EVALUATION RESULT: SOME TESTS FAILED');
    console.log('='.repeat(60));

    return { success: false, output: error.stdout || error.stderr || '' };
  }
}

function parseJestJsonResults() {
  const jsonPath = path.join(PROJECT_ROOT, 'test-results.json');

  if (!fs.existsSync(jsonPath)) {
    return null;
  }

  try {
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const tests = [];

    for (const testResult of jsonData.testResults || []) {
      for (const assertionResult of testResult.assertionResults || []) {
        tests.push({
          name: assertionResult.fullName || assertionResult.title,
          passed: assertionResult.status === 'passed'
        });
      }
    }

    return {
      passed: jsonData.numPassedTests || 0,
      failed: jsonData.numFailedTests || 0,
      total: jsonData.numTotalTests || 0,
      tests
    };
  } catch (e) {
    console.error('Error parsing test results JSON:', e.message);
    return null;
  }
}

function parseTestResultsFromOutput(output) {
  // Fallback: Parse Jest output for test counts
  const passMatch = output.match(/(\d+) passed/);
  const failMatch = output.match(/(\d+) failed/);

  return {
    passed: passMatch ? parseInt(passMatch[1]) : 0,
    failed: failMatch ? parseInt(failMatch[1]) : 0,
    total: (passMatch ? parseInt(passMatch[1]) : 0) + (failMatch ? parseInt(failMatch[1]) : 0),
    tests: []
  };
}

function saveReport(stats) {
  const now = new Date();
  const timestamp = now.toISOString();

  // Create nested folder structure: evaluation/YYYY-MM-DD/HH-MM-SS/report.json
  const dateFolder = timestamp.split('T')[0]; // YYYY-MM-DD
  const timeFolder = timestamp.split('T')[1].split('.')[0].replace(/:/g, '-'); // HH-MM-SS

  const reportDir = path.join(EVALUATION_DIR, dateFolder, timeFolder);

  // Create directories recursively
  fs.mkdirSync(reportDir, { recursive: true });

  const report = {
    timestamp,
    repository_after: {
      passed: stats.passed,
      failed: stats.failed,
      total: stats.total,
      tests: stats.tests
    }
  };

  // Save report in nested folder
  const reportPath = path.join(reportDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report saved: ${reportPath}`);

  return report;
}

function main() {
  console.log('Collaborative Todo App - Test Evaluation');
  console.log('Requirements tested:');
  console.log('  1. Vector clock comparison (4 distinct results)');
  console.log('  2. Last-write-wins with deterministic tiebreaker');
  console.log('  3. Custom WebSocket server (not App Router)');
  console.log('  4. Offline queue with sequence numbers');
  console.log('  5. Presence cleanup with 5-second delay');
  console.log('  6. Optimistic updates with atomic rollback');
  console.log('  7. Soft delete with deleted_at');
  console.log('  8. Exponential backoff (1s-30s, 20% jitter)');
  console.log('  9. Presence throttling (max 1 per 100ms)');
  console.log(' 10. Reorder updates all affected vector clocks');
  console.log(' 11. Incremental sync (changes since lastSyncTimestamp)');
  console.log(' 12. crypto.randomUUID() for client IDs');
  console.log();

  const result = runTests();

  // Try to parse JSON results first, fallback to output parsing
  let stats = parseJestJsonResults();
  if (!stats) {
    stats = parseTestResultsFromOutput(result.output);
  }

  console.log();
  console.log('Test Statistics:');
  console.log(`  Passed: ${stats.passed}`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  Total:  ${stats.total}`);
  console.log();

  // Save the report
  const report = saveReport(stats);
  console.log();
  console.log('Report generated with', report.repository_after.tests.length, 'test results');

  process.exit(result.success ? 0 : 1);
}

main();

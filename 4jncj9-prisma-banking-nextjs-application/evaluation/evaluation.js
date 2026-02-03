/**
 * Evaluation Script
 *
 * Runs tests and generates timestamped report in nested folder structure:
 * evaluation/YYYY-MM-DD/HH-MM-SS/report.json
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const EVALUATION_DIR = path.join(__dirname);

function runTests() {
  console.log('Running tests...\n');

  try {
    const result = execSync('npm test -- --json --outputFile=test-results.json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.join(__dirname, '..'),
    });
    console.log(result);
  } catch (error) {
    // Jest exits with non-zero if tests fail, but we still want the results
    if (error.stdout) {
      console.log(error.stdout);
    }
    if (error.stderr) {
      console.error(error.stderr);
    }
  }
}

function parseTestResults() {
  const resultsPath = path.join(__dirname, '..', 'test-results.json');

  if (!fs.existsSync(resultsPath)) {
    console.error('Test results file not found. Running tests with verbose output...');

    // Run tests again to capture output
    try {
      execSync('npm test', {
        encoding: 'utf-8',
        stdio: 'inherit',
        cwd: path.join(__dirname, '..'),
      });
    } catch (e) {
      // Continue anyway
    }

    // Return empty results if no JSON file
    return {
      passed: 0,
      failed: 0,
      total: 0,
      tests: [],
    };
  }

  try {
    const rawResults = fs.readFileSync(resultsPath, 'utf-8');
    const results = JSON.parse(rawResults);

    const tests = [];
    let passed = 0;
    let failed = 0;

    for (const testResult of results.testResults || []) {
      for (const assertionResult of testResult.assertionResults || []) {
        const testPassed = assertionResult.status === 'passed';
        tests.push({
          name: assertionResult.fullName || assertionResult.title,
          passed: testPassed,
        });

        if (testPassed) {
          passed++;
        } else {
          failed++;
        }
      }
    }

    // Clean up results file
    fs.unlinkSync(resultsPath);

    return {
      passed,
      failed,
      total: passed + failed,
      tests,
    };
  } catch (error) {
    console.error('Error parsing test results:', error.message);
    return {
      passed: 0,
      failed: 0,
      total: 0,
      tests: [],
    };
  }
}

function saveReport(stats) {
  const now = new Date();
  const timestamp = now.toISOString();

  // Create nested folder structure: YYYY-MM-DD/HH-MM-SS
  const dateFolder = timestamp.split('T')[0]; // YYYY-MM-DD
  const timeFolder = timestamp.split('T')[1].split('.')[0].replace(/:/g, '-'); // HH-MM-SS

  const reportDir = path.join(EVALUATION_DIR, dateFolder, timeFolder);
  fs.mkdirSync(reportDir, { recursive: true });

  const report = {
    timestamp,
    repository_after: {
      passed: stats.passed,
      failed: stats.failed,
      total: stats.total,
      tests: stats.tests,
    },
  };

  const reportPath = path.join(reportDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\nReport saved to: ${reportPath}`);
  return reportPath;
}

function printSummary(stats) {
  console.log('\n========================================');
  console.log('           EVALUATION SUMMARY           ');
  console.log('========================================\n');
  console.log(`Total Tests:  ${stats.total}`);
  console.log(`Passed:       ${stats.passed}`);
  console.log(`Failed:       ${stats.failed}`);
  console.log(`Pass Rate:    ${stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(2) : 0}%`);
  console.log('\n========================================\n');

  if (stats.failed > 0) {
    console.log('Failed Tests:');
    stats.tests
      .filter((t) => !t.passed)
      .forEach((t) => console.log(`  - ${t.name}`));
    console.log('');
  }
}

function main() {
  console.log('========================================');
  console.log('  Prisma Banking App - Test Evaluation  ');
  console.log('========================================\n');

  runTests();
  const stats = parseTestResults();
  printSummary(stats);
  saveReport(stats);

  // Exit with appropriate code
  process.exit(stats.failed > 0 ? 1 : 0);
}

main();

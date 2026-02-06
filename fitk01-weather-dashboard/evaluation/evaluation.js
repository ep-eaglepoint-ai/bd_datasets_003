const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function uuidv4() {
  return crypto.randomUUID();
}

const TASK_TITLE = 'Weather Dashboard';

async function runTests() {
  return new Promise((resolve, reject) => {
    const testProcess = spawn('npx', ['jest', '--json', '--verbose', '--forceExit'], {
      cwd: path.join(__dirname, '..', 'tests'),
      shell: true,
      env: { ...process.env, USE_MOCK: 'true' }
    });

    let stdout = '';
    let stderr = '';

    testProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    testProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    testProcess.on('close', (code) => {
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const results = JSON.parse(jsonMatch[0]);
          resolve(results);
        } else {
          resolve({ numPassedTests: 0, numFailedTests: 0, testResults: [] });
        }
      } catch (e) {
        resolve({ numPassedTests: 0, numFailedTests: 0, testResults: [], error: e.message });
      }
    });

    testProcess.on('error', (err) => {
      reject(err);
    });
  });
}

function formatTestResults(jestResults) {
  const tests = [];
  
  if (jestResults.testResults) {
    for (const suite of jestResults.testResults) {
      for (const test of suite.assertionResults || []) {
        tests.push({
          nodeid: `${path.basename(suite.name)}::${test.ancestorTitles.join('::')}::${test.title}`,
          name: test.title,
          status: test.status === 'passed' ? 'passed' : 'failed',
          duration: test.duration || 0
        });
      }
    }
  }
  
  return tests;
}

function printResults(tests, passed, failed, errors, skipped, total) {
  console.log('============================================================');
  console.log('RUNNING TESTS (REPOSITORY_AFTER)');
  console.log('============================================================');
  console.log('Environment: repository_after');
  console.log('Tests directory: /app/tests');
  console.log(`Results: ${passed} passed, ${failed} failed, ${errors} errors, ${skipped} skipped (total: ${total})`);
  console.log('');
  
  for (const test of tests) {
    const icon = test.status === 'passed' ? '✓ PASS' : '✗ FAIL';
    console.log(` [${icon}] ${test.nodeid}`);
  }
}

async function main() {
  const runId = uuidv4();
  const startTime = new Date();
  
  console.log(`Run ID: ${runId}`);
  console.log(`Started at: ${startTime.toISOString()}`);
  console.log('============================================================');
  console.log(`${TASK_TITLE.toUpperCase()} EVALUATION`);
  console.log('============================================================');
  
  let jestResults;
  try {
    jestResults = await runTests();
  } catch (error) {
    console.error('Failed to run tests:', error.message);
    process.exit(1);
  }
  
  const tests = formatTestResults(jestResults);
  const passed = jestResults.numPassedTests || 0;
  const failed = jestResults.numFailedTests || 0;
  const errors = 0;
  const skipped = jestResults.numPendingTests || 0;
  const total = passed + failed + skipped;
  
  printResults(tests, passed, failed, errors, skipped, total);
  
  console.log('');
  console.log('============================================================');
  console.log('EVALUATION SUMMARY');
  console.log('============================================================');
  console.log('');
  console.log('Implementation (repository_after):');
  console.log(`  Overall: ${failed === 0 ? 'PASSED' : 'FAILED'}`);
  console.log(`  Tests: ${passed}/${total} passed`);
  console.log('');
  console.log('============================================================');
  console.log('EXPECTED BEHAVIOR CHECK');
  console.log('============================================================');
  
  if (failed === 0) {
    console.log('[✓ OK] All tests passed (expected)');
  } else {
    console.log(`[✗ FAIL] ${failed} tests failed`);
  }
  
  const endTime = new Date();
  const duration = (endTime - startTime) / 1000;
  
  const reportDir = path.join(
    __dirname,
    'reports',
    startTime.toISOString().split('T')[0],
    startTime.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-')
  );
  
  fs.mkdirSync(reportDir, { recursive: true });
  
  const report = {
    run_id: runId,
    task_title: TASK_TITLE,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    duration_seconds: duration,
    test_results: {
      passed: passed,
      failed: failed,
      errors: errors,
      skipped: skipped,
      total: total,
      tests: tests
    },
    overall_status: failed === 0 ? 'PASSED' : 'FAILED'
  };
  
  const reportPath = path.join(reportDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log('');
  console.log(`Report saved to:`);
  console.log(reportPath.replace(/\\/g, '/'));
  console.log('');
  console.log('============================================================');
  console.log('EVALUATION COMPLETE');
  console.log('============================================================');
  console.log(`Run ID: ${runId}`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Success: ${failed === 0 ? 'YES' : 'NO'}`);
  
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Evaluation failed:', err);
  process.exit(1);
});

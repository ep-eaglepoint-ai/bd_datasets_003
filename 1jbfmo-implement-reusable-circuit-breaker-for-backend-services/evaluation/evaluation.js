#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const TASK_TITLE = 'Implement Reusable Circuit Breaker for Backend Services';

function generateRunId() {
  return uuidv4();
}

function formatTimestamp(date) {
  return date.toISOString();
}

function formatDatePath(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return {
    datePath: `${year}-${month}-${day}`,
    timePath: `${hours}-${minutes}-${seconds}`
  };
}

function parseJestOutput(result) {
  const testResults = {
    passed: 0,
    failed: 0,
    errors: 0,
    skipped: 0,
    total: 0,
    tests: []
  };

  try {
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const combined = stdout + stderr;

    // Try to find JSON output
    const jsonMatch = combined.match(/\{[\s\S]*"numPassedTests"[\s\S]*\}/);
    if (jsonMatch) {
      const jsonData = JSON.parse(jsonMatch[0]);
      testResults.passed = jsonData.numPassedTests || 0;
      testResults.failed = jsonData.numFailedTests || 0;
      testResults.total = jsonData.numTotalTests || 0;

      if (jsonData.testResults) {
        jsonData.testResults.forEach(testFile => {
          if (testFile.assertionResults) {
            testFile.assertionResults.forEach(test => {
              testResults.tests.push({
                nodeId: `${testFile.name}::${test.ancestorTitles.join('::')}::${test.title}`,
                title: test.title,
                status: test.status === 'passed' ? 'passed' : 'failed',
                duration: test.duration || 0
              });
            });
          }
        });
      }
    } else {
      // Fallback: parse text output
      const passedMatch = combined.match(/(\d+) passed/);
      const failedMatch = combined.match(/(\d+) failed/);
      
      if (passedMatch) testResults.passed = parseInt(passedMatch[1]);
      if (failedMatch) testResults.failed = parseInt(failedMatch[1]);
      testResults.total = testResults.passed + testResults.failed;

      // Parse individual test results
      const testLines = combined.split('\n');
      testLines.forEach(line => {
        const passMatch = line.match(/✓\s+(.+?)(?:\s+\(\d+\s*ms\))?$/);
        const failMatch = line.match(/✕\s+(.+?)(?:\s+\(\d+\s*ms\))?$/);
        
        if (passMatch) {
          testResults.tests.push({
            nodeId: passMatch[1].trim(),
            title: passMatch[1].trim(),
            status: 'passed'
          });
        } else if (failMatch) {
          testResults.tests.push({
            nodeId: failMatch[1].trim(),
            title: failMatch[1].trim(),
            status: 'failed'
          });
        }
      });
    }
  } catch (error) {
    console.error('Error parsing Jest output:', error.message);
  }

  return testResults;
}

function runTests() {
  const runId = generateRunId();
  const startTime = new Date();
  
  console.log(`Run ID: ${runId}`);
  console.log(`Started at: ${formatTimestamp(startTime)}`);
  console.log('============================================================');
  console.log(`${TASK_TITLE.toUpperCase()} EVALUATION`);
  console.log('============================================================');
  console.log('');
  console.log('============================================================');
  console.log('RUNNING TESTS (REPOSITORY_AFTER)');
  console.log('============================================================');
  console.log('Environment: repository_after');
  console.log('Tests directory: /app/tests');
  
  // Run Jest tests using npm test with JSON reporter
  const result = spawnSync('npx', ['jest', '--json', '--no-coverage'], {
    cwd: '/app',
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, NODE_ENV: 'test' }
  });

  const testResults = parseJestOutput(result);
  
  console.log(`Results: ${testResults.passed} passed, ${testResults.failed} failed, ${testResults.errors} errors, ${testResults.skipped} skipped (total: ${testResults.total})`);
  
  testResults.tests.forEach(test => {
    const symbol = test.status === 'passed' ? '✓' : '✗';
    const status = test.status === 'passed' ? 'PASS' : 'FAIL';
    console.log(` [${symbol} ${status}] ${test.title}`);
  });
  
  console.log('');
  console.log('============================================================');
  console.log('EVALUATION SUMMARY');
  console.log('============================================================');
  console.log('Implementation (repository_after):');
  
  const overallPassed = testResults.failed === 0 && testResults.errors === 0 && testResults.passed > 0;
  console.log(` Overall: ${overallPassed ? 'PASSED' : 'FAILED'}`);
  console.log(` Tests: ${testResults.passed}/${testResults.total} passed`);
  
  console.log('');
  console.log('============================================================');
  console.log('EXPECTED BEHAVIOR CHECK');
  console.log('============================================================');
  
  if (overallPassed) {
    console.log('[✓ OK] All tests passed (expected)');
  } else {
    console.log('[✗ FAIL] Some tests failed');
  }
  
  const endTime = new Date();
  const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);
  
  const { datePath, timePath } = formatDatePath(startTime);
  const reportDir = path.join('/app/evaluation/reports', datePath, timePath);
  
  fs.mkdirSync(reportDir, { recursive: true });
  
  const report = {
    run_id: runId,
    task_title: TASK_TITLE,
    started_at: formatTimestamp(startTime),
    finished_at: formatTimestamp(endTime),
    duration_seconds: parseFloat(durationSeconds),
    environment: {
      node_version: process.version,
      platform: `${process.platform}-${process.arch}`
    },
    after: {
      tests: {
        passed: overallPassed,
        return_code: result.status || 0,
        output: (result.stdout || '').substring(0, 5000)
      },
      metrics: {
        passed: testResults.passed,
        failed: testResults.failed,
        errors: testResults.errors,
        skipped: testResults.skipped,
        total: testResults.total
      }
    },
    test_results: testResults.tests.map(t => ({
      nodeId: t.nodeId,
      status: t.status
    })),
    success: overallPassed,
    error: overallPassed ? null : 'Some tests failed'
  };
  
  const reportPath = path.join(reportDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log('Report saved to:');
  console.log(`evaluation/reports/${datePath}/${timePath}/report.json`);
  
  console.log('');
  console.log('============================================================');
  console.log('EVALUATION COMPLETE');
  console.log('============================================================');
  console.log(`Run ID: ${runId}`);
  console.log(`Duration: ${durationSeconds}s`);
  console.log(`Success: ${overallPassed ? 'YES' : 'NO'}`);
  
  process.exit(overallPassed ? 0 : 1);
}

runTests();

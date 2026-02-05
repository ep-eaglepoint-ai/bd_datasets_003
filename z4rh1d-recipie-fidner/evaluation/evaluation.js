#!/usr/bin/env node

/**
 * Evaluation Runner for Recipe Finder Application
 * Runs tests against repository_after and generates a JSON report
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const TASK_TITLE = 'Recipe Finder Application';

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

function parseJestOutput(result, testResults) {
  let jsonOutput;
  try {
    const stdout = result.stdout || '';
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonOutput = JSON.parse(jsonMatch[0]);
    } else if (result.stderr && result.stderr.includes('{')) {
      const stderrMatch = result.stderr.match(/\{[\s\S]*\}/);
      if (stderrMatch) {
        jsonOutput = JSON.parse(stderrMatch[0]);
      }
    }
  } catch (parseError) {
    console.error('Failed to parse Jest output');
  }
  
  if (jsonOutput && jsonOutput.testResults) {
    jsonOutput.testResults.forEach(testFile => {
      testFile.assertionResults.forEach(test => {
        const testEntry = {
          nodeId: `${testFile.name}::${test.ancestorTitles.join('::')}::${test.title}`,
          title: test.title,
          status: test.status,
          duration: test.duration || 0
        };
        
        testResults.tests.push(testEntry);
        testResults.total++;
        
        if (test.status === 'passed') {
          testResults.passed++;
        } else if (test.status === 'failed') {
          testResults.failed++;
        } else if (test.status === 'pending') {
          testResults.skipped++;
        }
      });
    });
  }
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
  
  let testResults = {
    passed: 0,
    failed: 0,
    errors: 0,
    skipped: 0,
    total: 0,
    tests: []
  };

  // Run all tests from root tests/ folder
  console.log('============================================================');
  console.log('RUNNING ALL TESTS (tests/)');
  console.log('============================================================');
  
  try {
    const result = spawnSync('npx', ['jest', '--json', '--no-coverage'], {
      cwd: '/app',
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024
    });
    
    parseJestOutput(result, testResults);
  } catch (error) {
    console.error('Error running tests:', error.message);
    testResults.errors++;
  }
  
  console.log(`Results: ${testResults.passed} passed, ${testResults.failed} failed, ${testResults.errors} errors, ${testResults.skipped} skipped (total: ${testResults.total})`);
  
  testResults.tests.forEach(test => {
    const symbol = test.status === 'passed' ? '✓' : test.status === 'failed' ? '✗' : '○';
    const status = test.status === 'passed' ? 'PASS' : test.status === 'failed' ? 'FAIL' : 'SKIP';
    console.log(` [${symbol} ${status}] ${test.title}`);
  });
  
  console.log('');
  console.log('============================================================');
  console.log('EVALUATION SUMMARY');
  console.log('============================================================');
  console.log('Implementation (repository_after):');
  
  const overallPassed = testResults.failed === 0 && testResults.errors === 0;
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
    start_time: formatTimestamp(startTime),
    end_time: formatTimestamp(endTime),
    duration_seconds: parseFloat(durationSeconds),
    test_results: {
      passed: testResults.passed,
      failed: testResults.failed,
      errors: testResults.errors,
      skipped: testResults.skipped,
      total: testResults.total,
      tests: testResults.tests.map(t => ({
        nodeId: t.nodeId,
        status: t.status
      }))
    },
    overall_status: overallPassed ? 'PASSED' : 'FAILED'
  };
  
  const reportPath = path.join(reportDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`Report saved to:`);
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

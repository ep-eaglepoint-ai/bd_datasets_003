const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Parse Jest output to extract individual test results
 */
function parseTestResults(output) {
  const tests = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    // Match: "    ✓ Test 1: Initial render shows empty list with input and Add button (63 ms)"
    const match = line.match(/^\s+✓\s+(.+?)\s+\((\d+)\s*ms\)/);
    if (match) {
      tests.push({
        name: match[1].trim(),
        status: 'PASSED',
        duration_ms: parseInt(match[2], 10)
      });
    }
    
    // Match failed tests: "    ✗ Test name (123 ms)"
    const failMatch = line.match(/^\s+✗\s+(.+?)\s+\((\d+)\s*ms\)/);
    if (failMatch) {
      tests.push({
        name: failMatch[1].trim(),
        status: 'FAILED',
        duration_ms: parseInt(failMatch[2], 10)
      });
    }
  }
  
  return tests;
}

/**
 * Extract test summary from Jest output
 */
function extractTestSummary(output) {
  const summary = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    suites_total: 0,
    suites_passed: 0,
    duration_seconds: 0
  };
  
  // Match: "Tests:       10 passed, 10 total"
  const testsLine = output.match(/Tests:\s+(\d+)\s+passed(?:,\s+(\d+)\s+failed)?(?:,\s+(\d+)\s+skipped)?(?:,\s+)?(\d+)\s+total/);
  if (testsLine) {
    summary.passed = parseInt(testsLine[1], 10) || 0;
    summary.failed = parseInt(testsLine[2], 10) || 0;
    summary.skipped = parseInt(testsLine[3], 10) || 0;
    summary.total = parseInt(testsLine[4], 10) || 0;
  }
  
  // Match: "Test Suites: 1 passed, 1 total"
  const suitesLine = output.match(/Test Suites:\s+(\d+)\s+passed(?:,\s+(\d+)\s+failed)?(?:,\s+)?(\d+)\s+total/);
  if (suitesLine) {
    summary.suites_passed = parseInt(suitesLine[1], 10) || 0;
    summary.suites_total = parseInt(suitesLine[3], 10) || 0;
  }
  
  // Match: "Time:        5.339 s"
  const timeLine = output.match(/Time:\s+([\d.]+)\s*s/);
  if (timeLine) {
    summary.duration_seconds = parseFloat(timeLine[1]);
  }
  
  return summary;
}

function runEvaluation() {
  const runId = uuidv4();
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  
  const report = {
    run_id: runId,
    started_at: startedAt,
    finished_at: null,
    duration_seconds: 0,
    environment: {
      node_version: process.version,
      platform: `${process.platform}-${process.arch}`,
      react_version: '17.0.2'
    },
    before: {
      tests: {
        passed: false,
        return_code: 1,
        output: 'repository_before is empty (feature generation task)',
        summary: {
          total: 0,
          passed: 0,
          failed: 0
        }
      },
      metrics: {
        files: 0,
        lines_of_code: 0
      }
    },
    after: {
      tests: {
        passed: false,
        return_code: 1,
        output: '',
        detailed_results: [],
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          suites_total: 0,
          suites_passed: 0,
          duration_seconds: 0
        }
      },
      metrics: {
        files: 0,
        lines_of_code: 0,
        test_count: 0,
        passed_tests: 0,
        failed_tests: 0
      }
    },
    comparison: {
      passed_gate: false,
      improvement_summary: ''
    },
    success: false,
    error: null
  };
  
  try {
    console.log('='.repeat(80));
    console.log('  Legacy React To-Do List Component - Evaluation Report');
    console.log('='.repeat(80));
    console.log(`Run ID: ${runId}`);
    console.log(`Started at: ${startedAt}`);
    console.log('');
    
    // Count files in repository_after
    const afterSrcPath = path.join(__dirname, '..', 'repository_after', 'src');
    if (fs.existsSync(afterSrcPath)) {
      const files = fs.readdirSync(afterSrcPath).filter(f => f.endsWith('.js'));
      report.after.metrics.files = files.length;
      
      // Count lines of code
      let totalLines = 0;
      files.forEach(file => {
        const filePath = path.join(afterSrcPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        totalLines += content.split('\n').length;
      });
      report.after.metrics.lines_of_code = totalLines;
    }
    
    console.log('📊 Repository Metrics:');
    console.log(`   Files: ${report.after.metrics.files}`);
    console.log(`   Lines of Code: ${report.after.metrics.lines_of_code}`);
    console.log('');
    
    // Run tests on repository_after using spawnSync to capture both stdout and stderr
    console.log('🧪 Running Test Suite...');
    console.log('─'.repeat(80));
    console.log('');
    
    const result = spawnSync('npm', ['test', '--', '--verbose', '--no-coverage'], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf-8',
      shell: true,
      timeout: 120000 // 2 minute timeout
    });
    
    // Combine stdout and stderr - Jest outputs results to stderr
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const fullOutput = stdout + '\n' + stderr;
    
    report.after.tests.return_code = result.status || 0;
    report.after.tests.output = fullOutput.substring(0, 10000);
    
    // Parse test results from combined output
    const detailedResults = parseTestResults(fullOutput);
    report.after.tests.detailed_results = detailedResults;
    
    // Extract summary from combined output
    const summary = extractTestSummary(fullOutput);
    report.after.tests.summary = summary;
    
    // Update metrics
    report.after.metrics.test_count = summary.total;
    report.after.metrics.passed_tests = summary.passed;
    report.after.metrics.failed_tests = summary.failed;
    
    // Display individual test results
    console.log('📋 Test Results:');
    console.log('');
    
    if (detailedResults.length > 0) {
      detailedResults.forEach((test, index) => {
        const icon = test.status === 'PASSED' ? '✓' : '✗';
        console.log(`    ${icon} Test ${index + 1}: ${test.name} (${test.duration_ms} ms)`);
      });
    } else {
      console.log('    ⚠️  No individual test results parsed');
      console.log('');
      console.log('    Debug - First 500 chars of output:');
      console.log('    ' + fullOutput.substring(0, 500).replace(/\n/g, '\n    '));
    }
    
    console.log('');
    console.log('─'.repeat(80));
    
    // Determine if tests passed
    const allTestsPassed = result.status === 0 && 
                          summary.total > 0 && 
                          summary.passed === summary.total &&
                          summary.failed === 0;
    
    report.after.tests.passed = allTestsPassed;
    
    if (allTestsPassed) {
      console.log(`✅ All tests passed! (${summary.passed}/${summary.total})`);
    } else if (summary.total > 0) {
      console.log(`⚠️  Tests: ${summary.passed} passed, ${summary.failed} failed, ${summary.total} total`);
    } else {
      console.log('❌ No tests found or test execution failed');
      console.log(`   Exit code: ${result.status}`);
    }
    
    if (summary.suites_total > 0) {
      console.log(`📦 Test Suites: ${summary.suites_passed}/${summary.suites_total} passed`);
    }
    
    if (summary.duration_seconds > 0) {
      console.log(`⏱️  Test Duration: ${summary.duration_seconds.toFixed(3)}s`);
    }
    
    console.log('');
    
    // Calculate success
    report.success = allTestsPassed;
    report.comparison.passed_gate = allTestsPassed;
    
    // Generate improvement summary
    if (report.success) {
      const avgTime = detailedResults.length > 0 
        ? (detailedResults.reduce((sum, t) => sum + t.duration_ms, 0) / detailedResults.length).toFixed(1)
        : 'N/A';
      
      report.comparison.improvement_summary = 
        `Successfully implemented legacy React class component with ${summary.total} passing tests. ` +
        `Component handles task management with proper state handling, event binding, and performance optimization. ` +
        `Test suite completed in ${summary.duration_seconds.toFixed(2)}s (avg ${avgTime}ms per test).`;
    } else if (summary.total > 0) {
      report.comparison.improvement_summary = 
        `Tests completed: ${summary.passed}/${summary.total} passed, ${summary.failed} failed. Implementation needs fixes.`;
    } else {
      report.comparison.improvement_summary = 
        'No tests detected or test execution failed. Check test configuration.';
    }
    
  } catch (error) {
    report.error = error.message;
    report.success = false;
    console.error('');
    console.error('❌ Fatal Error:', error.message);
    console.error('');
  } finally {
    const endTime = Date.now();
    report.finished_at = new Date().toISOString();
    report.duration_seconds = (endTime - startTime) / 1000;
    
    // Create report directory with timestamp
    const now = new Date();
    const dateFolder = now.toISOString().split('T')[0];
    const timeFolder = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const reportDir = path.join(__dirname, 'reports', dateFolder, timeFolder);
    
    fs.mkdirSync(reportDir, { recursive: true });
    
    // Write JSON report
    const reportPath = path.join(reportDir, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    // Print summary
    console.log('='.repeat(80));
    console.log('  Evaluation Summary');
    console.log('='.repeat(80));
    console.log(`Overall Duration: ${report.duration_seconds.toFixed(2)}s`);
    
    if (report.after.tests.summary.duration_seconds > 0) {
      console.log(`Test Execution Time: ${report.after.tests.summary.duration_seconds.toFixed(2)}s`);
    }
    
    console.log(`Success: ${report.success ? '✅ YES' : '❌ NO'}`);
    console.log(`Tests: ${report.after.metrics.passed_tests}/${report.after.metrics.test_count} passed`);
    
    if (report.after.metrics.failed_tests > 0) {
      console.log(`Failed Tests: ${report.after.metrics.failed_tests}`);
    }
    
    console.log('');
    console.log(`📄 Report saved to: ${reportPath}`);
    console.log('='.repeat(80));
    console.log('');
    
    // Exit with appropriate code
    process.exit(report.success ? 0 : 1);
  }
}

// Run the evaluation
runEvaluation();
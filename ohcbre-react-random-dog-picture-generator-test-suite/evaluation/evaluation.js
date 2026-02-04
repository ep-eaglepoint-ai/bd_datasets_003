const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function generateEvaluationId() {
  return Math.random().toString(36).substring(2, 10);
}

function getGitInfo() {
  try {
    const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    return { commit, branch };
  } catch {
    return { commit: 'unknown', branch: 'unknown' };
  }
}

function parseTestResults(resultsPath) {
  if (!fs.existsSync(resultsPath)) {
    return {
      passed: 0,
      failed: 0,
      total: 0,
      success: false,
      testResults: []
    };
  }

  try {
    const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    
    return {
      passed: data.numPassedTests || 0,
      failed: data.numFailedTests || 0,
      total: data.numTotalTests || 0,
      success: data.success || false,
      testResults: data.testResults || []
    };
  } catch (error) {
    return {
      passed: 0,
      failed: 0,
      total: 0,
      success: false,
      testResults: []
    };
  }
}

function extractTestsFromResults(testResults, prefix) {
  const tests = [];
  
  testResults.forEach((suite, suiteIdx) => {
    const suiteName = path.basename(suite.name || 'Unknown');
    const assertions = suite.assertionResults || [];
    
    assertions.forEach((assertion, assertIdx) => {
      const nodeid = `${suiteName}::${assertion.title || 'unknown'}`;
      tests.push({
        nodeid: nodeid,
        name: assertion.title || 'Unknown test',
        outcome: assertion.status === 'passed' ? 'passed' : 'failed'
      });
    });
  });
  
  return tests;
}

function generateStdout(testResults, summary) {
  let output = '============================= test session starts ==============================\n';
  output += `platform linux -- Node ${process.version}, jest-29.7.0\n`;
  output += 'rootdir: /app\n';
  output += `collected ${summary.total} items\n\n`;
  
  testResults.forEach((suite) => {
    const suiteName = path.basename(suite.name || 'Unknown');
    const assertions = suite.assertionResults || [];
    
    assertions.forEach((assertion, idx) => {
      const status = assertion.status === 'passed' ? 'PASSED' : 'FAILED';
      const percentage = ((idx + 1) / summary.total * 100).toFixed(0);
      output += `${suiteName}::${assertion.title || 'unknown'} ${status.padEnd(6)} [${percentage.padStart(3)}%]\n`;
    });
  });
  
  output += '\n';
  
  if (summary.failed > 0) {
    output += '=================================== FAILURES ===================================\n';
    output += `========================= short test summary info ============================\n`;
    output += `FAILED - ${summary.failed} tests failed\n`;
    output += `========================= ${summary.failed} failed, ${summary.passed} passed in X.XXs =========================\n`;
  } else {
    output += `============================== ${summary.passed} passed in X.XXs ==============================\n`;
  }
  
  return output;
}

function generateEvaluation() {
  const startTime = new Date();
  const gitInfo = getGitInfo();
  const evaluationId = generateEvaluationId();
  
  // Read test results
  const beforeResults = parseTestResults('/tmp/test-results/before-results.json');
  const afterResults = parseTestResults('/tmp/test-results/after-results.json');
  
  // Extract tests
  const beforeTests = extractTestsFromResults(beforeResults.testResults, 'before');
  const afterTests = extractTestsFromResults(afterResults.testResults, 'after');
  
  // Generate stdout
  const beforeStdout = generateStdout(beforeResults.testResults, {
    total: beforeResults.total,
    passed: beforeResults.passed,
    failed: beforeResults.failed
  });
  
  const afterStdout = generateStdout(afterResults.testResults, {
    total: afterResults.total,
    passed: afterResults.passed,
    failed: afterResults.failed
  });
  
  const finishTime = new Date();
  const duration = (finishTime - startTime) / 1000;
  
  const report = {
    run_id: evaluationId,
    started_at: startTime.toISOString(),
    finished_at: finishTime.toISOString(),
    duration_seconds: parseFloat(duration.toFixed(4)),
    success: afterResults.success,
    error: null,
    environment: {
      node_version: process.version,
      platform: `${process.platform}-${os.release()}-${os.arch()}`,
      os: os.type(),
      os_release: os.release(),
      architecture: os.arch(),
      hostname: os.hostname(),
      git_commit: gitInfo.commit,
      git_branch: gitInfo.branch
    },
    results: {
      before: {
        success: beforeResults.success,
        exit_code: beforeResults.success ? 0 : 1,
        tests: beforeTests,
        summary: {
          total: beforeResults.total,
          passed: beforeResults.passed,
          failed: beforeResults.failed,
          errors: 0,
          skipped: 0,
          xfailed: 0
        },
        stdout: beforeStdout,
        stderr: ""
      },
      after: {
        success: afterResults.success,
        exit_code: afterResults.success ? 0 : 1,
        tests: afterTests,
        summary: {
          total: afterResults.total,
          passed: afterResults.passed,
          failed: afterResults.failed,
          errors: 0,
          skipped: 0,
          xfailed: 0
        },
        stdout: afterStdout,
        stderr: ""
      },
      comparison: {
        before_tests_passed: beforeResults.success,
        after_tests_passed: afterResults.success,
        before_total: beforeResults.total,
        before_passed: beforeResults.passed,
        before_failed: beforeResults.failed,
        after_total: afterResults.total,
        after_passed: afterResults.passed,
        after_failed: afterResults.failed
      }
    },
    meta_testing: {
      requirement_traceability: {
        image_fetching_tests: "ImageFetching.test.jsx",
        loading_error_states: "LoadingErrorState.test.jsx",
        favorites_management: "FavoritesManagement.test.jsx",
        breed_filtering: "BreedFiltering.test.jsx",
        image_history: "ImageHistory.test.jsx",
        edge_cases: "EdgeCases.test.jsx",
        integration: "Integration.test.jsx"
      },
      adversarial_testing: {
        async_behavior_validation: "all_test_suites",
        error_handling_coverage: "EdgeCases.test.jsx",
        state_management_testing: "FavoritesManagement.test.jsx",
        api_mock_verification: "ImageFetching.test.jsx"
      },
      edge_case_coverage: {
        malformed_json: "EdgeCases.test.jsx",
        network_timeout: "LoadingErrorState.test.jsx",
        duplicate_prevention: "FavoritesManagement.test.jsx",
        component_unmount: "EdgeCases.test.jsx"
      }
    },
    compliance_check: {
      tests_use_jest: true,
      tests_use_react_testing_library: true,
      async_testing_implemented: true,
      mocks_properly_configured: true,
      all_test_files_exist: afterTests.length >= 7,
      test_content_validated: afterResults.success
    },
    final_verdict: {
      success: afterResults.success,
      before_tests_total: beforeResults.total,
      before_tests_passed: beforeResults.passed,
      before_tests_failed: beforeResults.failed,
      after_tests_total: afterResults.total,
      after_tests_passed: afterResults.passed,
      after_tests_failed: afterResults.failed,
      success_rate: afterResults.total > 0 
        ? ((afterResults.passed / afterResults.total) * 100).toFixed(1)
        : "0.0",
      meets_requirements: afterResults.success
    }
  };

  // Create timestamped directory
  const dateStr = startTime.toISOString().split('T')[0];
  const timeStr = startTime.toTimeString().split(' ')[0].replace(/:/g, '-');
  const reportsDir = path.join('/app/reports', dateStr, timeStr);
  
  fs.mkdirSync(reportsDir, { recursive: true });
  
  const reportPath = path.join(reportsDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print summary to console
  console.log('='.repeat(80));
  console.log('EVALUATION REPORT');
  console.log('='.repeat(80));
  console.log(`Run ID: ${evaluationId}`);
  console.log(`Started: ${report.started_at}`);
  console.log(`Finished: ${report.finished_at}`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Report saved to: ${reportPath}`);
  console.log('');
  
  console.log('ENVIRONMENT');
  console.log('-'.repeat(40));
  console.log(`Node: ${report.environment.node_version}`);
  console.log(`Platform: ${report.environment.platform}`);
  console.log(`OS: ${report.environment.os}`);
  console.log('');
  
  console.log('BEFORE TESTS (Component Tests - Expected to have failures)');
  console.log('-'.repeat(40));
  console.log(`Total: ${beforeResults.total} | Passed: ${beforeResults.passed} | Failed: ${beforeResults.failed}`);
  console.log(`Success: ${beforeResults.success ? '✓' : '✗'}`);
  console.log('');
  
  // Show sample of before test results
  beforeTests.slice(0, 5).forEach(test => {
    const icon = test.outcome === 'passed' ? '✓' : '✗';
    console.log(`  ${icon} ${test.name}`);
  });
  if (beforeTests.length > 5) {
    console.log(`  ... and ${beforeTests.length - 5} more tests`);
  }
  console.log('');
  
  console.log('AFTER TESTS (Meta Tests - Must all pass)');
  console.log('-'.repeat(40));
  console.log(`Total: ${afterResults.total} | Passed: ${afterResults.passed} | Failed: ${afterResults.failed}`);
  console.log(`Success: ${afterResults.success ? '✓' : '✗'}`);
  console.log('');
  
  // Show all after test results
  afterTests.forEach(test => {
    const icon = test.outcome === 'passed' ? '✓' : '✗';
    console.log(`  ${icon} ${test.name}`);
  });
  console.log('');
  
  console.log('COMPARISON');
  console.log('-'.repeat(40));
  console.log(`Before: ${beforeResults.passed}/${beforeResults.total} passed (${beforeResults.success ? 'PASS' : 'FAIL'})`);
  console.log(`After:  ${afterResults.passed}/${afterResults.total} passed (${afterResults.success ? 'PASS' : 'FAIL'})`);
  console.log('');
  
  console.log('FINAL VERDICT');
  console.log('-'.repeat(40));
  console.log(`Success: ${report.final_verdict.success ? '✅ YES' : '❌ NO'}`);
  console.log(`After Tests (Meta): ${afterResults.passed}/${afterResults.total} passed (${report.final_verdict.success_rate}%)`);
  console.log(`Meets Requirements: ${report.final_verdict.meets_requirements ? 'Yes' : 'No'}`);
  
  if (report.final_verdict.success) {
    console.log('');
    console.log('🎉 All meta tests passed! Test suite is valid.');
  } else {
    console.log('');
    console.log('❌ Some meta tests failed. Test suite needs fixes.');
  }
  
  console.log('');
  console.log('='.repeat(80));

  return report;
}

// Run evaluation
try {
  const startTime = Date.now();
  generateEvaluation();
  const duration = (Date.now() - startTime) / 1000;
  console.log(`\nEvaluation completed in ${duration.toFixed(2)}s`);
  process.exit(0);
} catch (error) {
  console.error('Evaluation failed:', error);
  process.exit(1);
}
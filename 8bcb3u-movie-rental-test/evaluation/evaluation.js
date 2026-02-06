const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'evaluation_results.json');
const REPO_AFTER = path.join(__dirname, '..', 'repository_after');

function runTests() {
  const startTime = Date.now();
  let results = {
    timestamp: new Date().toISOString(),
    executionTimeMs: 0,
    status: 'unknown',
    testResults: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0
    },
    metaTestResults: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0
    },
    coverage: null,
    errors: [],
    stdout: '',
    stderr: ''
  };

  try {
    console.log('\n' + '='.repeat(80));
    console.log('📝 EVALUATION: Running Student Tests in repository_after');
    console.log('='.repeat(80) + '\n');
    
    // Run student tests
    let studentTestOutput = '';
    try {
      studentTestOutput = execSync('npm test', {
        cwd: REPO_AFTER,
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      
      results.stdout = studentTestOutput;
      console.log(studentTestOutput);
      
      // Parse Jest output for test counts - try multiple patterns
      // Pattern 1: "Tests: X passed, Y total"
      let testMatch = studentTestOutput.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
      if (testMatch) {
        results.testResults.passed = parseInt(testMatch[1]);
        results.testResults.total = parseInt(testMatch[2]);
      }
      
      // Pattern 2: "Tests: X failed, Y passed, Z total"
      const failMatch = studentTestOutput.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
      if (failMatch) {
        results.testResults.failed = parseInt(failMatch[1]);
        results.testResults.passed = parseInt(failMatch[2]);
        results.testResults.total = parseInt(failMatch[3]);
      }
      
      // Extract coverage - match the percentage in the coverage table
      // Format: "All files |   XX.XX |   XX.XX |   XX.XX |   XX.XX |"
      const coverageMatch = studentTestOutput.match(/All files\s+\|\s+([\d.]+)/);
      if (coverageMatch) {
        const coverage = parseFloat(coverageMatch[1]);
        if (!isNaN(coverage)) {
          results.coverage = coverage;
        }
      }
      
    } catch (error) {
      // Display the full output even when tests fail
      studentTestOutput = error.stdout || '';
      if (studentTestOutput) {
        console.log(studentTestOutput);
      }
      
      results.stdout = studentTestOutput;
      results.stderr = error.stderr || error.message;
      results.errors.push({
        type: 'StudentTestFailure',
        message: error.message,
        stderr: error.stderr
      });
      
      if (error.stderr) {
        console.error('\n❌ Student tests encountered errors:');
        console.error(error.stderr);
      }
      
      // Try to extract test counts even from failed runs
      const failMatch = studentTestOutput.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
      if (failMatch) {
        results.testResults.failed = parseInt(failMatch[1]);
        results.testResults.passed = parseInt(failMatch[2]);
        results.testResults.total = parseInt(failMatch[3]);
      }
      
      // Also try to match just passed tests
      const passMatch = studentTestOutput.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
      if (passMatch && !failMatch) {
        results.testResults.passed = parseInt(passMatch[1]);
        results.testResults.total = parseInt(passMatch[2]);
      }
      
      // Extract coverage from failed runs too
      const coverageMatch = studentTestOutput.match(/All files\s+\|\s+([\d.]+)/);
      if (coverageMatch) {
        const coverage = parseFloat(coverageMatch[1]);
        if (!isNaN(coverage)) {
          results.coverage = coverage;
        }
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('🔍 EVALUATION: Running Meta Tests');
    console.log('='.repeat(80) + '\n');
    
    // Run meta tests from repository_after
    let metaTestOutput = '';
    try {
      metaTestOutput = execSync('npm run test:meta', {
        cwd: REPO_AFTER,
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      
      console.log(metaTestOutput);
      
      // Parse meta test results
      const metaMatch = metaTestOutput.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
      if (metaMatch) {
        results.metaTestResults.passed = parseInt(metaMatch[1]);
        results.metaTestResults.total = parseInt(metaMatch[2]);
      }
      
      const metaFailMatch = metaTestOutput.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
      if (metaFailMatch) {
        results.metaTestResults.failed = parseInt(metaFailMatch[1]);
        results.metaTestResults.passed = parseInt(metaFailMatch[2]);
        results.metaTestResults.total = parseInt(metaFailMatch[3]);
      }
      
    } catch (error) {
      // Display the full output even when meta tests fail
      metaTestOutput = error.stdout || '';
      if (metaTestOutput) {
        console.log(metaTestOutput);
      }
      
      results.errors.push({
        type: 'MetaTestFailure',
        message: error.message,
        stderr: error.stderr
      });
      
      if (error.stderr) {
        console.error('\n❌ Meta tests encountered errors:');
        console.error(error.stderr);
      }
      
      // Extract counts from failed meta tests
      const metaFailMatch = metaTestOutput.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
      if (metaFailMatch) {
        results.metaTestResults.failed = parseInt(metaFailMatch[1]);
        results.metaTestResults.passed = parseInt(metaFailMatch[2]);
        results.metaTestResults.total = parseInt(metaFailMatch[3]);
      }
      
      // Also try to match just passed tests
      const metaPassMatch = metaTestOutput.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
      if (metaPassMatch && !metaFailMatch) {
        results.metaTestResults.passed = parseInt(metaPassMatch[1]);
        results.metaTestResults.total = parseInt(metaPassMatch[2]);
      }
    }

    // Determine overall status
    if (results.errors.length === 0 && 
        results.testResults.failed === 0 && 
        results.metaTestResults.failed === 0) {
      results.status = 'passed';
    } else if (results.metaTestResults.failed > 0) {
      results.status = 'failed_meta_tests';
    } else if (results.testResults.failed > 0) {
      results.status = 'failed_student_tests';
    } else {
      results.status = 'failed';
    }

  } catch (error) {
    results.status = 'error';
    results.errors.push({
      type: 'FatalError',
      message: error.message,
      stack: error.stack
    });
    console.error('Fatal error during evaluation:');
    console.error(error);
  }

  results.executionTimeMs = Date.now() - startTime;

  // Write results to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log('📊 EVALUATION SUMMARY');
  console.log('='.repeat(80));
  
  // Status with icon
  const statusIcon = results.status === 'passed' ? '✅' : '❌';
  const statusText = results.status.toUpperCase().replace(/_/g, ' ');
  console.log(`\n${statusIcon} Overall Status: ${statusText}`);
  console.log(`⏱️  Execution Time: ${(results.executionTimeMs / 1000).toFixed(2)}s (${results.executionTimeMs}ms)`);
  
  // Student Tests Section
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`📝 Student Tests (repository_after/tests/app.test.js)`);
  console.log(`${'─'.repeat(80)}`);
  
  const studentPassRate = results.testResults.total > 0 
    ? ((results.testResults.passed / results.testResults.total) * 100).toFixed(1)
    : '0.0';
  
  const studentIcon = results.testResults.failed === 0 && results.testResults.total > 0 ? '✅' : '❌';
  console.log(`${studentIcon} Total Tests: ${results.testResults.total}`);
  console.log(`   ✓ Passed: ${results.testResults.passed} (${studentPassRate}%)`);
  
  if (results.testResults.failed > 0) {
    console.log(`   ✗ Failed: ${results.testResults.failed}`);
  }
  
  if (results.testResults.skipped > 0) {
    console.log(`   ○ Skipped: ${results.testResults.skipped}`);
  }
  
  // Meta Tests Section
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`🔍 Meta Tests (tests/app_meta.test.js)`);
  console.log(`${'─'.repeat(80)}`);
  
  const metaPassRate = results.metaTestResults.total > 0 
    ? ((results.metaTestResults.passed / results.metaTestResults.total) * 100).toFixed(1)
    : '0.0';
  
  const metaIcon = results.metaTestResults.failed === 0 && results.metaTestResults.total > 0 ? '✅' : '❌';
  console.log(`${metaIcon} Total Tests: ${results.metaTestResults.total}`);
  console.log(`   ✓ Passed: ${results.metaTestResults.passed} (${metaPassRate}%)`);
  
  if (results.metaTestResults.failed > 0) {
    console.log(`   ✗ Failed: ${results.metaTestResults.failed}`);
  }
  
  if (results.metaTestResults.skipped > 0) {
    console.log(`   ○ Skipped: ${results.metaTestResults.skipped}`);
  }
  
  // Coverage Section
  if (results.coverage !== null) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📈 Code Coverage`);
    console.log(`${'─'.repeat(80)}`);
    const coverageIcon = results.coverage >= 80 ? '✅' : results.coverage >= 60 ? '⚠️' : '❌';
    console.log(`${coverageIcon} Overall Coverage: ${results.coverage}%`);
  }
  
  // Errors Section
  if (results.errors.length > 0) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`⚠️  Errors Encountered: ${results.errors.length}`);
    console.log(`${'─'.repeat(80)}`);
    results.errors.forEach((err, idx) => {
      console.log(`${idx + 1}. ${err.type}: ${err.message}`);
    });
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`💾 Results saved to: ${OUTPUT_FILE}`);
  console.log('='.repeat(80) + '\n');

  return results;
}

// Run evaluation
const results = runTests();

// Exit with appropriate code
if (results.status === 'passed') {
  process.exit(0);
} else {
  process.exit(1);
}
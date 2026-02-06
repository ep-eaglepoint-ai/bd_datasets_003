const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function generateId() {
  return crypto.randomUUID();
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}-${minutes}-${seconds}`;
}

function getReportDirectory(startTime) {
  const datePart = formatDate(startTime);
  const timePart = formatTime(startTime);
  const reportsDir = path.resolve(__dirname, 'reports', datePart, timePart);
  
  // Create directory recursively
  fs.mkdirSync(reportsDir, { recursive: true });
  
  return reportsDir;
}

function runTests(repoPath) {
  try {
    const output = execSync(
      'npx jest --json --outputFile=test-results.json --verbose',
      {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    return { output, returnCode: 0 };
  } catch (error) {
    return { 
      output: error.stdout?.toString() || error.message, 
      returnCode: error.status || 1 
    };
  }
}

function parseJestResults(repoPath) {
  const resultsPath = path.join(repoPath, 'test-results.json');
  const tests = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let errors = 0;

  try {
    if (fs.existsSync(resultsPath)) {
      const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
      
      for (const testResult of results.testResults || []) {
        for (const assertion of testResult.assertionResults || []) {
          const status = assertion.status === 'passed' ? 'passed' 
            : assertion.status === 'failed' ? 'failed'
            : assertion.status === 'pending' ? 'skipped'
            : 'error';
          
          tests.push({
            nodeid: `${testResult.name}::${assertion.fullName}`,
            status,
          });
          
          if (status === 'passed') passed++;
          else if (status === 'failed') failed++;
          else if (status === 'skipped') skipped++;
          else errors++;
        }
      }
      
      // Clean up results file
      fs.unlinkSync(resultsPath);
    }
  } catch (e) {
    console.error('Error parsing test results:', e);
  }

  return { tests, passed, failed, skipped, errors };
}

function generateReport() {
  const runId = generateId();
  const startTime = new Date();
  
  console.log('Starting evaluation run:', runId);
  console.log('Start time:', startTime.toISOString());
  
  const repoPath = path.resolve(__dirname, '..', 'repository_after');
  const { output, returnCode } = runTests(repoPath);
  
  const { tests, passed, failed, skipped, errors } = parseJestResults(repoPath);
  
  const endTime = new Date();
  const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
  
  // Summary consolidated inside report.json (no separate summary.json needed)
  const summary = {
    total_tests: tests.length,
    passed,
    failed,
    skipped,
    errors,
    success: failed === 0 && errors === 0,
    pass_rate: tests.length > 0 ? ((passed / tests.length) * 100).toFixed(2) + '%' : '0%',
  };

  const report = {
    run_id: runId,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    duration_seconds: durationSeconds,
    summary, // Summary is now inside report.json
    tests,
    output,
    return_code: returnCode,
    report_path: `reports/${formatDate(startTime)}/${formatTime(startTime)}/report.json`
  };
  
  return report;
}

function printReport(report) {
  console.log('\n' + '='.repeat(60));
  console.log('EVALUATION REPORT');
  console.log('='.repeat(60));
  console.log(`Run ID: ${report.run_id}`);
  console.log(`Duration: ${report.duration_seconds.toFixed(2)} seconds`);
  console.log(`Total Tests: ${report.summary.total_tests}`);
  console.log(`Passed: ${report.summary.passed}`);
  console.log(`Failed: ${report.summary.failed}`);
  console.log(`Skipped: ${report.summary.skipped}`);
  console.log(`Errors: ${report.summary.errors}`);
  console.log(`Pass Rate: ${report.summary.pass_rate}`);
  console.log(`Success: ${report.summary.success ? 'YES' : 'NO'}`);
  console.log(`Report saved to: ${report.report_path}`);
  console.log('='.repeat(60));
  
  if (report.summary.failed > 0 || report.summary.errors > 0) {
    console.log('\nFailed/Error Tests:');
    for (const test of report.tests) {
      if (test.status === 'failed' || test.status === 'error') {
        console.log(`  - ${test.nodeid}: ${test.status}`);
      }
    }
  }
}

function saveReport(report, startTime) {
  const reportDir = getReportDirectory(startTime);
  const outputPath = path.join(reportDir, 'report.json');
  
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\nFull report saved to: ${outputPath}`);
  
  // Also create a latest.json symlink or copy for convenience
  const latestPath = path.resolve(__dirname, 'reports', 'latest.json');
  try {
    if (fs.existsSync(latestPath)) {
      fs.unlinkSync(latestPath);
    }
    fs.symlinkSync(outputPath, latestPath, 'file');
    console.log(`Latest report linked to: ${latestPath}`);
  } catch (e) {
    // If symlink fails (e.g., on Windows without admin), just copy
    fs.copyFileSync(outputPath, latestPath);
    console.log(`Latest report copied to: ${latestPath}`);
  }
  
  return outputPath;
}

// Main execution
try {
  const startTime = new Date();
  const report = generateReport();
  printReport(report);
  
  // Save to structured directory
  const savedPath = saveReport(report, startTime);
  
  // Also save a summary file
  const summary = {
    run_id: report.run_id,
    timestamp: startTime.toISOString(),
    total_tests: report.total_tests,
    passed: report.passed,
    failed: report.failed,
    skipped: report.skipped,
    errors: report.errors,
    success: report.success,
    duration_seconds: report.duration_seconds,
    report_path: report.report_path
  };
  
  // const summaryPath = path.join(path.dirname(savedPath), 'summary.json');
  // fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  // console.log(`Summary saved to: ${summaryPath}`);
  
  process.exit(report.summary.success ? 0 : 1);
} catch (error) {
  console.error('Error running evaluation:', error);
  process.exit(1);
}
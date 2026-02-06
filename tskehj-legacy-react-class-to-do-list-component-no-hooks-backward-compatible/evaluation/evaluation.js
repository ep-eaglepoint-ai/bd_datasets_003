var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var uuid = require('uuid');

function parseTestResults(output) {
  var tests = [];
  var lines = output.split('\n');

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    var passMatch = line.match(/^\s+\u2713\s+(.+?)\s+\((\d+)\s*ms\)/);
    if (passMatch) {
      tests.push({
        name: passMatch[1].trim(),
        status: 'PASSED',
        duration_ms: parseInt(passMatch[2], 10)
      });
      continue;
    }

    var failMatch = line.match(/^\s+\u2717\s+(.+?)\s+\((\d+)\s*ms\)/);
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

function extractTestSummary(output) {
  var summary = {
    total: 0,
    passed: 0,
    failed: 0,
    suites_total: 0,
    suites_passed: 0,
    duration_seconds: 0
  };

  var testsLine = output.match(/Tests:\s+(\d+)\s+passed(?:,\s+(\d+)\s+failed)?(?:,\s+)?(\d+)\s+total/);
  if (testsLine) {
    summary.passed = parseInt(testsLine[1], 10) || 0;
    summary.failed = parseInt(testsLine[2], 10) || 0;
    summary.total = parseInt(testsLine[3], 10) || 0;
  }

  var suitesLine = output.match(/Test Suites:\s+(\d+)\s+passed(?:,\s+(\d+)\s+failed)?(?:,\s+)?(\d+)\s+total/);
  if (suitesLine) {
    summary.suites_passed = parseInt(suitesLine[1], 10) || 0;
    summary.suites_total = parseInt(suitesLine[3], 10) || 0;
  }

  var timeLine = output.match(/Time:\s+([\d.]+)\s*s/);
  if (timeLine) {
    summary.duration_seconds = parseFloat(timeLine[1]);
  }

  return summary;
}

function runEvaluation() {
  var runId = uuid.v4();
  var startedAt = new Date().toISOString();
  var startTime = Date.now();

  var report = {
    run_id: runId,
    started_at: startedAt,
    finished_at: null,
    duration_seconds: 0,
    environment: {
      node_version: process.version,
      platform: process.platform + '-' + process.arch,
      react_version: '17.0.2'
    },
    before: {
      tests: {
        passed: false,
        return_code: 1,
        output: 'repository_before is empty (feature generation task)',
        summary: { total: 0, passed: 0, failed: 0 }
      },
      metrics: { files: 0, lines_of_code: 0 }
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
    console.log('Run ID: ' + runId);
    console.log('Started at: ' + startedAt);
    console.log('');

    // Count source files
    var afterSrcPath = path.join(__dirname, '..', 'repository_after', 'src');
    if (fs.existsSync(afterSrcPath)) {
      var srcFiles = fs.readdirSync(afterSrcPath).filter(function (f) {
        return f.endsWith('.js');
      });
      report.after.metrics.files = srcFiles.length;
      var totalLines = 0;
      srcFiles.forEach(function (file) {
        var content = fs.readFileSync(path.join(afterSrcPath, file), 'utf-8');
        totalLines += content.split('\n').length;
      });
      report.after.metrics.lines_of_code = totalLines;
    }

    console.log('Repository Metrics:');
    console.log('   Files: ' + report.after.metrics.files);
    console.log('   Lines of Code: ' + report.after.metrics.lines_of_code);
    console.log('');

    // Run tests using spawnSync to capture BOTH stdout and stderr
    console.log('Running Test Suite...');
    console.log('-'.repeat(80));
    console.log('');

    var result = childProcess.spawnSync(
      'npx',
      ['jest', '--verbose', '--no-coverage', '--forceExit'],
      {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf-8',
        timeout: 120000
      }
    );

    // Jest writes test results to stderr, npm wrapper writes to stdout
    var stdout = result.stdout || '';
    var stderr = result.stderr || '';
    var fullOutput = stdout + '\n' + stderr;

    report.after.tests.return_code = result.status || 0;
    report.after.tests.output = fullOutput.substring(0, 10000);

    // Parse individual test results from combined output
    var detailedResults = parseTestResults(fullOutput);
    report.after.tests.detailed_results = detailedResults;

    // Extract summary
    var summary = extractTestSummary(fullOutput);
    report.after.tests.summary = summary;
    report.after.metrics.test_count = summary.total;
    report.after.metrics.passed_tests = summary.passed;
    report.after.metrics.failed_tests = summary.failed;

    // Display individual test results
    console.log('Test Results:');
    console.log('');

    if (detailedResults.length > 0) {
      detailedResults.forEach(function (test) {
        var icon = test.status === 'PASSED' ? '\u2713' : '\u2717';
        console.log('    ' + icon + ' ' + test.name + ' (' + test.duration_ms + ' ms)');
      });
    } else {
      console.log('    Warning: Could not parse individual test results');
      console.log('');
      console.log('    --- Raw stdout (first 800 chars) ---');
      console.log(stdout.substring(0, 800));
      console.log('    --- Raw stderr (first 800 chars) ---');
      console.log(stderr.substring(0, 800));
    }

    console.log('');
    console.log('-'.repeat(80));

    // Determine pass/fail
    var allTestsPassed = result.status === 0 &&
                        summary.total > 0 &&
                        summary.passed === summary.total &&
                        summary.failed === 0;

    report.after.tests.passed = allTestsPassed;

    if (allTestsPassed) {
      console.log('All tests passed! (' + summary.passed + '/' + summary.total + ')');
    } else if (summary.total > 0) {
      console.log('Tests: ' + summary.passed + ' passed, ' + summary.failed + ' failed, ' + summary.total + ' total');
    } else {
      console.log('No tests found or test execution failed');
      console.log('Exit code: ' + result.status);
    }

    if (summary.suites_total > 0) {
      console.log('Test Suites: ' + summary.suites_passed + '/' + summary.suites_total + ' passed');
    }

    if (summary.duration_seconds > 0) {
      console.log('Test Duration: ' + summary.duration_seconds.toFixed(3) + 's');
    }

    console.log('');

    // Set success
    report.success = allTestsPassed;
    report.comparison.passed_gate = allTestsPassed;

    if (report.success) {
      var avgTime = detailedResults.length > 0
        ? (detailedResults.reduce(function (sum, t) { return sum + t.duration_ms; }, 0) / detailedResults.length).toFixed(1)
        : 'N/A';

      report.comparison.improvement_summary =
        'Successfully implemented legacy React class component with ' + summary.total + ' passing tests. ' +
        'Component handles task management with proper state handling, event binding, and performance optimization. ' +
        'Test suite completed in ' + summary.duration_seconds.toFixed(2) + 's (avg ' + avgTime + 'ms per test).';
    } else if (summary.total > 0) {
      report.comparison.improvement_summary =
        'Tests completed: ' + summary.passed + '/' + summary.total + ' passed, ' + summary.failed + ' failed.';
    } else {
      report.comparison.improvement_summary =
        'No tests detected or test execution failed.';
    }

  } catch (error) {
    report.error = error.message;
    report.success = false;
    console.error('Fatal Error: ' + error.message);
  }

  // Finalize
  var endTime = Date.now();
  report.finished_at = new Date().toISOString();
  report.duration_seconds = (endTime - startTime) / 1000;

  // Write report
  var now = new Date();
  var dateFolder = now.toISOString().split('T')[0];
  var timeFolder = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  var reportDir = path.join(__dirname, 'reports', dateFolder, timeFolder);

  fs.mkdirSync(reportDir, { recursive: true });

  var reportPath = path.join(reportDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('='.repeat(80));
  console.log('  Evaluation Summary');
  console.log('='.repeat(80));
  console.log('Overall Duration: ' + report.duration_seconds.toFixed(2) + 's');

  if (report.after.tests.summary.duration_seconds > 0) {
    console.log('Test Execution: ' + report.after.tests.summary.duration_seconds.toFixed(2) + 's');
  }

  console.log('Success: ' + (report.success ? 'YES' : 'NO'));
  console.log('Tests: ' + report.after.metrics.passed_tests + '/' + report.after.metrics.test_count + ' passed');

  if (report.after.metrics.failed_tests > 0) {
    console.log('Failed: ' + report.after.metrics.failed_tests);
  }

  console.log('');
  console.log('Report saved to: ' + reportPath);
  console.log('='.repeat(80));

  process.exit(report.success ? 0 : 1);
}

runEvaluation();
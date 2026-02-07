const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const testFolder = path.join(ROOT, 'tests');
const REPORTS_DIR = path.join(ROOT, 'evaluation', 'reports');
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

const SEARCH_HIGHLIGHTS_TAGS_NOTE =
  'The Search functionality is not implemented in the repository. Consequently, there are no tags for highlighting matching search terms';

function die_oom() {
  try {
    process.stderr.write('evaluation: out of memory\n');
  } catch {
  }
  process.exit(137);
}

function getEnvironmentInfo() {
  return {
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    timestamp: new Date().toISOString()
  };
}

function tryReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function summarizeJestJson(details) {
  if (!details || typeof details !== 'object') return null;
  return {
    numTotalTests: details.numTotalTests ?? 0,
    numPassedTests: details.numPassedTests ?? 0,
    numFailedTests: details.numFailedTests ?? 0,
    numPendingTests: details.numPendingTests ?? 0,
    numTodoTests: details.numTodoTests ?? 0,
    numTotalTestSuites: details.numTotalTestSuites ?? 0,
    numPassedTestSuites: details.numPassedTestSuites ?? 0,
    numFailedTestSuites: details.numFailedTestSuites ?? 0,
    numPendingTestSuites: details.numPendingTestSuites ?? 0,
  };
}

function getJestBinPath() {
  return path.join(testFolder, 'node_modules', 'jest', 'bin', 'jest.js');
}

function getTempJestOutputFile(repoPath) {
  const safeRepo = String(repoPath).replace(/[^a-zA-Z0-9_.-]/g, '_');
  const name = `jest-results-${safeRepo}-${process.pid}-${Date.now()}.json`;
  return path.join(os.tmpdir(), name);
}

function runTests(repoPath) {
  return new Promise((resolve) => {
    console.log(`Running tests for: ${repoPath}`);

    const jestOutputFile = getTempJestOutputFile(repoPath);
    try {
      fs.unlinkSync(jestOutputFile);
    } catch {
    }

    let testProcess;
    try {
      const cmd = process.execPath;
      const args = [
        getJestBinPath(),
        '--watchAll=false',
        '--testTimeout=10000',
        '--silent',
        '--runInBand',
        '--json',
        `--outputFile=${jestOutputFile}`,
      ];
      testProcess = spawn(cmd, args, {
        cwd: testFolder,
        env: {
          ...process.env,
          CI: 'true',
          REPO_PATH: repoPath,
        },
      });
    } catch (e) {
      resolve({
        passed: false,
        return_code: 1,
        output: `Failed to start test process: ${e && e.message ? e.message : String(e)}`,
        raw_output: '',
        details: null,
      });
      return;
    }

    let stdout = '';
    let stderr = '';

    const MAX_STREAM_LOG_CHARS = 8000;
    let streamedChars = 0;

    function streamLog(prefix, chunk, isError) {
      if (streamedChars >= MAX_STREAM_LOG_CHARS) return;
      const remaining = MAX_STREAM_LOG_CHARS - streamedChars;
      const toPrint = chunk.length > remaining ? chunk.slice(0, remaining) : chunk;
      streamedChars += toPrint.length;
      if (isError) {
        console.error(`${prefix}${toPrint}`);
      } else {
        console.log(`${prefix}${toPrint}`);
      }
      if (streamedChars >= MAX_STREAM_LOG_CHARS) {
        console.log(`[${repoPath}] ...output truncated...`);
      }
    }

    testProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      streamLog(`[${repoPath} stdout]: `, output, false);
    });

    testProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      streamLog(`[${repoPath} stderr]: `, output, true);
    });

    const timeoutId = setTimeout(() => {
      try {
        testProcess.kill();
      } catch {
      }
      resolve({
        passed: false,
        return_code: 1,
        output: 'Test timeout',
        raw_output: 'Tests took too long to execute',
        details: null
      });
    }, 120000);

    testProcess.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        passed: false,
        return_code: 1,
        output: `Failed to start test process: ${err && err.message ? err.message : String(err)}`,
        raw_output: stdout + stderr,
        details: null
      });
    });

    testProcess.on('close', (code) => {
      clearTimeout(timeoutId);
      console.log(`[${repoPath}] Process exited with code: ${code}`);
      
      let passed = code === 0;
      const output = passed ? 'All tests passed.' : 'Some tests failed.';

      const rawDetails = tryReadJson(jestOutputFile);
      const details = summarizeJestJson(rawDetails);

      try {
        fs.unlinkSync(jestOutputFile);
      } catch {
        // ignore
      }

      resolve({
        passed,
        return_code: code,
        output: output.substring(0, 1000), 
        raw_output: stdout + stderr,
        details
      });
    });
  });
}

async function runEvaluation() {
  const runId = randomUUID();
  const startTime = new Date();
  
  console.log(`=== Starting Evaluation (Run ID: ${runId}) ===`);
  console.log(`Start Time: ${startTime.toISOString()}`);
  console.log(`Environment: ${JSON.stringify(getEnvironmentInfo(), null, 2)}`);

  console.log('\n--- Running Baseline Tests (repository_before) ---');
  const beforeResult = await runTests('repository_before');

  console.log('\n--- Running Implementation Tests (repository_after) ---');
  const afterResult = await runTests('repository_after');

  const endTime = new Date();
  const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);

  let improvementSummary = 'No improvement detected.';
  let passedGate = false;

  if (!beforeResult.passed && afterResult.passed) {
    improvementSummary = 'SUCCESS: Implementation fixed all issues. All tests pass.';
    passedGate = true;
  } else if (beforeResult.passed && afterResult.passed) {
    improvementSummary = 'INFO: Tests pass in both states. Verify new functionality was added.';
    passedGate = true;
  } else if (!afterResult.passed) {
    improvementSummary = 'FAILURE: Implementation failed to pass tests.';
    passedGate = false;
  }

  const report = {
    evaluation_id: runId,
    task_id: 'KEF0JA',
    started_at: startTime.toISOString(),
    finished_at: endTime.toISOString(),
    duration_seconds: durationSeconds,
    environment: getEnvironmentInfo(),
    
    before_state: {
      repo: 'repository_before',
      tests: {
        passed: beforeResult.passed,
        return_code: beforeResult.return_code,
        output_summary: beforeResult.output,
        test_count: beforeResult.details?.numTotalTests || 0,
        passed_count: beforeResult.details?.numPassedTests || 0,
        failed_count: beforeResult.details?.numFailedTests || 0,
        skipped_count: (beforeResult.details?.numPendingTests || 0) + (beforeResult.details?.numTodoTests || 0)
      }
    },  
    after_state: {
      repo: 'repository_after',
      tests: {
        passed: afterResult.passed,
        return_code: afterResult.return_code,
        output_summary: afterResult.output,
        test_count: afterResult.details?.numTotalTests || 0,
        passed_count: afterResult.details?.numPassedTests || 0,
        failed_count: afterResult.details?.numFailedTests || 0,
        skipped_count: (afterResult.details?.numPendingTests || 0) + (afterResult.details?.numTodoTests || 0)
      }
    },
    
    comparison: {
      passed_gate: passedGate,
      improvement_summary: improvementSummary,
      new_features_tested: [
        'drag_and_drop_reordering',
        'category_system',
        'localStorage_persistence',
        'keyboard_navigation',
        'mobile_touch_support'
      ],
      search_highlights: {
        tags: [],
        note: SEARCH_HIGHLIGHTS_TAGS_NOTE
      }
    },
    
    success: passedGate,
    error: null
  };

  const reportPath = path.join(REPORTS_DIR, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n=== Evaluation Complete ===');
  console.log(`Duration: ${durationSeconds} seconds`);
  console.log(`Result: ${passedGate ? 'PASS' : 'FAIL'}`);
  console.log(`Summary: ${improvementSummary}`);
  console.log(`Report written to: ${reportPath}`);
  console.log(`\n=== Evaluation Finished ===`);
  process.exit(passedGate ? 0 : 1);
}

async function main() {
  await runEvaluation();
}

process.on("unhandledRejection", (e) => {
  const msg = e && e.stack ? String(e.stack) : String(e);
  if (msg.includes("heap out of memory")) return die_oom();
  try {
    process.stderr.write(`evaluation: unhandled rejection: ${msg}\n`);
  } catch {
  }
  process.exit(1);
});

process.on('uncaughtException', (e) => {
  const msg = e && e.stack ? String(e.stack) : String(e);
  if (msg.includes('heap out of memory')) return die_oom();
  try {
    process.stderr.write(`evaluation: uncaught exception: ${msg}\n`);
  } catch {
  }
  process.exit(1);
});

try {
  main();
} catch (e) {
  const msg = e && e.stack ? String(e.stack) : String(e);
  try {
    process.stderr.write(`evaluation: fatal error: ${msg}\n`);
  } catch {

  }
  process.exit(1);
}
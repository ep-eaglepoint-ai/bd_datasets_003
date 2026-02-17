const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const REPO_BEFORE = path.resolve(__dirname, '../repository_before');
const REPO_AFTER = path.resolve(__dirname, '../repository_after');
const TESTS_DIR = path.resolve(__dirname, '../tests');
const REPORTS_DIR = path.join(__dirname, 'reports');

if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function die_oom() {
  try {
    process.stderr.write('evaluation: heap out of memory\n');
  } catch {
  }
  process.exit(0);
}

process.on('unhandledRejection', (e) => {
  const msg = e && e.stack ? String(e.stack) : String(e);
  if (msg.includes('heap out of memory')) return die_oom();
  try {
    process.stderr.write(`evaluation: unhandled rejection: ${msg}\n`);
  } catch {
  }
  process.exit(0);
});

function runTestsAgainst(repoPath, env = {}) {
  console.log(`\n=== Running tests against: ${repoPath} ===`);
  
  const envVars = { 
    ...process.env, 
    ...env,
    REPO_PATH: repoPath,
    NODE_ENV: 'test',
  };

  const timeoutMs = Number(process.env.EVALUATION_TEST_TIMEOUT_MS ?? 10 * 60_000);
  
  try {
    const result = execSync('npm run test:all', {
      cwd: TESTS_DIR,
      env: envVars,
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    
    return {
      success: true,
      output: result,
      error: null,
    };
  } catch (error) {
    const timeoutHint = error && error.killed ? ` (timed out after ${timeoutMs}ms)` : '';
    return {
      success: false,
      output: error.stdout || '',
      error: (error.stderr || error.message || 'Unknown error') + timeoutHint,
    };
  }
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function looksLikeTimeoutFailure(failureMessage) {
  if (!failureMessage) return false;
  const msg = String(failureMessage);
  return (
    msg.includes('Exceeded timeout of') ||
    msg.toLowerCase().includes('timed out') ||
    msg.toLowerCase().includes('timeout')
  );
}

function parseJestTextSummary(text) {
  const s = String(text || '');
  const testsMatch = s.match(/Tests:\s+([\s\S]*?)\n/);
  const timeMatch = s.match(/Time:\s+([0-9.]+)\s*s/);

  let total = null;
  let passed = null;
  let failed = null;

  if (testsMatch) {
    const line = testsMatch[1];
    const totalMatch = line.match(/([0-9]+)\s+total/);
    const passedMatch = line.match(/([0-9]+)\s+passed/);
    const failedMatch = line.match(/([0-9]+)\s+failed/);
    total = totalMatch ? Number(totalMatch[1]) : null;
    passed = passedMatch ? Number(passedMatch[1]) : null;
    failed = failedMatch ? Number(failedMatch[1]) : null;
  }

  const timeoutCount = (s.match(/Exceeded timeout of\s+[0-9]+\s+ms/gi) || []).length;
  const totalTimeSeconds = timeMatch ? Number(timeMatch[1]) : null;

  return {
    totalTests: total,
    passedTests: passed,
    failedTests: failed,
    timeoutTests: timeoutCount,
    totalTimeSeconds,
  };
}

function buildReportFromJestJson(jestJson, wallClockSeconds) {
  const numTotalTests = Number(jestJson?.numTotalTests ?? 0);
  const numPassedTests = Number(jestJson?.numPassedTests ?? 0);
  const numFailedTests = Number(jestJson?.numFailedTests ?? 0);

  const testDetails = [];
  let timeoutCount = 0;
  const durations = [];

  const fileResults = Array.isArray(jestJson?.testResults) ? jestJson.testResults : [];
  for (const fileResult of fileResults) {
    const fileName = fileResult?.name ? path.basename(String(fileResult.name)) : 'unknown';
    const assertions = Array.isArray(fileResult?.assertionResults) ? fileResult.assertionResults : [];
    for (const assertion of assertions) {
      const fullName = assertion?.fullName || assertion?.title || 'unknown';
      const duration = typeof assertion?.duration === 'number' ? assertion.duration : null;
      const failureMessage = assertion?.failureMessages?.join('\n') || '';
      const isTimeout = assertion?.status === 'failed' && looksLikeTimeoutFailure(failureMessage);
      if (isTimeout) timeoutCount += 1;
      if (typeof duration === 'number') durations.push(duration);
      testDetails.push({
        name: `${fileName}::${fullName}`,
        status: isTimeout ? 'timeout' : assertion?.status || 'unknown',
        execution_time_ms: duration,
        memory_usage_mb: null,
      });
    }
  }

  const worst = durations.length ? Math.max(...durations) : null;
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  const failedNonTimeout = Math.max(0, numFailedTests - timeoutCount);

  return {
    summary: {
      total_tests: numTotalTests,
      passed: numPassedTests,
      failed: failedNonTimeout,
      timeout: timeoutCount,
      total_time_seconds: typeof wallClockSeconds === 'number' ? wallClockSeconds : null,
    },
    performance_metrics: {
      worst_case_time_ms: worst,
      average_time_ms: avg,
      peak_memory_mb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      determinism_verified: null,
    },
    test_details: testDetails,
  };
}

function buildRequirementCoverage(allTestsPassed) {
  const requirements = [
    {
      id: 1,
      description: 'Build a form to create countdowns with all specified fields',
      testFiles: ['countdowns.test.ts', 'components.test.tsx'],
    },
    {
      id: 2,
      description: 'Show beautiful full-screen countdown with animated flipping numbers',
      testFiles: ['components.test.tsx', 'countdowns.test.ts'],
    },
    {
      id: 3,
      description: 'Generate unique short URLs for each countdown',
      testFiles: ['countdowns.test.ts', 'full-flow.test.ts'],
    },
    {
      id: 4,
      description: 'For logged-in users, display all countdowns in grid view',
      testFiles: ['countdowns.test.ts'],
    },
    {
      id: 5,
      description: 'Handle three states: upcoming, happening now, past',
      testFiles: ['countdowns.test.ts', 'utils.test.ts'],
    },
    {
      id: 6,
      description: 'Offer preset themes and custom color picker',
      testFiles: ['countdowns.test.ts', 'components.test.tsx'],
    },
  ];

  return requirements.map((req) => ({
    requirement: `Requirement ${req.id}: ${req.description}`,
    verified: Boolean(allTestsPassed),
    test_cases: ['requirement-mapping.test.ts'],
    evidence: `Covered by tests: ${req.testFiles.join(', ')}`,
  }));
}

async function main() {
  const effectiveDatabaseUrl =
    process.env.DATABASE_URL ||
    process.env.TEST_DB_URL ||
    'postgresql://postgres:password@localhost:5432/countdown_test';

  const effectiveApiUrl = process.env.API_URL || 'http://localhost:3001';

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbyhbl-eval-'));
  const jestJsonPath = path.join(tmpDir, 'jest-results.json');

  const t0 = Date.now();
  const envVars = {
    DATABASE_URL: effectiveDatabaseUrl,
    API_URL: effectiveApiUrl,
  };

  let runResult;
  try {
    execSync(`npm run test:all -- --json --outputFile "${jestJsonPath}"`, {
      cwd: TESTS_DIR,
      env: {
        ...process.env,
        ...envVars,
        REPO_PATH: REPO_AFTER,
        NODE_ENV: 'test',
      },
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: Number(process.env.EVALUATION_TEST_TIMEOUT_MS ?? 10 * 60_000),
      maxBuffer: 10 * 1024 * 1024,
    });
    runResult = { success: true, output: '' };
  } catch (error) {
    runResult = { success: false, output: (error && (error.stderr || error.stdout)) || '' };
  }
  const wallClockSeconds = Math.round(((Date.now() - t0) / 1000) * 10) / 10;

  const jestJson = safeReadJson(jestJsonPath);

  let report;
  if (jestJson) {
    report = buildReportFromJestJson(jestJson, wallClockSeconds);
  } else {
    const parsed = parseJestTextSummary(runResult.output);
    const totalTests = parsed.totalTests ?? 0;
    const passedTests = parsed.passedTests ?? 0;
    const failedTests = parsed.failedTests ?? 0;
    const timeoutTests = parsed.timeoutTests ?? 0;
    const failedNonTimeout = Math.max(0, failedTests - timeoutTests);
    report = {
      summary: {
        total_tests: totalTests,
        passed: passedTests,
        failed: failedNonTimeout,
        timeout: timeoutTests,
        total_time_seconds: parsed.totalTimeSeconds ?? wallClockSeconds,
      },
      performance_metrics: {
        worst_case_time_ms: null,
        average_time_ms: null,
        peak_memory_mb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        determinism_verified: null,
      },
      test_details: [],
    };
  }

  const allTestsPassed = Boolean(runResult && runResult.success && report.summary && report.summary.failed === 0 && report.summary.timeout === 0);
  report.requirement_coverage = buildRequirementCoverage(allTestsPassed);

  const reportPath = path.join(REPORTS_DIR, 'evaluation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
  }

  console.log(`\n=== Evaluation Report Generated (Guide Format) ===`);
  console.log(`Location: ${reportPath}`);
  console.log(`Tests passed: ${allTestsPassed ? 'yes' : 'no'}`);

  process.exit(0);
}

try {
  main();
} catch (e) {
  const msg = e && e.stack ? String(e.stack) : String(e);
  try {
    process.stderr.write(`evaluation: fatal error: ${msg}\n`);
  } catch {
    // ignore
  }
  process.exit(0);
}
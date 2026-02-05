const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
    // ignore
  }
  process.exit(0);
}

process.on('unhandledRejection', (e) => {
  const msg = e && e.stack ? String(e.stack) : String(e);
  if (msg.includes('heap out of memory')) return die_oom();
  try {
    process.stderr.write(`evaluation: unhandled rejection: ${msg}\n`);
  } catch {
    // ignore
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

async function main() {
  // In docker-compose CI runs these are injected into the container and should be used as-is.
  // Fall back to localhost defaults only when running outside compose.
  const effectiveDatabaseUrl =
    process.env.DATABASE_URL ||
    process.env.TEST_DB_URL ||
    'postgresql://postgres:password@localhost:5432/countdown_test';

  const effectiveApiUrl = process.env.API_URL || 'http://localhost:3001';

  const report = {
    timestamp: new Date().toISOString(),
    task: 'BBYHBL - Custom Countdown Timer',
    
    before: runTestsAgainst(REPO_BEFORE, {
      DATABASE_URL: effectiveDatabaseUrl,
    }),
    after: runTestsAgainst(REPO_AFTER, {
      DATABASE_URL: effectiveDatabaseUrl,
      API_URL: effectiveApiUrl,
    }),

    requirements: [
      { id: 1, description: 'Countdown creation form', verified: false },
      { id: 2, description: 'Beautiful countdown display', verified: false },
      { id: 3, description: 'Shareable URLs', verified: false },
      { id: 4, description: 'User countdown grid view', verified: false },
      { id: 5, description: 'Three states handling', verified: false },
      { id: 6, description: 'Theme customization', verified: false },
    ],
  };

  // If repository_after passes the test suite, mark all requirements verified.
  // Requirement-specific assertions live in the Jest tests; failures will flip `after.success`.
  if (report.after && report.after.success) {
    report.requirements = report.requirements.map((r) => ({ ...r, verified: true }));
  }
  const reportPath = path.join(REPORTS_DIR, 'evaluation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\n=== Evaluation Report Generated ===`);
  console.log(`Location: ${reportPath}`);
  console.log(`Before tests passed: ${report.before.success ? '✅' : '❌'}`);
  console.log(`After tests passed: ${report.after.success ? '✅' : '❌'}`);

  // Aquila-safe: evaluation should not fail the job via exit code.
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
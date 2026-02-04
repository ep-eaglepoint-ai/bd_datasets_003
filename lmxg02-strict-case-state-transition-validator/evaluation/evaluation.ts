import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface TestResult {
  nodeid: string;
  name: string;
  outcome: 'passed' | 'failed' | 'error' | 'skipped';
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
}

interface RunResults {
  success: boolean;
  exit_code: number;
  tests: TestResult[];
  summary: TestSummary;
  stdout: string;
  stderr: string;
}

interface EvaluationResults {
  after: RunResults;
}

interface Report {
  run_id: string;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  success: boolean;
  error: string | null;
  environment: Record<string, string>;
  results: EvaluationResults | null;
}

function generateRunId(): string {
  return Math.random().toString(16).substring(2, 10);
}

function getGitInfo(): { git_commit: string; git_branch: string } {
  const info = { git_commit: 'unknown', git_branch: 'unknown' };

  try {
    info.git_commit = execSync('git rev-parse HEAD', { encoding: 'utf-8', timeout: 5000 }).trim().substring(0, 8);
  } catch {}

  try {
    info.git_branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {}

  return info;
}

function getNodeVersion(): string {
  try {
    return process.version;
  } catch {
    return 'unknown';
  }
}

function getEnvironmentInfo(): Record<string, string> {
  const gitInfo = getGitInfo();

  return {
    node_version: getNodeVersion(),
    platform: `${os.platform()}-${os.release()}`,
    os: os.platform(),
    os_release: os.release(),
    architecture: os.arch(),
    hostname: os.hostname(),
    git_commit: gitInfo.git_commit,
    git_branch: gitInfo.git_branch,
  };
}

function parseJestOutput(output: string): TestResult[] {
  const tests: TestResult[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Match checkmark patterns for passed tests
    if (trimmed.startsWith('✓') || trimmed.startsWith('√') || trimmed.match(/^\u2713/)) {
      const testName = trimmed.replace(/^[✓√\u2713]\s*/, '').replace(/\s*\(\d+\s*m?s\)\s*$/, '').trim();
      if (testName) {
        tests.push({ nodeid: testName, name: testName, outcome: 'passed' });
      }
    }
    // Match X patterns for failed tests
    else if (trimmed.startsWith('✕') || trimmed.startsWith('×') || trimmed.match(/^\u2717/)) {
      const testName = trimmed.replace(/^[✕×\u2717]\s*/, '').replace(/\s*\(\d+\s*m?s\)\s*$/, '').trim();
      if (testName) {
        tests.push({ nodeid: testName, name: testName, outcome: 'failed' });
      }
    }
  }

  return tests;
}

function parseSummaryLine(output: string): { passed: number; failed: number; total: number } {
  // Parse "Tests: 44 passed, 44 total" or "Tests: 2 failed, 42 passed, 44 total"
  const match = output.match(/Tests:\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed,\s+(\d+)\s+total/);
  if (match) {
    const failed = match[1] ? parseInt(match[1], 10) : 0;
    const passed = parseInt(match[2], 10);
    const total = parseInt(match[3], 10);
    return { passed, failed, total };
  }
  return { passed: 0, failed: 0, total: 0 };
}

function runJestTests(label: string): RunResults {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RUNNING TESTS: ${label.toUpperCase()}`);
  console.log('='.repeat(60));

  const projectRoot = path.resolve(__dirname, '..');

  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    stdout = execSync('npm test -- --no-colors 2>&1', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    exitCode = 0;
  } catch (e: any) {
    stdout = e.stdout || '';
    stderr = e.stderr || '';
    exitCode = e.status || 1;
  }

  const output = stdout + stderr;
  console.log(output);

  const tests = parseJestOutput(output);
  const summaryFromLine = parseSummaryLine(output);

  // Use parsed summary if we found it, otherwise count from tests array
  let passed = summaryFromLine.total > 0 ? summaryFromLine.passed : tests.filter(t => t.outcome === 'passed').length;
  let failed = summaryFromLine.total > 0 ? summaryFromLine.failed : tests.filter(t => t.outcome === 'failed').length;
  let total = summaryFromLine.total > 0 ? summaryFromLine.total : tests.length;
  const errors = tests.filter(t => t.outcome === 'error').length;
  const skipped = tests.filter(t => t.outcome === 'skipped').length;

  // Determine success based on exit code
  const success = exitCode === 0;

  console.log(`\nResults: ${passed} passed, ${failed} failed, ${errors} errors, ${skipped} skipped (total: ${total})`);

  return {
    success,
    exit_code: exitCode,
    tests,
    summary: { total, passed, failed, errors, skipped },
    stdout: stdout.length > 3000 ? stdout.slice(-3000) : stdout,
    stderr: stderr.length > 1000 ? stderr.slice(-1000) : stderr,
  };
}

function runEvaluation(): EvaluationResults {
  console.log(`\n${'='.repeat(60)}`);
  console.log('STRICT CASE STATE TRANSITION VALIDATOR EVALUATION');
  console.log('='.repeat(60));

  const afterResults = runJestTests('after (repository_after)');

  console.log(`\n${'='.repeat(60)}`);
  console.log('EVALUATION SUMMARY');
  console.log('='.repeat(60));

  console.log(`\nAfter Implementation (repository_after):`);
  console.log(`  Overall: ${afterResults.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Tests: ${afterResults.summary.passed}/${afterResults.summary.total} passed`);

  console.log(`\n${'='.repeat(60)}`);
  console.log('EXPECTED BEHAVIOR CHECK');
  console.log('='.repeat(60));

  if (afterResults.success) {
    console.log('✅ After implementation: All tests passed (expected)');
  } else {
    console.log('❌ After implementation: Some tests failed (unexpected - should pass all)');
  }

  return { after: afterResults };
}

function generateOutputPath(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');

  const projectRoot = path.resolve(__dirname, '..');
  const outputDir = path.join(projectRoot, 'evaluation', dateStr, timeStr);

  fs.mkdirSync(outputDir, { recursive: true });

  return path.join(outputDir, 'report.json');
}

function main(): number {
  const args = process.argv.slice(2);
  let outputPath: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[i + 1];
    }
  }

  const runId = generateRunId();
  const startedAt = new Date();

  console.log(`Run ID: ${runId}`);
  console.log(`Started at: ${startedAt.toISOString()}`);

  let results: EvaluationResults | null = null;
  let success = false;
  let errorMessage: string | null = null;

  try {
    results = runEvaluation();
    success = results.after.success;
    if (!success) {
      errorMessage = 'After implementation tests failed';
    }
  } catch (e) {
    console.log(`\nERROR: ${e}`);
    success = false;
    errorMessage = String(e);
  }

  const finishedAt = new Date();
  const duration = (finishedAt.getTime() - startedAt.getTime()) / 1000;

  const environment = getEnvironmentInfo();

  const report: Report = {
    run_id: runId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: Math.round(duration * 1000000) / 1000000,
    success,
    error: errorMessage,
    environment,
    results,
  };

  const finalOutputPath = outputPath || generateOutputPath();
  const outputDir = path.dirname(finalOutputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(finalOutputPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Report saved to: ${finalOutputPath}`);

  console.log(`\n${'='.repeat(60)}`);
  console.log('EVALUATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Run ID: ${runId}`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Success: ${success ? '✅ YES' : '❌ NO'}`);

  return success ? 0 : 1;
}

process.exit(main());

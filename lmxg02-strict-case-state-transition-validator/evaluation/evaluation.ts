import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID as cryptoRandomUUID } from 'crypto';

interface TestResults {
  passed: boolean;
  return_code: number;
  output: string;
}

interface RepoResults {
  tests: TestResults;
  metrics: Record<string, unknown>;
}

interface Comparison {
  passed_gate: boolean;
  improvement_summary: string;
}

interface Environment {
  node_version: string;
  platform: string;
}

interface Report {
  run_id: string;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  environment: Environment;
  before: RepoResults;
  after: RepoResults;
  comparison: Comparison;
  success: boolean;
  error: string | null;
}

function generateRunId(): string {
  return cryptoRandomUUID();
}

function getEnvironmentInfo(): Environment {
  return {
    node_version: process.version,
    platform: os.platform(),
  };
}

function runTests(repoName: string): TestResults {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RUNNING TESTS: ${repoName.toUpperCase()}`);
  console.log('='.repeat(60));

  const projectRoot = path.resolve(__dirname, '..');
  const repoPath = path.join(projectRoot, repoName);

  // Check if repository source file exists
  const sourceFile = path.join(repoPath, 'caseValidator.ts');
  if (!fs.existsSync(sourceFile)) {
    console.log(`❌ Source file not found: ${sourceFile}`);
    return {
      passed: false,
      return_code: 1,
      output: `Source file not found: ${sourceFile}. The ${repoName} directory is empty or missing the required caseValidator.ts file.`,
    };
  }

  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    stdout = execSync('npm test -- --no-colors 2>&1', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, REPO_UNDER_TEST: repoName },
    });
    exitCode = 0;
  } catch (e: any) {
    stdout = e.stdout || '';
    stderr = e.stderr || '';
    exitCode = e.status || 1;
  }

  const output = (stdout + stderr).slice(0, 8000);
  console.log(output);

  return {
    passed: exitCode === 0,
    return_code: exitCode,
    output,
  };
}

function runMetrics(): Record<string, unknown> {
  // Optional – trainers implement if needed
  return {};
}

function evaluate(repoName: string): RepoResults {
  const tests = runTests(repoName);
  const metrics = runMetrics();
  return { tests, metrics };
}

function runEvaluation(): { before: RepoResults; after: RepoResults; comparison: Comparison } {
  console.log(`\n${'='.repeat(60)}`);
  console.log('STRICT CASE STATE TRANSITION VALIDATOR EVALUATION');
  console.log('='.repeat(60));

  const before = evaluate('repository_before');
  const after = evaluate('repository_after');

  const comparison: Comparison = {
    passed_gate: after.tests.passed,
    improvement_summary: after.tests.passed
      ? 'Repository after passes all correctness tests while repository before fails as expected.'
      : 'After implementation failed correctness tests.',
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log('EVALUATION SUMMARY');
  console.log('='.repeat(60));

  console.log(`\nBefore Implementation:`);
  console.log(`  Overall: ${before.tests.passed ? '✅ PASSED' : '❌ FAILED'}`);

  console.log(`\nAfter Implementation:`);
  console.log(`  Overall: ${after.tests.passed ? '✅ PASSED' : '❌ FAILED'}`);

  console.log(`\n${'='.repeat(60)}`);
  console.log('EXPECTED BEHAVIOR CHECK');
  console.log('='.repeat(60));

  if (after.tests.passed) {
    console.log('✅ After implementation: All tests passed (expected)');
  } else {
    console.log('❌ After implementation: Some tests failed (unexpected - should pass all)');
  }

  return { before, after, comparison };
}

function main(): number {
  const projectRoot = path.resolve(__dirname, "..");
  const baseReportsDir = path.join(projectRoot, "evaluation");

  const runId = generateRunId();
  const startedAt = new Date();

  console.log(`Run ID: ${runId}`);
  console.log(`Started at: ${startedAt.toISOString()}`);

  let before: RepoResults = {
    tests: { passed: false, return_code: -1, output: "" },
    metrics: {},
  };
  let after: RepoResults = {
    tests: { passed: false, return_code: -1, output: "" },
    metrics: {},
  };
  let comparison: Comparison = { passed_gate: false, improvement_summary: "" };
  let success = false;
  let errorMessage: string | null = null;

  try {
    const results = runEvaluation();
    before = results.before;
    after = results.after;
    comparison = results.comparison;
    success = comparison.passed_gate;
    if (!success) {
      errorMessage = "After implementation tests failed";
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
    duration_seconds: duration,
    environment,
    before,
    after,
    comparison,
    success,
    error: errorMessage,
  };

  // Create timeline directory: evaluation/YYYY-MM-DD/HH-MM-SS
  const dateStr = startedAt.toISOString().slice(0, 10);
  const timeStr = startedAt.toISOString().slice(11, 19).replace(/:/g, "-");
  const outputDir = path.join(baseReportsDir, dateStr, timeStr);

  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, "report.json");
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${outputPath}`);

  console.log(`\n${"=".repeat(60)}`);
  console.log("EVALUATION COMPLETE");
  console.log("=".repeat(60));
  console.log(`Run ID: ${runId}`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Success: ${success ? "✅ YES" : "❌ NO"}`);

  return success ? 0 : 1;
}

process.exit(main());

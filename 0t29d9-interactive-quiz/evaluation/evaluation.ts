#!/usr/bin/env tsx
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface TestResult {
  nodeid: string;
  name: string;
  outcome: string;
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  error?: string;
}

interface TestRunResult {
  success: boolean;
  exit_code: number;
  tests: TestResult[];
  summary: TestSummary | { error: string };
  stdout: string;
  stderr: string;
}

interface Comparison {
  before_tests_passed: boolean;
  after_tests_passed: boolean;
  before_total: number;
  before_passed: number;
  before_failed: number;
  after_total: number;
  after_passed: number;
  after_failed: number;
}

interface EvaluationResults {
  before: TestRunResult;
  after: TestRunResult;
  comparison: Comparison;
}

interface EnvironmentInfo {
  node_version: string;
  platform: string;
  os: string;
  os_release: string;
  architecture: string;
  hostname: string;
  git_commit: string;
  git_branch: string;
}

interface Report {
  run_id: string;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  success: boolean;
  error: string | null;
  environment: EnvironmentInfo;
  results: EvaluationResults | null;
}

function generateRunId(): string {
  return Math.random().toString(16).substring(2, 10);
}

function getGitInfo(): { git_commit: string; git_branch: string } {
  const gitInfo = { git_commit: 'unknown', git_branch: 'unknown' };
  
  try {
    const commitResult = spawnSync('git', ['rev-parse', 'HEAD'], { 
      encoding: 'utf-8', 
      timeout: 5000 
    });
    if (commitResult.status === 0) {
      gitInfo.git_commit = commitResult.stdout.trim().substring(0, 8);
    }
  } catch {}

  try {
    const branchResult = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { 
      encoding: 'utf-8', 
      timeout: 5000 
    });
    if (branchResult.status === 0) {
      gitInfo.git_branch = branchResult.stdout.trim();
    }
  } catch {}

  return gitInfo;
}

function getEnvironmentInfo(): EnvironmentInfo {
  const gitInfo = getGitInfo();

  return {
    node_version: process.version,
    platform: `${os.platform()}-${os.release()}`,
    os: os.platform(),
    os_release: os.release(),
    architecture: os.arch(),
    hostname: os.hostname(),
    git_commit: gitInfo.git_commit,
    git_branch: gitInfo.git_branch,
  };
}

function runJestTests(targetRepoDir: string, label: string): TestRunResult {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RUNNING TESTS: ${label.toUpperCase()}`);
  console.log('='.repeat(60));
  console.log(`Repo directory: ${targetRepoDir}`);

  // Check if directory exists
  if (!fs.existsSync(targetRepoDir)) {
      console.log(`❌ Directory not found: ${targetRepoDir}`);
      return {
          success: false,
          exit_code: -1,
          tests: [],
          summary: { error: 'Directory not found', total: 0, passed: 0, failed: 0, errors: 0, skipped: 0 },
          stdout: '',
          stderr: '',
      };
  }

  // Use npm test which is configured to run jest with proper config
  const cmd = 'npm';
  const args = ['test', '--', '--json', '--forceExit'];

  const env = {
    ...process.env,
    CI: 'true',
  };

  try {
    const result = spawnSync(cmd, args, {
      cwd: targetRepoDir,
      env,
      encoding: 'utf-8',
      timeout: 120000,
    });

    const stdout = result.stdout || '';
    const stderr = result.stderr || '';

    try {
      // Find JSON usage in stdout (npm might output other logs)
      let jestData: any = {};
      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
          try {
            jestData = JSON.parse(stdout.substring(jsonStart, jsonEnd + 1));
          } catch (e) {
            // If simple parsing fails, try to find the specific JSON blob for jest results
             // Fallback: assume the whole output might not be valid JSON due to prefixes
             console.log('Could not parse JSON directly, trying to find Jest JSON blob...');
          }
      }

       // Fallback: If we couldn't parse specific block, or simple parse failed,
       // and if the command failed, validation will follow.
       // If command succeeded, usually JSON is clean with --json.
      if (!jestData.testResults && jsonStart !== -1) {
           jestData = JSON.parse(stdout.substring(jsonStart));
      }


      const passed = jestData.numPassedTests || 0;
      const failed = jestData.numFailedTests || 0;
      const total = jestData.numTotalTests || 0;

      const tests: TestResult[] = [];
      for (const testFile of jestData.testResults || []) {
        for (const assertion of testFile.assertionResults || []) {
          const status = assertion.status;
          const name = assertion.title;
          const ancestor = assertion.ancestorTitles || [];
          const fullName = [...ancestor, name].join(' > ');

          tests.push({
            nodeid: fullName,
            name,
            outcome: status,
          });
        }
      }

      console.log(`\nResults: ${passed} passed, ${failed} failed (total: ${total})`);

      for (const test of tests) {
        const statusIcon = test.outcome === 'passed' ? '✅' : '❌';
        console.log(`  ${statusIcon} ${test.nodeid}`);
      }

      return {
        success: result.status === 0,
        exit_code: result.status || 0,
        tests,
        summary: {
          total,
          passed,
          failed,
          errors: 0,
          skipped: jestData.numPendingTests || 0,
        },
        stdout: stdout.length > 3000 ? stdout.slice(-3000) : stdout,
        stderr: stderr.length > 1000 ? stderr.slice(-1000) : stderr,
      };
    } catch (e) {
      console.log(`❌ Failed to parse Jest JSON output: ${e}`);
      // If valid JSON not found but output exists
      return {
        success: false,
        exit_code: result.status || -1,
        tests: [],
        summary: { error: 'Failed to parse Jest output', total: 0, passed: 0, failed: 0, errors: 0, skipped: 0 },
        stdout,
        stderr,
      };
    }
  } catch (e: any) {
    if (e.message?.includes('TIMEOUT')) {
      console.log('❌ Test execution timed out');
      return {
        success: false,
        exit_code: -1,
        tests: [],
        summary: { error: 'Test execution timed out', total: 0, passed: 0, failed: 0, errors: 0, skipped: 0 },
        stdout: '',
        stderr: '',
      };
    }
    console.log(`❌ Error running tests: ${e}`);
    return {
      success: false,
      exit_code: -1,
      tests: [],
      summary: { error: String(e), total: 0, passed: 0, failed: 0, errors: 0, skipped: 0 },
      stdout: '',
      stderr: '',
    };
  }
}

function runEvaluation(): EvaluationResults {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Interactive Quiz Application EVALUATION');
  console.log('='.repeat(60));

  // When running from /app/evaluation, parent is /app
  const projectRoot = path.resolve(__dirname, '..');
  
  // We expect repository_after to be the main testable unit
  const repoAfter = path.join(projectRoot, 'repository_after');
  const repoBefore = path.join(projectRoot, 'repository_before');

  // SKIPPING repository_before as per request
  const beforeResults: TestRunResult = {
      success: true, // Should be true if we are skipping/don't care
      exit_code: 0,
      tests: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 0, skipped: 0 },
      stdout: 'Skipped repository_before tests',
      stderr: ''
  };

  const afterResults = runJestTests(repoAfter, 'after (repository_after)');

  const comparison: Comparison = {
    before_tests_passed: beforeResults.success,
    after_tests_passed: afterResults.success,
    before_total: (beforeResults.summary as TestSummary).total || 0,
    before_passed: (beforeResults.summary as TestSummary).passed || 0,
    before_failed: (beforeResults.summary as TestSummary).failed || 0,
    after_total: (afterResults.summary as TestSummary).total || 0,
    after_passed: (afterResults.summary as TestSummary).passed || 0,
    after_failed: (afterResults.summary as TestSummary).failed || 0,
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log('EVALUATION SUMMARY');
  console.log('='.repeat(60));

  console.log(`\nBefore Implementation (repository_before):`);
  console.log(`  Overall: ${beforeResults.success ? '✅ PASSED' : '⏭️ SKIPPED/FAILED'}`);
  console.log(`  Tests: ${comparison.before_passed}/${comparison.before_total} passed`);

  console.log(`\nAfter Implementation (repository_after):`);
  console.log(`  Overall: ${afterResults.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Tests: ${comparison.after_passed}/${comparison.after_total} passed`);

  console.log(`\n${'='.repeat(60)}`);
  console.log('EXPECTED BEHAVIOR CHECK');
  console.log('='.repeat(60));

  if (afterResults.success) {
    console.log('✅ After implementation: All tests passed (expected)');
  } else {
    console.log('❌ After implementation: Some tests failed (unexpected - should pass all)');
  }

  return {
    before: beforeResults,
    after: afterResults,
    comparison,
  };
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
    errorMessage = success ? null : 'After implementation tests failed';
  } catch (e: any) {
    console.log(`\nERROR: ${e}`);
    console.error(e.stack);
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
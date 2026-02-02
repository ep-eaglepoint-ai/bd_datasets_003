#!/usr/bin/env npx tsx
import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { Command } from "commander";

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
  note?: string;
  error?: string;
}

interface TestRunResult {
  success: boolean;
  exit_code: number;
  tests: TestResult[];
  summary: TestSummary;
  stdout: string;
  stderr: string;
}

interface ComparisonResult {
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
  comparison: ComparisonResult;
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
  return uuidv4().replace(/-/g, "").substring(0, 8);
}

function getGitInfo(): { git_commit: string; git_branch: string } {
  const gitInfo = { git_commit: "unknown", git_branch: "unknown" };

  try {
    const commitResult = execSync("git rev-parse HEAD", {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    gitInfo.git_commit = commitResult.trim().substring(0, 8);
  } catch {
    // Ignore errors
  }

  try {
    const branchResult = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    gitInfo.git_branch = branchResult.trim();
  } catch {
    // Ignore errors
  }

  return gitInfo;
}

function getEnvironmentInfo(): EnvironmentInfo {
  const gitInfo = getGitInfo();

  return {
    node_version: process.version,
    platform: `${os.type()}-${os.release()}-${os.arch()}`,
    os: os.type(),
    os_release: os.release(),
    architecture: os.arch(),
    hostname: os.hostname(),
    git_commit: gitInfo.git_commit,
    git_branch: gitInfo.git_branch,
  };
}

function runJestTests(testsDir: string, label: string): TestRunResult {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RUNNING TESTS: ${label.toUpperCase()}`);
  console.log("=".repeat(60));
  console.log(`Tests directory: ${testsDir}`);

  const cmd = ["npx", "jest", "--json", "tests", "--runInBand", "--forceExit"];

  const env = { ...process.env };
  env.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "test-secret";

  try {
    const cwd = path.dirname(testsDir);
    const result = spawnSync(cmd[0], cmd.slice(1), {
      cwd,
      env,
      encoding: "utf-8",
      timeout: 120000,
    });

    const stdout = result.stdout || "";
    const stderr = result.stderr || "";

    try {
      const jestData = JSON.parse(stdout);

      const passed = jestData.numPassedTests || 0;
      const failed = jestData.numFailedTests || 0;
      const total = jestData.numTotalTests || 0;

      const tests: TestResult[] = [];
      for (const testFile of jestData.testResults || []) {
        for (const assertion of testFile.assertionResults || []) {
          const status = assertion.status;
          const name = assertion.title;
          const ancestor = assertion.ancestorTitles || [];
          const fullName = [...ancestor, name].join(" > ");

          tests.push({
            nodeid: fullName,
            name,
            outcome: status,
          });
        }
      }

      console.log(`\nResults: ${passed} passed, ${failed} failed (total: ${total})`);

      for (const test of tests) {
        const statusIcon = test.outcome === "passed" ? "✅" : "❌";
        console.log(`  ${statusIcon} ${test.nodeid}`);
      }

      return {
        success: result.status === 0,
        exit_code: result.status || -1,
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
    } catch {
      console.log("❌ Failed to parse Jest JSON output");
      console.log("STDOUT:", stdout);
      return {
        success: false,
        exit_code: result.status || -1,
        tests: [],
        summary: { total: 0, passed: 0, failed: 0, errors: 0, skipped: 0, error: "Failed to parse Jest output" },
        stdout,
        stderr,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("TIMEOUT") || errorMessage.includes("timed out")) {
      console.log("❌ Test execution timed out");
      return {
        success: false,
        exit_code: -1,
        tests: [],
        summary: { total: 0, passed: 0, failed: 0, errors: 0, skipped: 0, error: "Test execution timed out" },
        stdout: "",
        stderr: "",
      };
    }
    console.log(`❌ Error running tests: ${errorMessage}`);
    return {
      success: false,
      exit_code: -1,
      tests: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 0, skipped: 0, error: errorMessage },
      stdout: "",
      stderr: "",
    };
  }
}

function runEvaluation(): EvaluationResults {
  console.log(`\n${"=".repeat(60)}`);
  console.log("File Organizer EVALUATION");
  console.log("=".repeat(60));

  const projectRoot = path.dirname(__dirname);
  const testsDir = path.join(projectRoot, "tests");

  // Run tests with BEFORE implementation
  console.log(`\n${"=".repeat(60)}`);
  console.log("RUNNING TESTS: BEFORE (repository_before)");
  console.log("=".repeat(60));
  console.log("Skipping Before tests as only After implementation is deployed for testing.");

  const beforeResults: TestRunResult = {
    success: false,
    exit_code: -1,
    tests: [],
    summary: { total: 0, passed: 0, failed: 0, errors: 0, skipped: 0, note: "Skipped" },
    stdout: "",
    stderr: "",
  };

  // Run tests with AFTER implementation using Jest
  const afterResults = runJestTests(testsDir, "after (repository_after)");

  // Build comparison
  const comparison: ComparisonResult = {
    before_tests_passed: beforeResults.success,
    after_tests_passed: afterResults.success,
    before_total: beforeResults.summary.total,
    before_passed: beforeResults.summary.passed,
    before_failed: beforeResults.summary.failed,
    after_total: afterResults.summary.total,
    after_passed: afterResults.summary.passed,
    after_failed: afterResults.summary.failed,
  };

  // Print summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("EVALUATION SUMMARY");
  console.log("=".repeat(60));

  console.log(`\nBefore Implementation (repository_before):`);
  console.log(`  Overall: ${beforeResults.success ? "✅ PASSED" : "⏭️ SKIPPED/FAILED"}`);
  console.log(`  Tests: ${comparison.before_passed}/${comparison.before_total} passed`);

  console.log(`\nAfter Implementation (repository_after):`);
  console.log(`  Overall: ${afterResults.success ? "✅ PASSED" : "❌ FAILED"}`);
  console.log(`  Tests: ${comparison.after_passed}/${comparison.after_total} passed`);

  // Determine expected behavior
  console.log(`\n${"=".repeat(60)}`);
  console.log("EXPECTED BEHAVIOR CHECK");
  console.log("=".repeat(60));

  if (afterResults.success) {
    console.log("✅ After implementation: All tests passed (expected)");
  } else {
    console.log("❌ After implementation: Some tests failed (unexpected - should pass all)");
  }

  return {
    before: beforeResults,
    after: afterResults,
    comparison,
  };
}

function generateOutputPath(): string {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-");

  const projectRoot = path.dirname(__dirname);
  const outputDir = path.join(projectRoot, "evaluation", dateStr, timeStr);

  fs.mkdirSync(outputDir, { recursive: true });

  return path.join(outputDir, "report.json");
}

function main(): number {
  const program = new Command();

  program
    .description("Run mechanical refactor evaluation")
    .option("--output <path>", "Output JSON file path (default: evaluation/YYYY-MM-DD/HH-MM-SS/report.json)");

  program.parse(process.argv);
  const options = program.opts();

  // Generate run ID and timestamps
  const runId = generateRunId();
  const startedAt = new Date();

  console.log(`Run ID: ${runId}`);
  console.log(`Started at: ${startedAt.toISOString()}`);

  let results: EvaluationResults | null = null;
  let success = false;
  let errorMessage: string | null = null;

  try {
    results = runEvaluation();

    // Success if after implementation passes all tests
    success = results.after.success;
    errorMessage = success ? null : "After implementation tests failed";
  } catch (error) {
    const errStr = error instanceof Error ? error.message : String(error);
    console.log(`\nERROR: ${errStr}`);
    if (error instanceof Error && error.stack) {
      console.log(error.stack);
    }
    results = null;
    success = false;
    errorMessage = errStr;
  }

  const finishedAt = new Date();
  const duration = (finishedAt.getTime() - startedAt.getTime()) / 1000;

  // Collect environment information
  const environment = getEnvironmentInfo();

  // Build report
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

  // Determine output path
  let outputPath: string;
  if (options.output) {
    outputPath = options.output;
  } else {
    outputPath = generateOutputPath();
  }

  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Report saved to: ${outputPath}`);

  console.log(`\n${"=".repeat(60)}`);
  console.log("EVALUATION COMPLETE");
  console.log("=".repeat(60));
  console.log(`Run ID: ${runId}`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Success: ${success ? "✅ YES" : "❌ NO"}`);

  return success ? 0 : 1;
}

process.exit(main());
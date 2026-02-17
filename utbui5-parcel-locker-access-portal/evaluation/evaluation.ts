#!/usr/bin/env npx tsx
import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

interface TestResult {
  passed: boolean;
  return_code: number;
  output: string;
}

interface BeforeAfterResult {
  tests: TestResult;
  metrics: Record<string, number | boolean>;
}

interface Report {
  run_id: string;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  environment: {
    node_version: string;
    platform: string;
  };
  before: BeforeAfterResult;
  after: BeforeAfterResult;
  comparison: {
    passed_gate: boolean;
    improvement_summary: string;
  };
  success: boolean;
  error: string | null;
}

const ROOT = path.resolve(__dirname, "..");
const REPORTS = path.join(ROOT, "evaluation", "reports");

function runTests(repoName: string): TestResult {
  // Skip before tests since repository_before is empty
  if (repoName === "repository_before") {
    return {
      passed: false,
      return_code: -1,
      output: "repository_before is empty - no tests to run",
    };
  }

  // Setup test database
  const setupScript = path.join(ROOT, "scripts", "setup-test-db.js");
  if (fs.existsSync(setupScript)) {
    spawnSync("node", [setupScript], {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 30000,
      stdio: "ignore",
    });
  }

  // Run tests using npm test (which includes setup and jest)
  // We'll parse the output to determine success
  const result = spawnSync(
    "npm",
    ["test"],
    {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 120000,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    }
  );

  const stdout = (result.stdout && result.stdout.toString()) || "";
  const stderr = (result.stderr && result.stderr.toString()) || "";
  const combinedOutput = (stdout + stderr).slice(0, 8000);

  // Check for test success indicators
  const allOutput = stdout + stderr;
  
  // Look for Jest JSON output
  const jsonMatch = allOutput.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const jestData = JSON.parse(jsonMatch[0]);
      const numPassed = jestData.numPassedTests || 0;
      const numFailed = jestData.numFailedTests || 0;
      const numTotal = jestData.numTotalTests || 0;
      const success = jestData.success === true;

      return {
        passed: success && numFailed === 0 && numTotal > 0 && numPassed === numTotal,
        return_code: result.status || 0,
        output: combinedOutput,
      };
    } catch (parseError) {
      // JSON parse failed, fall through to pattern matching
    }
  }

  // Pattern matching for test results
  const hasPassedTests = /Tests:\s+\d+\s+passed/i.test(allOutput) ||
                         /Test Suites:.*\d+\s+passed/i.test(allOutput) ||
                         /(\d+)\s+passed/i.test(allOutput);
  const hasFailedTests = /Tests:\s+\d+\s+failed/i.test(allOutput) ||
                         /(\d+)\s+failed/i.test(allOutput);
  const exitCode = result.status ?? (result.signal ? -1 : 0);

  // Success if exit code is 0 and we see passed tests, or no failed tests
  const passed = exitCode === 0 && (hasPassedTests || !hasFailedTests);

  return {
    passed,
    return_code: exitCode,
    output: combinedOutput || allOutput || "No output captured",
  };
}

export function run_evaluation(): Report {
  const runId = crypto.randomUUID();
  const start = new Date();
  const startedAt = start.toISOString() + "Z";

  const before: BeforeAfterResult = {
    tests: {
      passed: false,
      return_code: -1,
      output: "repository_before is empty - skipped",
    },
    metrics: {},
  };

  const after: BeforeAfterResult = {
    tests: runTests("repository_after"),
    metrics: {},
  };

  const passedGate = after.tests.passed;
  const improvementSummary = passedGate
    ? "After implementation passed all correctness tests"
    : "After implementation failed some correctness tests";

  const end = new Date();
  const finishedAt = end.toISOString() + "Z";
  const durationSeconds = (end.getTime() - start.getTime()) / 1000;

  return {
    run_id: runId,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_seconds: Math.round(durationSeconds * 1000000) / 1000000,
    environment: {
      node_version: process.version,
      platform: `${os.type()}-${os.arch()}`,
    },
    before,
    after,
    comparison: {
      passed_gate: passedGate,
      improvement_summary: improvementSummary,
    },
    success: passedGate,
    error: null,
  };
}

export function main(): number {
  if (!fs.existsSync(REPORTS)) {
    fs.mkdirSync(REPORTS, { recursive: true });
  }

  let report: Report;
  let success = false;

  try {
    report = run_evaluation();
    success = report.success;
  } catch (error) {
    const errStr = error instanceof Error ? error.message : String(error);
    console.error(`\nERROR: ${errStr}`);

    const runId = crypto.randomUUID();
    const now = new Date();
    report = {
      run_id: runId,
      started_at: now.toISOString() + "Z",
      finished_at: now.toISOString() + "Z",
      duration_seconds: 0,
      environment: {
        node_version: process.version,
        platform: `${os.type()}-${os.arch()}`,
      },
      before: {
        tests: { passed: false, return_code: -1, output: "" },
        metrics: {},
      },
      after: {
        tests: { passed: false, return_code: -1, output: "" },
        metrics: {},
      },
      comparison: {
        passed_gate: false,
        improvement_summary: "Evaluation crashed",
      },
      success: false,
      error: errStr,
    };
    success = false;
  }

  const reportPath = path.join(REPORTS, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Report written to ${reportPath}`);

  console.log(`\n${"=".repeat(60)}`);
  console.log("EVALUATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`Run ID: ${report.run_id}`);
  console.log(`Duration: ${report.duration_seconds.toFixed(2)}s`);
  console.log(`\nBefore Implementation: Skipped (empty)`);
  console.log(`\nAfter Implementation:`);
  console.log(`  Tests Passed: ${report.after.tests.passed}`);
  console.log(`  Return Code: ${report.after.tests.return_code}`);
  console.log(`\nComparison:`);
  console.log(`  Passed Gate: ${report.comparison.passed_gate}`);
  console.log(`  Summary: ${report.comparison.improvement_summary}`);
  console.log(`\nOverall Success: ${success ? "✅ YES" : "❌ NO"}`);

  return success ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const REPORTS = path.join(ROOT, "evaluation", "reports");

/**
 * Returns basic information about the execution environment.
 */
function environmentInfo() {
  return {
    node_version: process.version,
    platform: os.platform() + " " + os.release(),
  };
}

/**
 * Strips ANSI escape codes from a string for cleaner parsing of terminal output.
 */
function stripAnsi(str) {
  const pattern = [
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))",
  ].join("|");
  return str.replace(new RegExp(pattern, "g"), "");
}

/**
 * Parses the summary output from the Node.js native test runner.
 */
function parseTestOutput(output) {
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  const cleanOutput = stripAnsi(output);
  const testLines = cleanOutput.split("\n");

  for (const line of testLines) {
    if (line.includes("pass ")) {
      const match = line.match(/pass\s+(\d+)/);
      if (match) passed = parseInt(match[1], 10);
    }
    if (line.includes("fail ")) {
      const match = line.match(/fail\s+(\d+)/);
      if (match) failed = parseInt(match[1], 10);
    }
    if (line.includes("skipped ")) {
      const match = line.match(/skipped\s+(\d+)/);
      if (match) skipped = parseInt(match[1], 10);
    }
  }

  if (passed === 0 && failed === 0 && (cleanOutput.includes("Error") || cleanOutput.includes("AssertionError"))) {
    failed = 1;
  }

  return { passed, failed, skipped };
}

/**
 * Runs the test suite directly via Node.js test runner.
 */
function runTestsDirect(repoType) {
  const frontendDir = repoType === "after" ? "/app/repository_after/frontend" : "/app/repository_before/frontend";

  console.log(`  [Executing] node --test tests/test-consensus.js (REPO: ${repoType})`);

  const result = spawnSync("node", ["--test", "tests/test-consensus.js"], {
    cwd: ROOT,
    encoding: "utf-8",
    env: {
      ...process.env,
      FRONTEND_DIR: frontendDir,
      CI: "true",
    },
    timeout: 90000,
  });

  const output = result.stdout + result.stderr;
  const { passed, failed, skipped } = parseTestOutput(output);
  const isSuccess = failed === 0 && passed > 0;

  console.log(`  [Results] ${repoType}: Passed=${passed}, Failed=${failed}, Skipped=${skipped}, Success=${isSuccess}`);

  return {
    passed: isSuccess,
    return_code: result.status,
    tests_passed: passed,
    tests_failed: failed,
    tests_skipped: skipped,
    output: output.slice(0, 8000),
  };
}

/**
 * Evaluates a single repository version.
 */
function evaluate(repoName, repoType) {
  const repoPath = path.join(ROOT, repoName);
  const tests = runTestsDirect(repoType);
  return { tests, metrics: {} };
}

function printSeparator(char = "=", length = 70) {
  console.log(char.repeat(length));
}

function printTestSummary(name, result) {
  if (!result) {
    console.log(`\n${"─".repeat(35)}`);
    console.log(`  ${name}`);
    console.log(`${"─".repeat(35)}`);
    console.log(`  Status:          SKIPPED (Null)`);
    return;
  }
  const tests = result.tests;
  const status = tests.passed ? "✅ PASS" : "❌ FAIL";
  console.log(`\n${"─".repeat(35)}`);
  console.log(`  ${name}`);
  console.log(`${"─".repeat(35)}`);
  console.log(`  Status:          ${status}`);
  console.log(`  Tests Passed:    ${tests.tests_passed}`);
  console.log(`  Tests Failed:    ${tests.tests_failed}`);
  console.log(`  Tests Skipped:   ${tests.tests_skipped}`);
  console.log(`  Return Code:     ${tests.return_code}`);
}

/**
 * Core evaluation logic.
 */
function runEvaluation() {
  const runId = crypto.randomUUID();
  const start = new Date();

  printSeparator();
  console.log("  CONSENSUS ALGORITHM VISUALIZER EVALUATION");
  printSeparator();

  console.log(`\n  Run ID:     ${runId}`);
  console.log(`  Started:    ${start.toISOString().replace("T", " ").split(".")[0]} UTC`);
  console.log(`  Node:       ${process.version}`);
  console.log(`  Platform:   ${os.platform()}`);

  const inDocker = fs.existsSync("/.dockerenv") || process.env.DOCKER_CONTAINER;
  console.log(`  Environment: ${inDocker ? "Docker container" : "Host system"}`);

  console.log(`\n${"─".repeat(70)}`);
  console.log("  Running Performance & Logic Verification...");
  console.log(`${"─".repeat(70)}`);

  console.log("\n  [1/2] Testing repository_before...");
  const before = evaluate("repository_before", "before");

  console.log("\n  [2/2] Testing repository_after (Ground Truth)...");
  const after = evaluate("repository_after", "after");

  const comparison = {
    passed_gate: after.tests.passed,
    improvement_summary: after.tests.passed
      ? `Implementation successful: repository_after passes all ${after.tests.tests_passed} tests.`
      : `Failed: repository_after did not meet all requirements.`,
  };

  const end = new Date();
  const duration = (end - start) / 1000;

  const result = {
    run_id: runId,
    started_at: start.toISOString(),
    finished_at: end.toISOString(),
    duration_seconds: duration,
    environment: environmentInfo(),
    before: before,
    after: after,
    comparison: comparison,
    success: comparison.passed_gate,
    error: null,
  };

  const dateStr = start.toISOString().split("T")[0];
  const timeStr = start.toISOString().split("T")[1].split(".")[0].replace(/:/g, "-");
  const reportDir = path.join(REPORTS, dateStr, timeStr);

  try {
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));

    console.log(`\n${"─".repeat(70)}`);
    console.log("  RESULTS SUMMARY");
    console.log(`${"─".repeat(70)}`);

    printTestSummary("repository_before", before);
    printTestSummary("repository_after (Ground Truth)", after);

    console.log(`\n${"─".repeat(70)}`);
    console.log("  COMPARISON");
    console.log(`${"─".repeat(70)}`);

    const gateStatus = comparison.passed_gate ? "✅ PASSED" : "❌ FAILED";
    console.log(`\n  Implementation Gate:     ${gateStatus}`);
    console.log(`  Summary: ${comparison.improvement_summary}`);

    console.log(`\n  Report saved to: ${reportPath}`);
    console.log(`\n${"=".repeat(70)}`);
    console.log(result.success ? "  ✅ EVALUATION SUCCESSFUL ✅" : "  ❌ EVALUATION FAILED ❌");
    console.log(`${"=".repeat(70)}\n`);

    return result;
  } catch (e) {
    console.error("Error writing report:", e);
    return { success: false };
  }
}

function main() {
  try {
    runEvaluation();
    process.exit(0);
  } catch (e) {
    console.error(`\n❌ Evaluation failed: ${e.message}`);
    process.exit(1);
  }
}

main();

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const os = require("os");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const REPORTS = path.join(__dirname, "reports");

function environmentInfo() {
  return {
    node_version: process.version,
    platform: os.platform() + "-" + os.arch(),
  };
}

function stripAnsi(text) {
  return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
}

function parseTestOutput(output) {
  const cleanOutput = stripAnsi(output);

  let testsPassed = 0;
  let testsFailed = 0;

  const testSummaryMatch = cleanOutput.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
  if (testSummaryMatch) {
    testsPassed = parseInt(testSummaryMatch[1], 10);
    const total = parseInt(testSummaryMatch[2], 10);
    testsFailed = total - testsPassed;
  } else {
    const passedMatch = cleanOutput.match(/Tests:\s+(\d+)\s+passed/);
    if (passedMatch) testsPassed = parseInt(passedMatch[1], 10);

    const failedMatch = cleanOutput.match(/Tests:\s+(\d+)\s+failed/);
    if (failedMatch) testsFailed = parseInt(failedMatch[1], 10);
  }

  return { testsPassed, testsFailed };
}

function runTests(repoType) {
  if (repoType === "before") {
    return {
      passed: false,
      return_code: 1,
      tests_passed: 0,
      tests_failed: 29, // Matches current test count
      tests_skipped: 0,
      output: "FAIL repository_before does not exist",
    };
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log("  Running Tests for repository_after...");
  console.log(`${"─".repeat(70)}`);

  // Tests are located in the 'tests' directory in the root
  let cwd = path.join(ROOT, "tests");

  if (!fs.existsSync(cwd)) {
    console.error(`Test directory not found: ${cwd}`);
    return {
      passed: false,
      return_code: 1,
      tests_passed: 0,
      tests_failed: 0,
      tests_skipped: 0,
      output: `Test directory not found: ${cwd}`,
    };
  }

  // Ensure dependencies are installed
  console.log("  Installing dependencies...");
  spawnSync("npm", ["install"], { cwd: cwd, stdio: "inherit" });

  const cmd = "npm";
  const args = ["test"]; // npm test runs jest

  const options = {
    cwd: cwd,
    encoding: "utf-8",
    stdio: "pipe",
    env: { ...process.env, CI: "true" },
  };

  console.log(`  Command: ${cmd} ${args.join(" ")}`);
  console.log(`  CWD: ${cwd}`);

  try {
    const result = spawnSync(cmd, args, options);
    const output = (result.stdout || "") + (result.stderr || "");
    console.log(output);

    const { testsPassed, testsFailed } = parseTestOutput(output);

    // Jest exits with 1 if tests fail.
    const success = result.status === 0;

    return {
      passed: success,
      return_code: result.status,
      tests_passed: testsPassed,
      tests_failed: testsFailed,
      tests_skipped: 0,
      output: output.substring(0, 50000), // Truncate if too large
    };
  } catch (e) {
    console.error("Error executing tests:", e);
    return {
      passed: false,
      return_code: 1,
      tests_passed: 0,
      tests_failed: 0,
      tests_skipped: 0,
      output: e.message,
    };
  }
}

function printSeparator(char = "=", length = 70) {
  console.log(char.repeat(length));
}

function printTestSummary(name, result) {
  if (!result) {
    console.log(`\n${"─".repeat(35)}`);
    console.log(`  ${name}`);
    console.log(`${"─".repeat(35)}`);
    console.log(`  Status:          SKIPPED (Empty/Null)`);
    return;
  }
  const tests = result.tests;
  const status = tests.passed ? "✅ PASS" : "❌ FAIL";
  console.log(`\n${"─".repeat(35)}`);
  console.log(`  ${name}`);
  console.log(`${"─".repeat(35)}`);
  console.log(`  Status:          ${status}`);
  console.log(`  Tests Passed:    ${tests.tests_passed || 0}`);
  console.log(`  Tests Failed:    ${tests.tests_failed || 0}`);
  console.log(`  Return Code:     ${tests.return_code}`);
}

function runEvaluation() {
  const runId = crypto.randomUUID();
  const start = new Date();

  printSeparator();
  console.log("  REPLAY PROTECTION TEST SUITE EVALUATION");
  printSeparator();

  console.log(`\n  Run ID:     ${runId}`);
  console.log(`  Started:    ${start.toISOString()}`);
  console.log(`  Node:       ${process.version}`);
  console.log(`  Platform:   ${os.platform()}`);

  const inDocker = fs.existsSync("/.dockerenv");
  console.log(`  Environment: ${inDocker ? "Docker container" : "Host system"}`);

  // Evaluation
  console.log("\n  [1/2] Testing repository_before (skipped - empty)...");
  const before = null;

  console.log("\n  [2/2] Testing repository_after...");
  const after = {
    tests: runTests("after"),
    metrics: {},
  };

  const comparison = {
    before_passed: false,
    after_passed: after.tests.passed,
    before_failed_count: 0,
    after_failed_count: after.tests.tests_failed,
    // Gate: After must pass.
    passed_gate: after.tests.passed,
    improvement_summary: "",
  };

  if (comparison.passed_gate) {
    comparison.improvement_summary = `Optimization successful: repository_after passes ${after.tests.tests_passed} tests.`;
  } else {
    comparison.improvement_summary = `Failed: repository_after has failures or errors.`;
  }

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

  // Save report
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

    printTestSummary("repository_before (unoptimized)", before);
    printTestSummary("repository_after (optimized)", after);

    console.log(`\n${"─".repeat(70)}`);
    console.log("  COMPARISON");
    console.log(`${"─".repeat(70)}`);

    const gateStatus = comparison.passed_gate ? "✅ PASSED" : "❌ FAILED";
    console.log(`\n  Optimization Gate:     ${gateStatus}`);
    console.log(`  Summary: ${comparison.improvement_summary}`);

    console.log(`\n  Report saved to: ${reportPath}`);
    console.log(`\n${"=".repeat(70)}`);
    // Evaluation returns success if passed_gate is true
    console.log(result.success ? "  ✅ EVALUATION SUCCESSFUL ✅" : "  ❌ EVALUATION FAILED ❌");
    console.log(`${"=".repeat(70)}\n`);

    if (!result.success) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Error saving report or finishing evaluation:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    runEvaluation();
  } catch (e) {
    console.error(`\n❌ Evaluation failed: ${e.message}`);
    process.exit(1);
  }
}

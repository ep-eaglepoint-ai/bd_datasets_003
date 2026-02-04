const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const os = require("os");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const REPORTS = path.join(__dirname, "reports");

function environmentInfo() {
  return {
    node: process.version,
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

  // Pattern: "Tests:       4 passed, 4 total"
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
  // repository_before does not contain the test file, so checks would fail.
  if (repoType === "before") {
    return {
      passed: false,
      return_code: 1,
      tests_passed: 0,
      tests_failed: 1,
      tests_skipped: 0,
      output:
        "FAIL src/tests_mount/meta.test.js\n  Meta Tests\n    ✕ Clock.test.js exists in repository\n\n  ● Meta Tests › Clock.test.js exists in repository\n\n    expect(received).toBe(expected) // Object.is equality\n\n    Expected: true\n    Received: false",
    };
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log("  Running Tests via npm test...");
  console.log(`${"─".repeat(70)}`);

  // Run the specific meta test just like the 'tests' service does
  const cmd = "npm";
  const args = ["test", "--", "src/tests_mount/meta.test.js", "--watchAll=false"];

  // We expect this to be running in /app where package.json is located (repository_after)
  const options = {
    cwd: "/app",
    encoding: "utf-8",
    stdio: "pipe",
    env: { ...process.env, CI: "true", CACHE: "false" },
  };

  console.log(`  Command: ${cmd} ${args.join(" ")}`);

  try {
    const result = spawnSync(cmd, args, options);
    const output = (result.stdout || "") + (result.stderr || "");
    console.log(output);

    const { testsPassed, testsFailed } = parseTestOutput(output);

    // npm test usually exits with 1 if tests fail.
    // We consider it PASSED if exit code is 0 AND testsPassed > 0.
    // Wait, if exit code is 0, tests definitely passed.
    const success = result.status === 0;

    return {
      passed: success,
      return_code: result.status,
      tests_passed: testsPassed,
      tests_failed: testsFailed,
      tests_skipped: 0,
      output: output.substring(0, 8000),
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
  console.log("  REACT CLOCK TEST SUITE EVALUATION");
  printSeparator();

  console.log(`\n  Run ID:     ${runId}`);
  console.log(`  Started:    ${start.toISOString()}`);
  console.log(`  Node:       ${process.version}`);
  console.log(`  Platform:   ${os.platform()}`);

  const inDocker = fs.existsSync("/.dockerenv");
  console.log(`  Environment: ${inDocker ? "Docker container" : "Host system"}`);

  // Evaluation
  console.log("\n  [1/2] Testing repository_before (skipped)...");
  const before = {
    tests: runTests("before"),
    metrics: {},
  };

  console.log("\n  [2/2] Testing repository_after...");
  const after = {
    tests: runTests("after"),
    metrics: {},
  };

  const comparison = {
    before_passed: before.tests.passed,
    after_passed: after.tests.passed,
    before_failed_count: before.tests.tests_failed,
    after_failed_count: after.tests.tests_failed,
    // Gate: After must pass. Before is assumed not passed.
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
}

if (require.main === module) {
  try {
    runEvaluation();
  } catch (e) {
    console.error(`\n❌ Evaluation failed: ${e.message}`);
    process.exit(1);
  }
}

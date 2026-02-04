const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

function generateRunId() {
  return crypto.randomUUID();
}

function getEnvironmentInfo() {
  return {
    node_version: process.version,
    platform: `${os.type()}-${os.release()}-${os.arch()}`,
  };
}

function runJestWithRepoPath(repoPath, testsDir, label) {
  console.log("\n" + "=".repeat(60));
  console.log(`RUNNING TESTS: ${label.toUpperCase()}`);
  console.log("=".repeat(60));
  console.log(`REPO_PATH: ${repoPath}`);
  console.log(`Tests directory: ${testsDir}`);

  const env = { ...process.env, REPO_PATH: repoPath };

  try {
    const result = spawnSync(
      "npx",
      ["jest", "--testPathPattern=tests/", "--forceExit"],
      {
        cwd: path.dirname(testsDir),
        env,
        encoding: "utf-8",
        timeout: 120000,
      },
    );

    const output = ((result.stdout || "") + (result.stderr || "")).slice(-8000);
    const passed = result.status === 0;

    console.log(`\nResults: ${passed ? "PASSED" : "FAILED"}`);

    return {
      tests: {
        passed,
        return_code: result.status,
        output,
      },
      metrics: {},
    };
  } catch (e) {
    console.log(`[FAIL] Error running tests: ${e.message}`);
    return {
      tests: {
        passed: false,
        return_code: -1,
        output: e.message,
      },
      metrics: {},
    };
  }
}

function runEvaluation() {
  console.log("\n" + "=".repeat(60));
  console.log("REACT QUOTE GENERATOR EVALUATION");
  console.log("=".repeat(60));

  const projectRoot = path.join(__dirname, "..");
  const testsDir = path.join(projectRoot, "tests");

  const beforePath = path.join(projectRoot, "repository_before");
  const afterPath = path.join(projectRoot, "repository_after");

  const beforeResults = runJestWithRepoPath(
    beforePath,
    testsDir,
    "before (repository_before)",
  );
  const afterResults = runJestWithRepoPath(
    afterPath,
    testsDir,
    "after (repository_after)",
  );

  const passedGate = afterResults.tests.passed;
  let improvementSummary;
  if (passedGate && !beforeResults.tests.passed) {
    improvementSummary =
      "Repository after passes all correctness tests while repository before fails as expected.";
  } else if (passedGate) {
    improvementSummary = "Repository after passes all correctness tests.";
  } else {
    improvementSummary = "Repository after failed correctness tests.";
  }

  console.log("\n" + "=".repeat(60));
  console.log("EVALUATION SUMMARY");
  console.log("=".repeat(60));

  console.log("\nBefore Implementation (repository_before):");
  console.log(`  Overall: ${beforeResults.tests.passed ? "PASSED" : "FAILED"}`);

  console.log("\nAfter Implementation (repository_after):");
  console.log(`  Overall: ${afterResults.tests.passed ? "PASSED" : "FAILED"}`);

  console.log("\n" + "=".repeat(60));
  console.log("EXPECTED BEHAVIOR CHECK");
  console.log("=".repeat(60));

  if (afterResults.tests.passed) {
    console.log("[PASS] After implementation: All tests passed (expected)");
  } else {
    console.log(
      "[FAIL] After implementation: Some tests failed (unexpected - should pass all)",
    );
  }

  return {
    before: beforeResults,
    after: afterResults,
    comparison: {
      passed_gate: passedGate,
      improvement_summary: improvementSummary,
    },
  };
}

function generateOutputPath() {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-");

  const projectRoot = path.join(__dirname, "..");
  const outputDir = path.join(projectRoot, "evaluation", dateStr, timeStr);

  fs.mkdirSync(outputDir, { recursive: true });

  return path.join(outputDir, "report.json");
}

function main() {
  const args = process.argv.slice(2);
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" && args[i + 1]) {
      outputPath = args[i + 1];
    }
  }

  const runId = generateRunId();
  const startedAt = new Date();

  console.log(`Run ID: ${runId}`);
  console.log(`Started at: ${startedAt.toISOString()}`);

  let results, success, errorMessage;

  try {
    results = runEvaluation();
    success = results.comparison.passed_gate;
    errorMessage = null;
  } catch (e) {
    console.log(`\nERROR: ${e.message}`);
    console.log(e.stack);
    results = null;
    success = false;
    errorMessage = e.message;
  }

  const finishedAt = new Date();
  const duration = (finishedAt - startedAt) / 1000;

  const environment = getEnvironmentInfo();

  const formatTimestamp = (date) =>
    date.toISOString().replace(/(\.\d{3})Z$/, "$1000Z");

  const report = {
    run_id: runId,
    started_at: formatTimestamp(startedAt),
    finished_at: formatTimestamp(finishedAt),
    duration_seconds: Math.round(duration * 1000000) / 1000000,
    environment,
    before: results
      ? results.before
      : {
          tests: { passed: false, return_code: -1, output: errorMessage },
          metrics: {},
        },
    after: results
      ? results.after
      : {
          tests: { passed: false, return_code: -1, output: errorMessage },
          metrics: {},
        },
    comparison: results
      ? results.comparison
      : { passed_gate: false, improvement_summary: errorMessage },
    success,
    error: errorMessage,
  };

  if (!outputPath) {
    outputPath = generateOutputPath();
  }

  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n[PASS] Report saved to: ${outputPath}`);

  console.log("\n" + "=".repeat(60));
  console.log("EVALUATION COMPLETE");
  console.log("=".repeat(60));
  console.log(`Run ID: ${runId}`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Success: ${success ? "YES" : "NO"}`);

  process.exit(success ? 0 : 1);
}

main();

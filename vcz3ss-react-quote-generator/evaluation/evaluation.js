const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

function generateRunId() {
  return Math.random().toString(16).substring(2, 10);
}

function getGitInfo() {
  const gitInfo = { git_commit: "unknown", git_branch: "unknown" };

  try {
    const commit = execSync("git rev-parse HEAD", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    gitInfo.git_commit = commit.substring(0, 8);
  } catch (e) {}

  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    gitInfo.git_branch = branch;
  } catch (e) {}

  return gitInfo;
}

function getEnvironmentInfo() {
  const gitInfo = getGitInfo();

  return {
    node_version: process.version,
    platform: os.platform(),
    os: os.type(),
    os_release: os.release(),
    architecture: os.arch(),
    hostname: os.hostname(),
    git_commit: gitInfo.git_commit,
    git_branch: gitInfo.git_branch,
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
      [
        "jest",
        "--testPathPattern=tests/",
        "--json",
        "--testLocationInResults",
        "--forceExit",
      ],
      {
        cwd: path.dirname(testsDir),
        env,
        encoding: "utf-8",
        timeout: 120000,
      },
    );

    let jsonOutput;
    try {
      jsonOutput = JSON.parse(result.stdout);
    } catch (e) {
      console.log("Raw stdout:", result.stdout);
      console.log("Raw stderr:", result.stderr);

      const tests = parseJestTextOutput(result.stdout + result.stderr);
      const passed = tests.filter((t) => t.outcome === "passed").length;
      const failed = tests.filter((t) => t.outcome === "failed").length;

      return {
        success: result.status === 0,
        exit_code: result.status,
        tests,
        summary: {
          total: tests.length,
          passed,
          failed,
          errors: 0,
          skipped: 0,
        },
        stdout: (result.stdout || "").slice(-3000),
        stderr: (result.stderr || "").slice(-1000),
      };
    }

    const tests = [];
    if (jsonOutput.testResults) {
      for (const testFile of jsonOutput.testResults) {
        for (const assertionResult of testFile.assertionResults || []) {
          tests.push({
            nodeid: `${path.basename(testFile.name)}::${assertionResult.ancestorTitles.join("::")}::${assertionResult.title}`,
            name: assertionResult.title,
            outcome:
              assertionResult.status === "passed"
                ? "passed"
                : assertionResult.status === "failed"
                  ? "failed"
                  : assertionResult.status === "skipped"
                    ? "skipped"
                    : "error",
          });
        }
      }
    }

    const passed = tests.filter((t) => t.outcome === "passed").length;
    const failed = tests.filter((t) => t.outcome === "failed").length;
    const skipped = tests.filter((t) => t.outcome === "skipped").length;
    const errors = tests.filter((t) => t.outcome === "error").length;

    console.log(
      `\nResults: ${passed} passed, ${failed} failed, ${errors} errors, ${skipped} skipped (total: ${tests.length})`,
    );

    for (const test of tests) {
      const icon =
        {
          passed: "[PASS]",
          failed: "[FAIL]",
          error: "[ERR]",
          skipped: "[SKIP]",
        }[test.outcome] || "[?]";
      console.log(`  ${icon} ${test.nodeid}: ${test.outcome}`);
    }

    return {
      success: jsonOutput.success,
      exit_code: result.status,
      tests,
      summary: {
        total: tests.length,
        passed,
        failed,
        errors,
        skipped,
      },
      stdout: (result.stdout || "").slice(-3000),
      stderr: (result.stderr || "").slice(-1000),
    };
  } catch (e) {
    console.log(`[FAIL] Error running tests: ${e.message}`);
    return {
      success: false,
      exit_code: -1,
      tests: [],
      summary: { error: e.message },
      stdout: "",
      stderr: "",
    };
  }
}

function parseJestTextOutput(output) {
  const tests = [];
  const lines = output.split("\n");

  for (const line of lines) {
    const passMatch = line.match(/✓\s+(.+?)(?:\s+\(\d+\s*ms\))?$/);
    const failMatch = line.match(/✕\s+(.+?)(?:\s+\(\d+\s*ms\))?$/);

    if (passMatch) {
      tests.push({
        nodeid: passMatch[1].trim(),
        name: passMatch[1].trim(),
        outcome: "passed",
      });
    } else if (failMatch) {
      tests.push({
        nodeid: failMatch[1].trim(),
        name: failMatch[1].trim(),
        outcome: "failed",
      });
    }
  }

  return tests;
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

  const comparison = {
    before_tests_passed: beforeResults.success,
    after_tests_passed: afterResults.success,
    before_total: beforeResults.summary.total || 0,
    before_passed: beforeResults.summary.passed || 0,
    before_failed: beforeResults.summary.failed || 0,
    after_total: afterResults.summary.total || 0,
    after_passed: afterResults.summary.passed || 0,
    after_failed: afterResults.summary.failed || 0,
  };

  console.log("\n" + "=".repeat(60));
  console.log("EVALUATION SUMMARY");
  console.log("=".repeat(60));

  console.log("\nBefore Implementation (repository_before):");
  console.log(`  Overall: ${beforeResults.success ? "PASSED" : "FAILED"}`);
  console.log(
    `  Tests: ${comparison.before_passed}/${comparison.before_total} passed`,
  );

  console.log("\nAfter Implementation (repository_after):");
  console.log(`  Overall: ${afterResults.success ? "PASSED" : "FAILED"}`);
  console.log(
    `  Tests: ${comparison.after_passed}/${comparison.after_total} passed`,
  );

  console.log("\n" + "=".repeat(60));
  console.log("EXPECTED BEHAVIOR CHECK");
  console.log("=".repeat(60));

  if (afterResults.success) {
    console.log("[PASS] After implementation: All tests passed (expected)");
  } else {
    console.log(
      "[FAIL] After implementation: Some tests failed (unexpected - should pass all)",
    );
  }

  return {
    before: beforeResults,
    after: afterResults,
    comparison,
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
    success = results.after.success;
    errorMessage = success ? null : "After implementation tests failed";
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

  const report = {
    run_id: runId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: Math.round(duration * 1000000) / 1000000,
    success,
    error: errorMessage,
    environment,
    results,
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

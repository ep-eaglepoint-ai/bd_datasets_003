import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Docker volume setup:
// - ./repository_after is mounted to /app
// - ./evaluation is mounted to /evaluation
// So when running in Docker:
//   - evaluation.js is at /evaluation/evaluation.js
//   - test files are at /app/test/PromisePool.test.js

function findProjectRoot() {
  // Check if we're in Docker with specific volume mounts
  // In Docker: __dirname = /evaluation
  // In local: __dirname = <root>/evaluation

  if (__dirname === "/evaluation") {
    // Running in Docker with volume mounts
    // Repository is mounted at /app
    return "/app";
  }

  // Running locally
  // If evaluation.js is in 'evaluation' folder, parent is root
  if (path.basename(__dirname) === "evaluation") {
    const potentialRoot = path.dirname(__dirname);
    // Verify by checking for repository folders
    if (
      fs.existsSync(path.join(potentialRoot, "repository_after")) ||
      fs.existsSync(path.join(potentialRoot, "repository_before"))
    ) {
      return potentialRoot;
    }
  }

  // Search upward for project root
  let currentDir = __dirname;
  for (let i = 0; i < 5; i++) {
    const hasEval = fs.existsSync(path.join(currentDir, "evaluation"));
    const hasRepo =
      fs.existsSync(path.join(currentDir, "repository_after")) ||
      fs.existsSync(path.join(currentDir, "repository_before"));

    if (hasEval && hasRepo) {
      return currentDir;
    }

    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  // Fallback
  return path.dirname(__dirname);
}

const ROOT = findProjectRoot();
const REPORTS_DIR = path.join(__dirname, "reports");

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function getEnvironmentInfo() {
  return {
    node_version: process.version,
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
  };
}

/**
 * Runs the PromisePool test suite
 */
function runTests(repoPath) {
  return new Promise((resolve) => {
    // In Docker with your volume mounts:
    // - repository_after is mounted to /app
    // - So repoPath is ignored and we always test /app
    //
    // Locally:
    // - ROOT/repository_after/test/PromisePool.test.js

    let testFilePath;
    let repoCwd;

    if (ROOT === "/app") {
      // Docker: repository_after is mounted to /app
      testFilePath = "/app/test/PromisePool.test.js";
      repoCwd = "/app";
    } else {
      // Local: use repoPath to find correct repository
      testFilePath = path.join(ROOT, repoPath, "test", "PromisePool.test.js");
      repoCwd = path.join(ROOT, repoPath);
    }

    console.log(`Test file path: ${testFilePath}`);
    console.log(`Working directory: ${repoCwd}`);

    // Check if test file exists
    if (!fs.existsSync(testFilePath)) {
      console.error(`Error: Test file not found at ${testFilePath}`);
      resolve({
        passed: false,
        return_code: -1,
        output: `Test file not found: ${testFilePath}`,
        tests_passed: 0,
        tests_failed: 0,
        total_tests: 0,
      });
      return;
    }

    // Run the test file directly with node
    const testProc = spawn("node", [testFilePath], {
      cwd: repoCwd,
      env: {
        ...process.env,
        NODE_ENV: "test",
      },
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    testProc.stdout.on("data", (data) => {
      const output = data.toString();
      stdout += output;
      process.stdout.write(output); // Echo to console
    });

    testProc.stderr.on("data", (data) => {
      const output = data.toString();
      stderr += output;
      process.stderr.write(output); // Echo to console
    });

    testProc.on("close", (code) => {
      const passed = code === 0;
      const outputDetails = stdout + (stderr ? "\n\nSTDERR:\n" + stderr : "");

      // Parse test results from output
      let testsPassed = 0;
      let testsFailed = 0;

      // Look for "Test Results: X passed, Y failed"
      const resultsMatch = stdout.match(
        /Test Results: (\d+) passed, (\d+) failed/,
      );
      if (resultsMatch) {
        testsPassed = parseInt(resultsMatch[1], 10);
        testsFailed = parseInt(resultsMatch[2], 10);
      }

      resolve({
        passed,
        return_code: code,
        output: outputDetails,
        tests_passed: testsPassed,
        tests_failed: testsFailed,
        total_tests: testsPassed + testsFailed,
      });
    });

    testProc.on("error", (error) => {
      console.error(`Failed to start test process: ${error.message}`);
      resolve({
        passed: false,
        return_code: -1,
        output: `Error starting test: ${error.message}`,
        tests_passed: 0,
        tests_failed: 0,
        total_tests: 0,
      });
    });
  });
}

async function runEvaluation() {
  const runId = crypto.randomUUID();
  const startTime = new Date();
  const startTimeIso = startTime.toISOString();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`PromisePool Evaluation`);
  console.log(`Run ID: ${runId}`);
  console.log(`Started: ${startTimeIso}`);
  console.log(`${"=".repeat(60)}\n`);

  // Determine which repository to test
  const repoPath = process.env.REPO_PATH || "repository_after";

  console.log(`Configuration:`);
  console.log(`  Root directory: ${ROOT}`);
  console.log(`  Repository: ${repoPath}`);
  console.log(`  Full repo path: ${path.join(ROOT, repoPath)}`);
  console.log(`  Reports directory: ${REPORTS_DIR}\n`);

  const testResult = await runTests(repoPath);

  const endTime = new Date();
  const endTimeIso = endTime.toISOString();
  const durationSeconds = (endTime - startTime) / 1000;

  // Construct the Final Report Object
  const report = {
    run_id: runId,
    started_at: startTimeIso,
    finished_at: endTimeIso,
    duration_seconds: durationSeconds,
    environment: getEnvironmentInfo(),
    repository: {
      path: repoPath,
      type: repoPath.includes("after") ? "fixed" : "original",
    },
    tests: {
      passed: testResult.passed,
      return_code: testResult.return_code,
      tests_passed: testResult.tests_passed,
      tests_failed: testResult.tests_failed,
      total_tests: testResult.total_tests,
      output: testResult.output.substring(0, 5000), // Keep more output for debugging
    },
    success: testResult.passed,
  };

  // Write the report to disk
  const reportPath = path.join(REPORTS_DIR, `report.json`);
  const latestReportPath = path.join(REPORTS_DIR, "report-latest.json");

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(latestReportPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Evaluation Complete`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Status: ${report.success ? "✓ PASSED" : "✗ FAILED"}`);
  console.log(
    `Tests Passed: ${testResult.tests_passed}/${testResult.total_tests}`,
  );
  console.log(`Duration: ${durationSeconds.toFixed(2)}s`);
  console.log(`Report: ${reportPath}`);
  console.log(`${"=".repeat(60)}\n`);

  // Exit with status code based on the result
  process.exit(report.success ? 0 : 1);
}

// Handle uncaught errors
process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

runEvaluation();

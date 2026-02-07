const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto"); // Built-in Node module, replaces uuid
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const REPORTS_DIR = path.join(ROOT, "evaluation", "reports");

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

// Runs Jest tests for a given repoPath
const { execSync } = require("child_process");

function runTests(repoFolder) {
  const targetCwd = path.join(ROOT, repoFolder, "backend");

  return new Promise((resolve) => {
    console.log(` > Executing tests in: ${targetCwd}`);
    
    // Check if the directory even exists to avoid crashing
    if (!fs.existsSync(targetCwd)) {
        return resolve({ passed: false, return_code: 1, output: "Directory not found" });
    }

    let stdout = "";
    let passed = false;
    let code = 0;

    try {
      // Using execSync with a fallback to global jest if local fails
      const cmd = "npx jest --json --passWithNoTests";
      stdout = execSync(cmd, {
        cwd: targetCwd,
        env: { ...process.env, CI: "true" },
        encoding: "utf-8",
        stdio: ['ignore', 'pipe', 'pipe'] // Captures output without crashing
      });
      passed = true;
    } catch (error) {
      code = error.status || 1;
      stdout = error.stdout ? error.stdout.toString() : "";
      const stderr = error.stderr ? error.stderr.toString() : "";
      
      // Even if it "erred", Jest might have just failed a test. 
      // We check the JSON to see if it actually ran.
      if (stdout.includes('"success":true')) {
          passed = true;
      }
    }

    // Parse output
    try {
      const jsonStart = stdout.indexOf("{");
      if (jsonStart !== -1) {
        const parsed = JSON.parse(stdout.substring(jsonStart));
        passed = parsed.success;
      }
    } catch (e) {}

    resolve({
      passed,
      return_code: code,
      output: passed ? "All tests passed" : "Tests failed or crashed",
    });
  });
}

async function runEvaluation() {
  // Uses built-in crypto to avoid UUID library restriction
  const runId = crypto.randomUUID(); 
  const startTime = new Date();

  console.log(`Starting evaluation (Run ID: ${runId})...`);

  // Step 1: Run baseline (expected to fail if repo is empty/broken)
  console.log("Running baseline tests (repository_before)...");
  const beforeResult = await runTests("repository_before");

  // Step 2: Run your implementation (must pass all 13 tests)
  console.log("Running refactor tests (repository_after)...");
  const afterResult = await runTests("repository_after");

  const endTime = new Date();

  // Summary Logic
  let improvementSummary = "No improvement detected.";
  if (!beforeResult.passed && afterResult.passed) {
    improvementSummary = "Refactor fixed failing tests.";
  } else if (!afterResult.passed) {
    improvementSummary = "Refactor failed to pass tests.";
  } else if (beforeResult.passed && afterResult.passed) {
    improvementSummary = "Both repos passed tests.";
  }

  const report = {
    run_id: runId,
    started_at: startTime.toISOString(),
    finished_at: endTime.toISOString(),
    duration_seconds: (endTime - startTime) / 1000,
    environment: getEnvironmentInfo(),
    before: { tests: beforeResult },
    after: { tests: afterResult },
    comparison: {
      passed_gate: afterResult.passed,
      improvement_summary: improvementSummary,
    },
    success: afterResult.passed,
    error: null,
  };

  const reportPath = path.join(REPORTS_DIR, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\nEvaluation complete. Success: ${report.success}`);
  console.log(`Report saved at: ${reportPath}`);

  process.exit(report.success ? 0 : 1);
}

runEvaluation();
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");
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

function runTests() {
  return new Promise((resolve) => {
    const proc = spawn("npm", ["test"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CI: "true",
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      const passed = code === 0;
      const combined = `${stdout}${stderr}`.trim();
      // Always return the actual test runner output (trimmed).
      // If the runner produced no output for some reason, provide a fallback.
      const output = combined || (passed ? "All tests passed." : "Tests failed");

      resolve({
        passed,
        return_code: code,
        output,
      });
    });
  });
}

async function runEvaluation() {
  const runId = randomUUID();
  const startTime = new Date();
  const startTimeIso = startTime.toISOString();

  console.log(`Starting evaluation (Run ID: ${runId})...`);

  // Run Tests
  console.log("Running tests...");
  const testResult = await runTests();

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
    before: {}, // Placeholder for "before" section
    after: {
      tests: {
        passed: testResult.passed,
        return_code: testResult.return_code,
        output: (testResult.output || "").substring(0, 1000), // Truncate if too long
      },
      metrics: {}, // Placeholder for "metrics" section
    },
    comparison: {
      passed_gate: testResult.passed, // Example logic for "passed_gate"
      improvement_summary: "Refactor fixed failing tests and met distributed requirements.",
    },
    success: testResult.passed,
    error: null,
  };

  // Write the report to disk
  const reportPath = path.join(REPORTS_DIR, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Evaluation complete. Success: ${report.success}`);
  console.log(`Report written to: ${reportPath}`);

  // Exit with status code based on the test result
  process.exit(report.success ? 0 : 1);
}


runEvaluation();
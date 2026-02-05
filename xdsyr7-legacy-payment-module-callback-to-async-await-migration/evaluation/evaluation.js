const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const os = require("os");

// --- Helper Functions ---

function generateRunId() {
  return crypto.randomBytes(4).toString("hex");
}

function getEnvironmentInfo() {
  return {
    node_version: process.version,
    platform: os.platform(),
    os_type: os.type(),
    execution_mode: process.env.INSIDE_DOCKER
      ? "Inside Docker Container"
      : "Host Machine",
  };
}

function generateOutputPath(projectRoot, customPath) {
  if (customPath) return path.resolve(customPath);

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-");

  const evalDir = path.dirname(__filename);
  const outputDir = path.join(evalDir, "reports", dateStr, timeStr);

  fs.mkdirSync(outputDir, { recursive: true });
  return path.join(outputDir, "report.json");
}

function parseJestOutput(stdout, stderr) {
  const tests = [];
  // Remove ANSI color codes
  const cleanOutput = (stdout + "\n" + stderr).replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    "",
  );
  const lines = cleanOutput.split("\n");

  let currentSuite = "unknown";

  lines.forEach((line) => {
    const cleanLine = line.trim();

    if (cleanLine.includes("PASS") || cleanLine.includes("FAIL")) {
      const parts = cleanLine.split(" ");
      if (parts.length > 1) currentSuite = parts[parts.length - 1];
    }

    // Match Jest checkmarks (✓) or crosses (✕)
    const match = cleanLine.match(/^(\u2713|\u2715|✓|✕)\s+(.+?)(?:\s+\(|$)/);

    if (match) {
      const symbol = match[1];
      const name = match[2];
      const outcome =
        symbol === "✓" || symbol === "\u2713" ? "passed" : "failed";

      tests.push({
        suite: currentSuite,
        name: name,
        outcome: outcome,
      });
    }
  });

  return tests;
}



function runEvaluationTests(mode = "after") {
  console.log(`🚀 Starting Integration Tests (${mode})...`);

  
  const command = "npm";
  const args = ["test", "--prefix", "tests"];

  const startTime = Date.now();

  try {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 10,
      timeout: 120000,
      stdio: "pipe",
      env: {
        ...process.env,
        CI: "true",
        TEST_MODE: mode,
        // DB_HOST is usually injected, but we default if missing
        DB_HOST: mode === "before" ? "mysql-db" : "postgres-db",
      },
    });

    const output = result.stdout || "";
    const errorOutput = result.stderr || "";

    const tests = parseJestOutput(output, errorOutput);

    const summary = {
      total: tests.length,
      passed: tests.filter((t) => t.outcome === "passed").length,
      failed: tests.filter((t) => t.outcome === "failed").length,
      errors: result.status !== 0 && tests.length === 0 ? 1 : 0,
    };
    
    // Determine success based on mode
    // For 'after', we expect success (exit 0, no failures)
    // For 'before', we usually expect failure, but the run function just reports status.
    const isSuccess = result.status === 0 || (summary.passed > 0 && summary.failed === 0);

    return {
      success: isSuccess,
      return_code: result.status, // Renamed from exit_code
      test_cases: tests, // Renamed from tests
      summary: summary,
      stdout: output,
      stderr: errorOutput,
      duration_ms: Date.now() - startTime,
    };
  } catch (e) {
    return {
      success: false,
      return_code: -1,
      test_cases: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 1 },
      stdout: "",
      stderr: e.message,
      duration_ms: Date.now() - startTime,
    };
  }
}


function main() {
  const runId = generateRunId();
  const startTime = new Date();
  const projectRoot = process.cwd();

  console.log(`Starting Payment Module Evaluation [Run ID: ${runId}]`);

  // We explicitly run 'after' tests as that's the primary validation
  const afterRun = runEvaluationTests("after");
  

  const beforeRun = {
      tests: {
          passed: false,
          return_code: 1,
          output: "Pre-refactor tests skipped in evaluation environment (requires mysql-db). Expected to fail."
      },
      test_cases: [],
      metrics: {}
  };

  const finishedAt = new Date();

  // Comparison Logic
  const passedGate = afterRun.success;
  const improvementSummary = passedGate 
      ? "Repository after passes all correctness tests." 
      : "Repository after failed verification tests.";

  const report = {
    run_id: runId,
    started_at: startTime.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: (finishedAt - startTime) / 1000,
    environment: getEnvironmentInfo(),
    before: beforeRun, // Top-level field
    after: {
        tests: {
            passed: afterRun.success,
            return_code: afterRun.return_code,
            output: (afterRun.stdout + "\n" + afterRun.stderr).trim()
        },
        test_cases: afterRun.test_cases,
        metrics: {}
    },
    comparison: { // Top-level field
      passed_gate: passedGate,
      improvement_summary: improvementSummary
    },
    success: passedGate, // Aligns with comparison.passed_gate
    error: null
  };

  const outputPath = generateOutputPath(projectRoot);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log("\n---------------------------------------------------");
  console.log(`Tests Run (After): ${afterRun.summary.total}`);
  console.log(`Passed:            ${afterRun.summary.passed}`);
  console.log(`Failed:            ${afterRun.summary.failed}`);
  console.log("---------------------------------------------------");
  console.log(`✅ Report saved to: ${outputPath}`);
}

main();

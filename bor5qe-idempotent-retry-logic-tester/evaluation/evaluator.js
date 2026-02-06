import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

/**
 * Runs the Jest test suite with a specific REPO_PATH environment variable
 */
function runTests(repoPath, testDir) {
  return new Promise((resolve) => {
    const testFile = path.join(testDir, "network.test.js");
    
    // 2. Ensure IMPL_PATH is an absolute path so the test's dynamic import works
    const absoluteImplPath = path.resolve(ROOT, repoPath, "network.js");

    console.log(`[Running] Jest on ${testFile} using implementation ${absoluteImplPath}`);
    // Spawn Jest process
    const jestProc = spawn("npx", ["jest", "--json", testFile], {
      cwd: ROOT,
      env: {
        ...process.env,
        CI: "true",
        NODE_OPTIONS: "--experimental-vm-modules",
        IMPL_PATH: absoluteImplPath, // Dynamically set which folder to test
        TEST_PATH: testDir, // Dynamically set which test suite to run
      },
    });

    let stdout = "";
    let stderr = "";

    jestProc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    jestProc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    jestProc.on("close", (code) => {
      let passed = code === 0;
      let outputDetails = stderr || stdout;
      let jsonOutput = null;

      // Attempt to parse Jest JSON output
      try {
        // Jest JSON sometimes has console logs prepended, find the start of JSON
        const jsonStartIndex = stdout.indexOf("{");
        if (jsonStartIndex !== -1) {
          const cleanJson = stdout.substring(jsonStartIndex);
          jsonOutput = JSON.parse(cleanJson);
          passed = jsonOutput.success; // Jest JSON property
        }
        
        outputDetails = passed ? "All tests passed." : (stderr || "Tests failed");
      } catch (e) {
        console.warn(`[${repoPath}] Could not parse Jest JSON, using raw output.`);
      }

      resolve({
        passed,
        return_code: code,
        output: outputDetails,
        // Optional: include detailed jest results if needed in the future
        // details: jsonOutput 
      });
    });
  });
}

async function runEvaluation() {
  const runId = uuidv4();
  const startTime = new Date();
  const startTimeIso = startTime.toISOString();

  console.log(`Starting evaluation (Run ID: ${runId})...`);

  // 1. Run Tests against "repository_before" (Baseline)
  // We assume this might fail because the original code doesn't have Redis
  console.log("Running baseline tests (before)...");
  const beforeResult = await runTests("repository_before", "repository_before");

  // 2. Run Tests against "repository_after" (Refactor)
  console.log("Running refactor tests (after)...");
  const afterResult = await runTests("repository_after", "repository_after");

  const endTime = new Date();
  const endTimeIso = endTime.toISOString();
  const durationSeconds = (endTime - startTime) / 1000;

  // 3. Generate Comparison Summary
  let improvementSummary = "No improvement detected.";
  if (!beforeResult.passed && afterResult.passed) {
    improvementSummary = "Added tests met requirements.";
  } else if (beforeResult.passed && afterResult.passed) {
    improvementSummary = "Tests passed in both states (Verify baseline expectation).";
  } else if (!afterResult.passed) {
    improvementSummary = "Added tests failed to pass requirements.";
  }

  // 4. Construct the Final Report Object
  const report = {
    run_id: runId,
    started_at: startTimeIso,
    finished_at: endTimeIso,
    duration_seconds: durationSeconds,
    environment: getEnvironmentInfo(),
    before: {
      tests: {
        passed: beforeResult.passed,
        return_code: beforeResult.return_code,
        output: beforeResult.output.substring(0, 500) // Truncate if too long
      },
      metrics: {} // Placeholders for future metrics (e.g. memory usage)
    },
    after: {
      tests: {
        passed: afterResult.passed,
        return_code: afterResult.return_code,
        output: afterResult.output.substring(0, 500)
      },
      metrics: {}
    },
    comparison: {
      passed_gate: afterResult.passed,
      improvement_summary: improvementSummary
    },
    success: afterResult.passed,
    error: null
  };

  // Write the report to disk
  const reportPath = path.join(REPORTS_DIR, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Evaluation complete. Success: ${report.success}`);
  console.log(`Report written to: ${reportPath}`);

  // Exit with status code based on the 'After' result
  process.exit(report.success ? 0 : 1);
}

runEvaluation();
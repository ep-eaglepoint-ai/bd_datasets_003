import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";

// ESM compatibility for __dirname
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
 * Runs the Test suite
 */
function runTests(repoPath) {
  return new Promise((resolve) => {
    // We use "npm run test" which maps to "vitest --run" in your package.json
    // We add --reporter=json to try to get clean output, or we rely on exit code
    const testProc = spawn("npm", ["run", "test", "--", "--reporter=json"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CI: "true",
        REPO_PATH: repoPath,
      },
      shell: true, // Helpful for npm scripts on some docker OSs
    });

    let stdout = "";
    let stderr = "";

    testProc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    testProc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    testProc.on("close", (code) => {
      let passed = code === 0;
      let outputDetails = stderr || stdout;

      // Attempt to parse Vitest JSON output if available
      try {
        // Find the start of the JSON array/object in stdout
        const jsonStartIndex = stdout.indexOf("{");
        if (jsonStartIndex !== -1) {
          const cleanJson = stdout.substring(jsonStartIndex);
          const jsonOutput = JSON.parse(cleanJson);
          // Vitest JSON usually has "numFailedTests": 0 for success
          if (jsonOutput.numFailedTests !== undefined) {
            passed = jsonOutput.numFailedTests === 0;
          }
        }
      } catch (e) {
        // console.warn(`Could not parse JSON output, relying on exit code.`);
      }

      resolve({
        passed,
        return_code: code,
        output: outputDetails,
      });
    });
  });
}

async function runEvaluation() {
  const runId = crypto.randomUUID();
  const startTime = new Date();
  const startTimeIso = startTime.toISOString();

  console.log(`Starting evaluation (Run ID: ${runId})...`);

  // We are evaluating the current repository
  // If you need to simulate "before" and "after" logic within the same repo,
  // you typically check out git branches or rely on the REPO_PATH env var
  // passed via Docker to toggle behavior in your tests.

  const repoPath = process.env.REPO_PATH || "repository_after";

  console.log(`Running tests for: ${repoPath}...`);
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
    tests: {
      target: repoPath,
      passed: testResult.passed,
      return_code: testResult.return_code,
      output: testResult.output.substring(0, 1000), // Truncate logs
    },
    success: testResult.passed,
  };

  // Write the report to disk
  const reportPath = path.join(REPORTS_DIR, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Evaluation complete. Success: ${report.success}`);
  console.log(`Report written to: ${reportPath}`);

  // Exit with status code based on the result
  process.exit(report.success ? 0 : 1);
}

runEvaluation();

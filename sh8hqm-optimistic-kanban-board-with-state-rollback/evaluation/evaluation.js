const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const REPO_AFTER_DIR = path.join(ROOT, "repository_after");
const REPORTS_DIR = path.join(ROOT, "evaluation", "reports");

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
function runTests(repoPath) {
    return new Promise((resolve) => {
        const jestProc = spawn("npx", ["jest", "--config", "jest.config.cjs", "--forceExit", "--verbose"], {
            cwd: REPO_AFTER_DIR,
            env: {
                ...process.env,
                CI: "true",
                NODE_ENV: "test",
                REPO_PATH: repoPath,
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
            const passed = code === 0;
            const fullOutput = (stderr + "\n" + stdout).trim();

            resolve({
                passed,
                return_code: code,
                output: fullOutput || (passed ? "Tests passed with no output" : "Tests failed with no output"),
            });
        });
    });
}

async function runEvaluation() {
    const runId = crypto.randomUUID();
    const startTime = new Date();
    const startTimeIso = startTime.toISOString();

    console.log(`Starting evaluation (Run ID: ${runId})...`);

    // 1. Run Tests against "repository_before" (Baseline)
    console.log("Running baseline tests (before)...");
    const beforeResult = await runTests("repository_before");

    // 2. Run Tests against "repository_after" (Refactor)
    console.log("Running refactor tests (after)...");
    const afterResult = await runTests("repository_after");

    const endTime = new Date();
    const endTimeIso = endTime.toISOString();
    const durationSeconds = (endTime - startTime) / 1000;

    // 3. Generate Comparison Summary
    let improvementSummary = "No improvement detected.";
    if (!beforeResult.passed && afterResult.passed) {
        improvementSummary = "Refactor fixed failing tests and met optimistic update requirements.";
    } else if (beforeResult.passed && afterResult.passed) {
        improvementSummary = "Tests passed in both states (Verify baseline expectation).";
    } else if (!afterResult.passed) {
        improvementSummary = "Refactored code failed to pass requirements.";
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
                output: beforeResult.output.substring(0, 1000) // Increase truncation limit slightly
            },
            metrics: {}
        },
        after: {
            tests: {
                passed: afterResult.passed,
                return_code: afterResult.return_code,
                output: afterResult.output.substring(0, 1000)
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
    try {
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    } catch (err) {
        console.error("Failed to write report:", err.message);
    }

    console.log(`Evaluation complete. Success: ${report.success}`);
    console.log(`Report written to: ${reportPath}`);

    // Exit with status code based on the 'After' result
    process.exit(report.success ? 0 : 1);
}

runEvaluation();

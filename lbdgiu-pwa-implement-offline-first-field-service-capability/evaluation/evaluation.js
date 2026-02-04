import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { spawn } from "child_process";

const REPORTS_DIR = path.join(process.cwd(), "evaluation/reports");
if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

const runTests = (repoPath) => {
    return new Promise((resolve) => {
        const testProcess = spawn("npm", ["test"], {
            cwd: path.join(process.cwd(), repoPath),
            shell: true
        });

        let output = "";

        testProcess.stdout.on("data", (data) => {
            output += data.toString();
        });

        testProcess.stderr.on("data", (data) => {
            output += data.toString();
        });

        testProcess.on("close", (code) => {
            resolve({
                passed: code === 0,
                return_code: code,
                output
            });
        });
    });
};

const getEnvironmentInfo = () => ({
    node_version: process.version,
    platform: process.platform,
    cwd: process.cwd()
});

async function runEvaluation() {
    const runId = uuidv4();
    const startTime = new Date();

    console.log(`Starting evaluation (Run ID: ${runId})...`);
    console.log("Running refactor tests (after) in background...");

    const afterResult = await runTests("repository_after");

    const endTime = new Date();
    const durationSeconds = (endTime - startTime) / 1000;

    const report = {
        run_id: runId,
        started_at: startTime.toISOString(),
        finished_at: endTime.toISOString(),
        duration_seconds: durationSeconds,
        environment: getEnvironmentInfo(),
        before: {},
        after: {
            tests: {
                passed: afterResult.passed,
                return_code: afterResult.return_code,
                output: afterResult.output.slice(0, 1000)
            },
            metrics: {}
        },
        comparison: {
            passed_gate: afterResult.passed,
            improvement_summary: afterResult.passed
                ? "Refactored code passed requirements."
                : "Refactored code failed to pass requirements."
        },
        success: afterResult.passed,
        error: null
    };

    const reportPath = path.join(REPORTS_DIR, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`Evaluation complete. Success: ${report.success}`);
    console.log(`Report written to: ${reportPath}`);

    process.exit(report.success ? 0 : 1);
}

runEvaluation();

import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import * as os from "os";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

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


function runTests(repoPath: string): Promise<{ passed: boolean; return_code: number; output: string }> {
    return new Promise((resolve) => {
        const viteNodeBin = path.join(ROOT, "repository_after", "node_modules", ".bin", "vite-node");
        const vitestBin = path.join(ROOT, "repository_after", "node_modules", ".bin", "vitest");

        // Run journal verification and logic unit tests
        const cmd = `${viteNodeBin} tests/journal.test.ts && ${vitestBin} run tests/logic.test.ts`;

        const testProc = spawn("sh", ["-c", cmd], {
            cwd: ROOT,
            env: {
                ...process.env,
                TARGET_REPO: repoPath,
            },
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
            const combinedOutput = stdout + stderr;
            // Passed if code is 0 AND no manual [FAIL] strings AND reaches the [COMPLETE] marker from journal.test.ts
            const passed = code === 0 && !combinedOutput.includes("[FAIL]") && (combinedOutput.includes("[COMPLETE]") || repoPath === "repository_before");

            resolve({
                passed,
                return_code: code ?? 1,
                output: combinedOutput,
            });
        });
    });
}

async function runEvaluation() {
    const runId = randomUUID();
    const startTime = Date.now();
    const startTimeIso = new Date(startTime).toISOString();

    console.log(`Starting evaluation (Run ID: ${runId})...`);

    console.log("Running baseline tests (repository_before)...");
    const beforeResult = await runTests("repository_before");

    console.log("Running refactor tests (repository_after)...");
    const afterResult = await runTests("repository_after");

    const endTime = Date.now();
    const endTimeIso = new Date(endTime).toISOString();
    const durationSeconds = (endTime - startTime) / 1000;

    let improvementSummary = "No improvement detected.";
    if (!beforeResult.passed && afterResult.passed) {
        improvementSummary = "The Code generation met all requirements.";
    } else if (beforeResult.passed && afterResult.passed) {
        improvementSummary = "The Code generation met all requirements.";
    } else if (!afterResult.passed) {
        improvementSummary = "The Code generation failed to meet all requirements.";
    }

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
                output: beforeResult.output.substring(0, 1000)
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

    const reportPath = path.join(REPORTS_DIR, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`\nEvaluation complete.`);
    console.log(`After Success: ${afterResult.passed}`);
    console.log(`Report written to: ${reportPath}`);

    process.exit(report.success ? 0 : 1);
}

runEvaluation().catch(err => {
    console.error("Evaluation failed with fatal error:", err);
    process.exit(1);
});

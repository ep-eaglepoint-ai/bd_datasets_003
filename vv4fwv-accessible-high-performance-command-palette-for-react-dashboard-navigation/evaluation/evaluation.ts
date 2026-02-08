import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, chmodSync } from 'fs';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';
import os from 'os';

const ROOT = resolve(process.cwd());
const REPORTS = join(ROOT, 'evaluation', 'reports');

interface TestResult {
    passed: boolean;
    return_code: number;
    output: string;
}

interface EvaluationResult {
    tests: TestResult;
    metrics: Record<string, any>;
}

function environmentInfo() {
    return {
        node_version: process.version,
        platform: `${os.platform()}-${os.arch()}`
    };
}

function runTests(repoPath: string, projectName: string): TestResult {
    const env = { ...process.env, REPO_PATH: repoPath };

    // Cleanup before run
    try {
        console.log(`[Evaluator] Cleaning up for ${projectName}...`);
        execSync(`docker compose -p ${projectName} down --volumes --remove-orphans`, { cwd: ROOT, stdio: 'ignore' });
    } catch (e) { }

    try {
        console.log(`[Evaluator] Running tests for ${repoPath} (Project ID: ${projectName})...`);
        // We use 'run' to avoid publishing ports to the host and potential clashes.
        // The images are built to ensure we test the specific repository state.
        const output = execSync(`docker compose -p ${projectName} run --build --rm tests`, {
            cwd: ROOT,
            env,
            encoding: 'utf-8',
            timeout: 300000 // 5 minutes
        });
        return {
            passed: true,
            return_code: 0,
            output: output.slice(-8000)
        };
    } catch (e: any) {
        return {
            passed: false,
            return_code: e.status || -1,
            output: (e.stdout + e.stderr || e.message || "Unknown error").slice(-8000)
        };
    } finally {
        // Cleanup after run
        try {
            console.log(`[Evaluator] Final cleanup for ${projectName}...`);
            execSync(`docker compose -p ${projectName} down --volumes --remove-orphans`, { cwd: ROOT, stdio: 'ignore' });
        } catch (e) { }
    }
}

function runMetrics(repoPath: string): Record<string, any> {
    return {};
}

function evaluate(repoName: string, projectName: string): EvaluationResult {
    const repoDir = join(ROOT, repoName);
    if (!existsSync(join(repoDir, 'package.json'))) {
        console.log(`[Evaluator] Skipping ${repoName} (package.json not found)`);
        return {
            tests: {
                passed: false,
                return_code: 0,
                output: "Skipped: package.json not found in repository."
            },
            metrics: {}
        };
    }

    const tests = runTests(repoName, projectName);
    const metrics = runMetrics(repoName);
    return { tests, metrics };
}

async function runEvaluation() {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const start = Date.now();

    console.log("[Evaluator] Starting comparative evaluation...");

    // Isolated project names prevent collisions between the two runs
    const before = evaluate('repository_before', `eval_before_${runId.slice(0, 8)}`);
    const after = evaluate('repository_after', `eval_after_${runId.slice(0, 8)}`);

    const durationSeconds = (Date.now() - start) / 1000;
    const finishedAt = new Date().toISOString();

    const passedGate = after.tests.passed;
    const improvementSummary = passedGate
        ? "Evaluation Successful: Implementation passed all correctness checks."
        : "Evaluation Failed: Implementation did not pass correctness checks.";

    const report = {
        run_id: runId,
        started_at: startedAt,
        finished_at: finishedAt,
        duration_seconds: durationSeconds,
        environment: environmentInfo(),
        before,
        after,
        comparison: {
            passed_gate: passedGate,
            improvement_summary: improvementSummary
        },
        success: passedGate,
        error: null
    };

    // Requirement: Only latest.json exists in reports folder
    if (!existsSync(REPORTS)) {
        mkdirSync(REPORTS, { recursive: true });
    } else {
        const files = readdirSync(REPORTS);
        for (const file of files) {
            try { unlinkSync(join(REPORTS, file)); } catch (e) { }
        }
    }

    const path = join(REPORTS, 'latest.json');
    writeFileSync(path, JSON.stringify(report, null, 2));

    // Ensure the host can read/write/delete the report files
    try { chmodSync(path, 0o666); } catch (e) { }
    try { chmodSync(REPORTS, 0o777); } catch (e) { }

    console.log(`[Evaluator] Evaluation complete. Report written to ${path}`);

    return report.success ? 0 : 1;
}

runEvaluation()
    .then(code => process.exit(code))
    .catch(err => {
        console.error("[Evaluator] Fatal error:", err);
        process.exit(1);
    });

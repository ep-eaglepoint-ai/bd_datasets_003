import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
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
        python_version: "N/A (TypeScript Evaluation)",
        platform: `${os.platform()}-${os.arch()}`
    };
}

function runTests(repoPath: string, projectName: string): TestResult {
    // We use a unique project name (-p) and APP_PORT=0 to ensure isolation.
    // Docker will assign a random port for the app's host binding.
    const env = { ...process.env, REPO_PATH: repoPath, APP_PORT: '0' };

    try {
        console.log(`[Evaluator] Orchestrating tests for ${repoPath}...`);

        // Clean up any stale state for this specific project
        execSync(`docker compose -p ${projectName} down --volumes --remove-orphans`, { cwd: ROOT, stdio: 'ignore' });

        // Run tests using 'docker compose run' for better isolation
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
            output: (e.stdout + e.stderr || e.message).slice(-8000)
        };
    } finally {
        // Final cleanup for this project
        try {
            execSync(`docker compose -p ${projectName} down --volumes --remove-orphans`, { cwd: ROOT, stdio: 'ignore' });
        } catch (e) { }
    }
}

function runMetrics(repoPath: string): Record<string, any> {
    return {};
}

function evaluate(repoName: string, projectName: string): EvaluationResult {
    const tests = runTests(repoName, projectName);
    const metrics = runMetrics(repoName);
    return { tests, metrics };
}

async function runEvaluation() {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const start = Date.now();

    console.log("[Evaluator] Starting comparative analysis...");

    // Unique project names prevent collisions between 'before' and 'after' runs
    const before = evaluate('repository_before', `eval_before_${runId.slice(0, 8)}`);
    const after = evaluate('repository_after', `eval_after_${runId.slice(0, 8)}`);

    const durationSeconds = (Date.now() - start) / 1000;
    const finishedAt = new Date().toISOString();

    const passedGate = after.tests.passed;
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
            improvement_summary: passedGate
                ? "Implementation successful: Logic passed all correctness checks."
                : "Implementation failed: Correctness checks did not pass."
        },
        success: passedGate,
        error: null
    };

    // Ensure directory exists and only holds latest.json
    if (!existsSync(REPORTS)) {
        mkdirSync(REPORTS, { recursive: true });
    } else {
        readdirSync(REPORTS).forEach(file => {
            try { unlinkSync(join(REPORTS, file)); } catch (e) { }
        });
    }

    const path = join(REPORTS, 'latest.json');
    writeFileSync(path, JSON.stringify(report, null, 2));

    console.log(`[Evaluator] Completed. Report written to ${path}`);
    return report.success ? 0 : 1;
}

runEvaluation()
    .then(code => process.exit(code))
    .catch(err => {
        console.error("[Evaluator] Fatal error:", err);
        process.exit(1);
    });

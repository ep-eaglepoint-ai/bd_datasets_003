const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(__dirname, 'reports');

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function getEnvironmentInfo() {
    return {
        python_version: process.version, // Using Node version since this is a JS environment
        platform: `${os.type()} ${os.release()} ${os.arch()}`
    };
}

function runTests(target) {
    try {
        // We use the same test command structure as the manual tests
        // But we capture output.
        // using docker run logic inside a docker container is tricky (DooD), 
        // but here we are likely running INSIDE the container already if we follow the README instructions.
        // The README says "Evaluation Docker Command: docker run ... node evaluation/evaluation.js"
        // So we are inside the container. We just run `node tests/test.js` with the env var.

        const cmd = `TARGET=${target} node tests/test.js`;
        const output = execSync(cmd, {
            cwd: ROOT,
            encoding: 'utf8',
            stdio: 'pipe', // Capture stdout/stderr
            timeout: 120000 // 120s timeout
        });

        return {
            passed: true,
            return_code: 0,
            output: output.substring(0, 8000)
        };
    } catch (error) {
        // execSync throws if status != 0
        return {
            passed: false,
            return_code: error.status || 1,
            output: (error.stdout + error.stderr).substring(0, 8000) || error.message
        };
    }
}

function evaluate(repoName) {
    // In our case, repoName maps to the TARGET env var logic in tests/test.js
    // repository_before -> TARGET=before
    // repository_after -> TARGET=after

    const target = repoName === 'repository_before' ? 'before' : 'after';
    const tests = runTests(target);
    const metrics = {}; // Optional metrics

    return {
        tests,
        metrics
    };
}

function runEvaluation() {
    const runId = crypto.randomUUID();
    const start = new Date();

    console.log("Starting evaluation...");

    const beforeResults = evaluate('repository_before');
    const afterResults = evaluate('repository_after');

    // Success Rule: Success if After passed.
    // The requirement says: "success = after.tests.passed == true"
    // Also "Metrics do not decide success by default."

    const passedGate = afterResults.tests.passed;

    const comparison = {
        passed_gate: passedGate,
        improvement_summary: passedGate
            ? "After implementation passed all correctness and performance checks."
            : "After implementation failed checks."
    };

    const end = new Date();

    const report = {
        run_id: runId,
        started_at: start.toISOString(),
        finished_at: end.toISOString(),
        duration_seconds: (end - start) / 1000,
        environment: getEnvironmentInfo(),
        before: beforeResults,
        after: afterResults,
        comparison: comparison,
        success: passedGate,
        error: null
    };

    return report;
}

try {
    // Node.js crypto might not be globally available in older versions, but node:20 is fine.
    // We need to require it if we didn't above.
    global.crypto = require('crypto');

    const report = runEvaluation();
    const reportPath = path.join(REPORTS_DIR, 'latest.json');

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Report written to ${reportPath}`);

    process.exit(report.success ? 0 : 1);
} catch (e) {
    console.error("Evaluation crashed:", e);
    // Write crash report if possible
    try {
        const crashReport = {
            success: false,
            error: e.message
        };
        fs.writeFileSync(path.join(REPORTS_DIR, 'latest.json'), JSON.stringify(crashReport, null, 2));
    } catch (writeErr) {
        console.error("Could not write crash report:", writeErr);
    }
    process.exit(1);
}

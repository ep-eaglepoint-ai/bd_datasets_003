const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const REPORTS = path.join(ROOT, "evaluation", "reports");

function environmentInfo() {
    return {
        node: process.version,
        platform: os.platform() + " " + os.release(),
    };
}

function stripAnsi(str) {
    const pattern = [
        '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
        '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))'
    ].join('|');
    return str.replace(new RegExp(pattern, 'g'), '');
}

function parseTestOutput(output) {
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    const cleanOutput = stripAnsi(output);
    const testLines = cleanOutput.split('\n');
    const summaryLine = testLines.find(line => line.includes('Tests') && (line.includes('passed') || line.includes('failed')));

    if (summaryLine) {
        const passedMatch = summaryLine.match(/(\d+)\s+passed/);
        if (passedMatch) passed = parseInt(passedMatch[1], 10);

        const failedMatch = summaryLine.match(/(\d+)\s+failed/);
        if (failedMatch) failed = parseInt(failedMatch[1], 10);

        const skippedMatch = summaryLine.match(/(\d+)\s+skipped/);
        if (skippedMatch) skipped = parseInt(skippedMatch[1], 10);
    }

    return { passed, failed, skipped };
}

function runTestsDirect(repoType) {
    const projectPath = repoType === "after" ? "./repository_after" : "./repository_before";

    const result = spawnSync("npx", ["vitest", "run", "-c", "tests/vitest.config.ts", "tests/performance.test.tsx"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: { ...process.env, PROJECT_PATH: projectPath, CI: "true" },
        timeout: 300000,
    });

    const output = result.stdout + result.stderr;
    const { passed, failed, skipped } = parseTestOutput(output);
    const isSuccess = (failed === 0 && passed > 0);

    return {
        passed: isSuccess,
        return_code: result.status,
        tests_passed: passed,
        tests_failed: failed,
        tests_skipped: skipped,
        output: output.slice(0, 8000),
    };
}

function runTestsDocker(repoType) {
    const serviceName = `test-${repoType}`;
    try {
        const result = spawnSync("docker", ["compose", "run", "--rm", serviceName], {
            cwd: ROOT,
            encoding: "utf-8",
            timeout: 300000,
        });

        const output = result.stdout + result.stderr;
        const { passed, failed, skipped } = parseTestOutput(output);

        return {
            passed: failed === 0 && passed > 0,
            return_code: result.status,
            tests_passed: passed,
            tests_failed: failed,
            tests_skipped: skipped,
            output: output.slice(0, 8000),
        };
    } catch (e) {
        return {
            passed: false,
            return_code: -1,
            tests_passed: 0,
            tests_failed: 0,
            tests_skipped: 0,
            output: `Error running tests: ${e.message}`,
        };
    }
}

function runTests(repoType) {
    const inDocker = fs.existsSync("/.dockerenv") || process.env.DOCKER_CONTAINER;
    if (inDocker) {
        return runTestsDirect(repoType);
    } else {
        return runTestsDocker(repoType);
    }
}

function runMetrics(repoPath) {
    return {};
}

function evaluate(repoName, repoType) {
    const repoPath = path.join(ROOT, repoName);
    const tests = runTests(repoType);
    const metrics = runMetrics(repoPath);
    return { tests, metrics };
}

function printSeparator(char = "=", length = 70) {
    console.log(char.repeat(length));
}

function printTestSummary(name, result) {
    const tests = result.tests;
    const status = tests.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`\n${"─".repeat(35)}`);
    console.log(`  ${name}`);
    console.log(`${"─".repeat(35)}`);
    console.log(`  Status:          ${status}`);
    console.log(`  Tests Passed:    ${tests.tests_passed}`);
    console.log(`  Tests Failed:    ${tests.tests_failed}`);
    console.log(`  Tests Skipped:   ${tests.tests_skipped}`);
    console.log(`  Return Code:     ${tests.return_code}`);
}

function runEvaluation() {
    const runId = crypto.randomUUID();
    const start = new Date();

    printSeparator();
    console.log("  REACT ANALYTICS DASHBOARD EVALUATION");
    printSeparator();

    console.log(`\n  Run ID:     ${runId}`);
    console.log(`  Started:    ${start.toISOString().replace("T", " ").split(".")[0]} UTC`);
    console.log(`  Node:       ${process.version}`);
    console.log(`  Platform:   ${os.platform()}`);

    const inDocker = fs.existsSync("/.dockerenv") || process.env.DOCKER_CONTAINER;
    console.log(`  Environment: ${inDocker ? "Docker container" : "Host system"}`);

    console.log(`\n${"─".repeat(70)}`);
    console.log("  Running Tests...");
    console.log(`${"─".repeat(70)}`);

    console.log("\n  [1/2] Testing repository_before (unoptimized)...");
    const before = evaluate("repository_before", "before");

    console.log("  [2/2] Testing repository_after (optimized)...");
    const after = evaluate("repository_after", "after");

    if (after && after.tests && Object.prototype.hasOwnProperty.call(after.tests, "output")) {
        delete after.tests.output;
    }

    const comparison = {
        before_passed: before.tests.passed,
        after_passed: after.tests.passed,
        before_failed_count: before.tests.tests_failed,
        after_failed_count: after.tests.tests_failed,
        passed_gate: after.tests.passed && !before.tests.passed,
        improvement_summary: "",
    };

    if (comparison.passed_gate) {
        comparison.improvement_summary = `Optimization successful: repository_after passes all ${after.tests.tests_passed} tests, while repository_before fails ${before.tests.tests_failed} performance tests.`;
    } else if (after.tests.passed && before.tests.passed) {
        comparison.improvement_summary = "Both pass; test thresholds might be too lenient.";
    } else if (!after.tests.passed) {
        comparison.improvement_summary = `Failed: repository_after has ${after.tests.tests_failed} failing tests.`;
    }

    const end = new Date();
    const duration = (end - start) / 1000;

    const result = {
        run_id: runId,
        started_at: start.toISOString(),
        finished_at: end.toISOString(),
        duration_seconds: duration,
        environment: environmentInfo(),
        before: before,
        after: after,
        comparison: comparison,
        success: comparison.passed_gate,
        error: null,
    };

    const dateStr = start.toISOString().split("T")[0];
    const timeStr = start.toISOString().split("T")[1].split(".")[0].replace(/:/g, "-");
    const reportDir = path.join(REPORTS, dateStr, timeStr);

    try {
        fs.mkdirSync(reportDir, { recursive: true });
        const reportPath = path.join(reportDir, "report.json");
        fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));

        console.log(`\n${"─".repeat(70)}`);
        console.log("  RESULTS SUMMARY");
        console.log(`${"─".repeat(70)}`);

        printTestSummary("repository_before (unoptimized)", before);
        printTestSummary("repository_after (optimized)", after);

        console.log(`\n${"─".repeat(70)}`);
        console.log("  COMPARISON");
        console.log(`${"─".repeat(70)}`);

        const gateStatus = comparison.passed_gate ? "✅ PASSED" : "❌ FAILED";
        console.log(`\n  Optimization Gate:     ${gateStatus}`);
        console.log(`  Summary: ${comparison.improvement_summary}`);

        console.log(`\n  Report saved to: ${reportPath}`);
        console.log(`\n${"=".repeat(70)}`);
        console.log(result.success ? "  ✅ EVALUATION SUCCESSFUL ✅" : "  ❌ EVALUATION FAILED ❌");
        console.log(`${"=".repeat(70)}\n`);

        return result;
    } catch (e) {
        console.error("Error writing report:", e);
        return { success: false };
    }
}

function main() {
    try {
        const result = runEvaluation();
        process.exit(result.success ? 0 : 1);
    } catch (e) {
        console.error(`\n❌ Evaluation failed: ${e.message}`);
        process.exit(1);
    }
}

main();

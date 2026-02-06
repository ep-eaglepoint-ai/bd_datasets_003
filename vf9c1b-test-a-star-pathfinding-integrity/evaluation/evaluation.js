/**
 * Evaluation script for A-Star Pathfinding Test Suite
 * Runs all tests and generates a report in standard format
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseJestOutput(output) {
    // Try to find and parse JSON from Jest output
    const lines = output.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{') && trimmed.includes('numTotalTests')) {
            try {
                return JSON.parse(trimmed);
            } catch (e) {
                // Continue searching
            }
        }
    }

    // Try to find JSON anywhere in output
    const jsonMatch = output.match(/\{[^{}]*"numTotalTests"[^{}]*\}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch (e) {
            // Continue
        }
    }

    return null;
}

function countTestResults(output) {
    // Fallback: Parse test results from verbose output
    const passMatch = output.match(/Tests:\s+(\d+)\s+passed/);
    const totalMatch = output.match(/Tests:\s+\d+\s+passed,\s+(\d+)\s+total/);

    if (passMatch && totalMatch) {
        return {
            passed: parseInt(passMatch[1], 10),
            total: parseInt(totalMatch[1], 10),
            failed: parseInt(totalMatch[1], 10) - parseInt(passMatch[1], 10)
        };
    }

    return { passed: 0, total: 0, failed: 0 };
}

function extractTestNames(output) {
    const tests = [];
    const lines = output.split('\n');

    for (const line of lines) {
        // Match Jest verbose output pattern: √ or ✓ for passed, × or ✕ for failed
        const passMatch = line.match(/[√✓]\s+(.+?)\s*(?:\(\d+\s*ms\))?$/);
        const failMatch = line.match(/[×✕]\s+(.+?)\s*(?:\(\d+\s*ms\))?$/);

        if (passMatch) {
            tests.push({ name: passMatch[1].trim(), passed: true });
        } else if (failMatch) {
            tests.push({ name: failMatch[1].trim(), passed: false });
        }
    }

    return tests;
}

function runTests() {
    const report = {
        timestamp: new Date().toISOString(),
        repository_before: {
            passed: 0,
            failed: 0,
            total: 0,
            tests: []
        },
        repository_after: {
            passed: 0,
            failed: 0,
            total: 0,
            tests: []
        }
    };

    console.log('Running A-Star Pathfinding Tests...\n');

    // Run API tests (pathfinder tests)
    try {
        console.log('=== Running Pathfinder Tests (repository_before) ===');
        const apiResult = execSync('npm run test:api 2>&1', {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024
        });

        console.log(apiResult);

        const counts = countTestResults(apiResult);
        report.repository_before.total = counts.total;
        report.repository_before.passed = counts.passed;
        report.repository_before.failed = counts.failed;
        report.repository_before.tests = extractTestNames(apiResult);
    } catch (error) {
        const output = error.stdout || error.stderr || error.message || '';
        console.log(output);

        const counts = countTestResults(output);
        report.repository_before.total = counts.total;
        report.repository_before.passed = counts.passed;
        report.repository_before.failed = counts.failed;
        report.repository_before.tests = extractTestNames(output);
    }

    // Run Meta tests
    try {
        console.log('\n=== Running Meta Tests (repository_after) ===');
        const metaResult = execSync('npm run test:meta 2>&1', {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024
        });

        console.log(metaResult);

        const counts = countTestResults(metaResult);
        report.repository_after.total = counts.total;
        report.repository_after.passed = counts.passed;
        report.repository_after.failed = counts.failed;
        report.repository_after.tests = extractTestNames(metaResult);
    } catch (error) {
        const output = error.stdout || error.stderr || error.message || '';
        console.log(output);

        const counts = countTestResults(output);
        report.repository_after.total = counts.total;
        report.repository_after.passed = counts.passed;
        report.repository_after.failed = counts.failed;
        report.repository_after.tests = extractTestNames(output);
    }

    // Determine overall status
    const totalTests = report.repository_before.total + report.repository_after.total;
    const totalPassed = report.repository_before.passed + report.repository_after.passed;
    const totalFailed = report.repository_before.failed + report.repository_after.failed;

    const overallStatus = totalFailed === 0 && totalTests > 0 ? 'PASS' : 'FAIL';

    // Print summary
    console.log('\n========================================');
    console.log('           TEST SUMMARY');
    console.log('========================================');
    console.log(`Pathfinder Tests: ${report.repository_before.passed}/${report.repository_before.total} passed`);
    console.log(`Meta Tests: ${report.repository_after.passed}/${report.repository_after.total} passed`);
    console.log(`Overall: ${totalPassed}/${totalTests} passed`);
    console.log(`Status: ${overallStatus}`);
    console.log('========================================\n');

    // Create timestamped directory for report
    const now = new Date();
    const dateDir = now.toISOString().split('T')[0];
    const timeDir = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const reportDir = path.join(__dirname, dateDir, timeDir);

    fs.mkdirSync(reportDir, { recursive: true });

    // Write report to timestamped directory
    const reportPath = path.join(reportDir, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Report written to: ${reportPath}`);

    // Also write to evaluation directory root for easy access
    const rootReportPath = path.join(__dirname, 'report.json');
    fs.writeFileSync(rootReportPath, JSON.stringify(report, null, 2));
    console.log(`Report also written to: ${rootReportPath}`);

    return report;
}

// Run if called directly
if (require.main === module) {
    runTests();
}

module.exports = { runTests };

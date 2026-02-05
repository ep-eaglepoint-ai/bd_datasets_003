const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runTests(targetDir, port) {
    const testUrl = `http://localhost:${port}/index.html`;
    const resultsFile = `test-results-${targetDir}.json`;

    console.log(`\n=== Running tests against ${targetDir} ===\n`);

    try {
        const serverCommand = `npx http-server ${targetDir} -p ${port} -s &`;
        const serverProcess = execSync(serverCommand, {
            shell: true,
            timeout: 5000,
            stdio: 'ignore'
        });
    } catch (e) {
        // Server might already be running or started async
    }

    // Wait for server to start
    execSync('sleep 2 || timeout /t 2', { shell: true, stdio: 'ignore' });

    try {
        execSync(
            `TEST_URL=${testUrl} npx playwright test --reporter=json`,
            {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, TEST_URL: testUrl }
            }
        );
    } catch (e) {
        // Tests might fail, which is expected for repository_before
    }

    // Read results
    const resultsPath = path.join(process.cwd(), 'test-results.json');
    if (fs.existsSync(resultsPath)) {
        const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        return results;
    }

    return null;
}

function extractTestNames(results, status) {
    const tests = [];

    if (!results || !results.suites) return tests;

    function traverse(suite) {
        if (suite.specs) {
            for (const spec of suite.specs) {
                for (const test of spec.tests || []) {
                    const testName = `${suite.title} > ${spec.title}`;
                    const passed = test.results?.every(r => r.status === 'passed');

                    if (status === 'passed' && passed) {
                        tests.push(testName);
                    } else if (status === 'failed' && !passed) {
                        tests.push(testName);
                    }
                }
            }
        }

        if (suite.suites) {
            for (const sub of suite.suites) {
                traverse(sub);
            }
        }
    }

    for (const suite of results.suites) {
        traverse(suite);
    }

    return tests;
}

function getTestList(results) {
    const tests = { passed: [], failed: [] };

    if (!results || !results.suites) return tests;

    function traverse(suite, parentTitle = '') {
        const currentTitle = parentTitle ? `${parentTitle} > ${suite.title}` : suite.title;

        if (suite.specs) {
            for (const spec of suite.specs) {
                const testName = `${currentTitle} > ${spec.title}`;
                for (const test of spec.tests || []) {
                    const passed = test.results?.every(r => r.status === 'passed');
                    if (passed) {
                        tests.passed.push(testName);
                    } else {
                        tests.failed.push(testName);
                    }
                }
            }
        }

        if (suite.suites) {
            for (const sub of suite.suites) {
                traverse(sub, currentTitle);
            }
        }
    }

    for (const suite of results.suites) {
        traverse(suite);
    }

    return tests;
}

async function main() {
    console.log('Starting evaluation...\n');

    // Check if repository_before has index.html
    const beforeExists = fs.existsSync(path.join(process.cwd(), 'repository_before', 'index.html'));
    const afterExists = fs.existsSync(path.join(process.cwd(), 'repository_after', 'index.html'));

    let beforeTests = { passed: [], failed: [] };
    let afterTests = { passed: [], failed: [] };

    if (beforeExists) {
        const beforeResults = runTests('repository_before', 3001);
        beforeTests = getTestList(beforeResults);
    } else {
        console.log('repository_before/index.html does not exist - all tests considered failed');
        // Get test names from running against after (they will fail but we get the names)
    }

    if (afterExists) {
        const afterResults = runTests('repository_after', 3000);
        afterTests = getTestList(afterResults);
    } else {
        console.log('repository_after/index.html does not exist - all tests considered failed');
    }

    // FAIL_TO_PASS: tests that failed in before but pass in after
    const failToPass = afterTests.passed.filter(t =>
        !beforeExists || beforeTests.failed.includes(t) || !beforeTests.passed.includes(t)
    );

    // PASS_TO_PASS: tests that passed in before and still pass in after
    const passToPass = afterTests.passed.filter(t =>
        beforeExists && beforeTests.passed.includes(t)
    );

    const report = {
        instance_id: '3S3PMY',
        FAIL_TO_PASS: failToPass,
        PASS_TO_PASS: passToPass,
        total_tests: afterTests.passed.length + afterTests.failed.length,
        passed_after: afterTests.passed.length,
        failed_after: afterTests.failed.length,
        before_exists: beforeExists,
        after_exists: afterExists
    };

    // Write report
    fs.writeFileSync(
        path.join(process.cwd(), 'report.json'),
        JSON.stringify(report, null, 2)
    );

    console.log('\n=== Evaluation Report ===');
    console.log(`Total tests: ${report.total_tests}`);
    console.log(`Passed (after): ${report.passed_after}`);
    console.log(`Failed (after): ${report.failed_after}`);
    console.log(`FAIL_TO_PASS: ${failToPass.length} tests`);
    console.log(`PASS_TO_PASS: ${passToPass.length} tests`);
    console.log('\nReport saved to report.json');
}

main().catch(console.error);

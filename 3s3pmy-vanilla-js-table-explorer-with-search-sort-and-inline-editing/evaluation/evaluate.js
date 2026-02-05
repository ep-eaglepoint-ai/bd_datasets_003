const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const REPORTS = path.join(ROOT, "evaluation");

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function environmentInfo() {
  return {
    node_version: process.version,
    platform: `${os.platform()}-${os.release()}-${os.arch()}`,
  };
}

function runTests(targetDir, port) {
  const testUrl = `http://localhost:${port}/index.html`;
  const resultsFile = path.join(ROOT, "test-results.json");

  // Remove old results file
  if (fs.existsSync(resultsFile)) {
    fs.unlinkSync(resultsFile);
  }

  // Start server in background
  try {
    execSync(`npx http-server ${targetDir} -p ${port} -s &`, {
      cwd: ROOT,
      shell: "/bin/bash",
      stdio: "ignore",
      detached: true,
    });
  } catch (e) {
    // Server start returns immediately
  }

  // Wait for server
  execSync("sleep 3", { stdio: "ignore" });

  // Run tests
  let testOutput = "";
  let returnCode = 0;
  try {
    testOutput = execSync(`npx playwright test --reporter=json 2>&1`, {
      cwd: ROOT,
      env: { ...process.env, TEST_URL: testUrl },
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
    returnCode = 0;
  } catch (e) {
    testOutput = e.stdout || e.message;
    returnCode = e.status || 1;
  }

  // Parse results from stdout
  let results = null;
  if (testOutput) {
    try {
      const jsonMatch = testOutput.match(/\{[\s\S]*"suites"[\s\S]*\}/);
      if (jsonMatch) {
        results = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Could not parse JSON
    }
  }

  // Read from file if exists
  if (!results && fs.existsSync(resultsFile)) {
    try {
      results = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
    } catch (e) {
      // Could not parse file
    }
  }

  return { results, output: testOutput, returnCode };
}

function getTestList(results) {
  const tests = { passed: [], failed: [] };

  if (!results || !results.suites) return tests;

  function traverse(suite, parentTitle = "") {
    const currentTitle = parentTitle
      ? `${parentTitle} > ${suite.title}`
      : suite.title;

    if (suite.specs) {
      for (const spec of suite.specs) {
        const testName = `${currentTitle} > ${spec.title}`;
        for (const test of spec.tests || []) {
          const passed = test.results?.every((r) => r.status === "passed");
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

function evaluate(repoName) {
  const repoPath = path.join(ROOT, repoName);
  const indexPath = path.join(repoPath, "index.html");
  const exists = fs.existsSync(indexPath);

  if (!exists) {
    return {
      tests: {
        passed: false,
        return_code: 1,
        output: `${repoName}/index.html does not exist`,
      },
      metrics: {},
      test_list: { passed: [], failed: [] },
    };
  }

  const port = repoName === "repository_before" ? 3001 : 3000;
  const { results, output, returnCode } = runTests(repoName, port);
  const testList = getTestList(results);

  return {
    tests: {
      passed: testList.failed.length === 0 && testList.passed.length > 0,
      return_code: returnCode,
      output: output.substring(0, 8000),
    },
    metrics: {},
    test_list: testList,
  };
}

function runEvaluation() {
  const runId = generateUUID();
  const start = new Date();

  console.log("Starting evaluation...");
  console.log(`Run ID: ${runId}`);

  // Evaluate before
  console.log("\n=== Evaluating repository_before ===");
  const before = evaluate("repository_before");
  console.log(
    `Before: ${before.test_list.passed.length} passed, ${before.test_list.failed.length} failed`,
  );

  // Evaluate after
  console.log("\n=== Evaluating repository_after ===");
  const after = evaluate("repository_after");
  console.log(
    `After: ${after.test_list.passed.length} passed, ${after.test_list.failed.length} failed`,
  );

  const end = new Date();

  // Determine FAIL_TO_PASS and PASS_TO_PASS
  const beforePassed = new Set(before.test_list.passed);
  const afterPassed = new Set(after.test_list.passed);

  const failToPass = after.test_list.passed.filter((t) => !beforePassed.has(t));
  const passToPass = after.test_list.passed.filter((t) => beforePassed.has(t));

  const comparison = {
    passed_gate: after.tests.passed,
    improvement_summary: after.tests.passed
      ? "Repository after passes all correctness tests while repository before fails as expected."
      : "Repository after has failing tests.",
    FAIL_TO_PASS: failToPass,
    PASS_TO_PASS: passToPass,
  };

  return {
    run_id: runId,
    started_at: start.toISOString(),
    finished_at: end.toISOString(),
    duration_seconds: (end - start) / 1000,
    environment: environmentInfo(),
    before: {
      tests: before.tests,
      metrics: before.metrics,
    },
    after: {
      tests: after.tests,
      metrics: after.metrics,
    },
    comparison: comparison,
    success: comparison.passed_gate,
    error: null,
  };
}

function main() {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-"); // HH-MM-SS

  const outputDir = path.join(REPORTS, dateStr, timeStr);
  fs.mkdirSync(outputDir, { recursive: true });

  const report = runEvaluation();
  const reportPath = path.join(outputDir, "report.json");

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("\n=== Evaluation Report ===");
  console.log(
    `Total tests (after): ${report.after.tests.passed ? "PASSED" : "FAILED"}`,
  );
  console.log(`FAIL_TO_PASS: ${report.comparison.FAIL_TO_PASS.length} tests`);
  console.log(`PASS_TO_PASS: ${report.comparison.PASS_TO_PASS.length} tests`);
  console.log(`\nReport written to ${reportPath}`);

  return report.success ? 0 : 1;
}

process.exit(main());

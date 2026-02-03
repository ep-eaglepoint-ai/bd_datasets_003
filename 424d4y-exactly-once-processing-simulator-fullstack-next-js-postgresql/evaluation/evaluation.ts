import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import * as os from "os";
import * as crypto from "crypto";

const ROOT = path.resolve(__dirname, "..");
const REPORTS = path.join(ROOT, "evaluation", "reports");

interface TestResult {
  passed: boolean;
  return_code: number;
  output: string;
}

interface Metrics {
  ts_file_count: number;
  lines_of_code: number;
  error?: string;
}

interface EvaluationResult {
  tests: TestResult;
  metrics: Metrics;
}

const environmentInfo = () => ({
  node_version: process.version,
  platform: os.platform() + " " + os.release(),
});

const getRepoPath = () => {
  const possiblePath = path.join(ROOT, "repository_after");
  return fs.existsSync(possiblePath) ? possiblePath : ROOT;
};

const runTests = async (): Promise<TestResult> => {
  const cmd = `npm install && npx prisma generate && npx prisma db push && npm test`;
  const cwd = getRepoPath();

  return new Promise((resolve) => {
    child_process.exec(
      cmd,
      { cwd, timeout: 120000 },
      (error, stdout, stderr) => {
        const output = stdout + stderr;
        const truncatedOutput =
          output.length > 20000
            ? output.substring(0, 4000) +
              "\n...[truncated]...\n" +
              output.substring(output.length - 16000)
            : output;

        let passed = 0;
        let failed = 0;

        const passedMatch = output.match(/Tests:\s+(\d+)\s+passed/);
        if (passedMatch) passed = parseInt(passedMatch[1]);

        const failedMatch = output.match(/Tests:.*\s+(\d+)\s+failed/);
        if (failedMatch) failed = parseInt(failedMatch[1]);

        const suitesPassedMatch = output.match(/Test Suites:\s+(\d+)\s+passed/);
        const suitesFailedMatch = output.match(/Test Suites:.*?(\d+)\s+failed/);

        const isSuccess =
          !error && (passed > 0 || (!!suitesPassedMatch && !suitesFailedMatch));

        const explicitFail = output.includes("FAIL");
        const explicitPass = !explicitFail && output.includes("PASS");

        resolve({
          passed: !explicitFail && (explicitPass || isSuccess),
          return_code: error ? error.code || 1 : 0,
          output: truncatedOutput,
        });
      },
    );
  });
};

const runMetrics = (repoPathStr: string): Metrics => {
  const metrics: Metrics = {
    ts_file_count: 0,
    lines_of_code: 0,
  };

  if (!fs.existsSync(repoPathStr)) {
    return metrics;
  }

  const traverse = (dir: string) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (
          !file.startsWith(".") &&
          file !== "node_modules" &&
          file !== ".next"
        ) {
          traverse(fullPath);
        }
      } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        metrics.ts_file_count++;
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          metrics.lines_of_code += content.split("\n").length;
        } catch (e) {
          // ignore
        }
      }
    }
  };

  try {
    traverse(repoPathStr);
  } catch (e: any) {
    metrics.error = e.message;
  }

  return metrics;
};

const evaluate = async (repoName: string): Promise<EvaluationResult> => {
  const repoPath = getRepoPath();
  const tests = await runTests();
  const metrics = runMetrics(repoPath);
  return { tests, metrics };
};

const printReport = (report: any, reportPath: string) => {
  console.log("=".repeat(60));
  console.log("EVALUATION RESULTS");
  console.log("=".repeat(60));
  console.log();
  console.log(`Run ID: ${report.run_id}`);
  console.log(`Duration: ${report.duration_seconds.toFixed(2)} seconds`);

  console.log("AFTER (repository_after):");
  console.log(`  Tests passed: ${report.after.tests.passed}`);
  // Extract and display only the relevant test summary lines
  const outputLines = report.after.tests.output.split("\n");
  const summaryLine = outputLines.find((line: string) =>
    line.trim().startsWith("Tests:"),
  );
  const suitesLine = outputLines.find((line: string) =>
    line.trim().startsWith("Test Suites:"),
  );

  if (summaryLine) console.log(`  ${summaryLine.trim()}`);
  if (suitesLine) console.log(`  ${suitesLine.trim()}`);
  console.log();
  console.log("COMPARISON:");
  console.log(`  Passed gate: ${report.comparison.passed_gate}`);
  console.log(`  Summary: ${report.comparison.improvement_summary}`);
  console.log();
  console.log("=".repeat(60));
  console.log(`SUCCESS: ${report.success}`);
  console.log("=".repeat(60));
  console.log();
};

const main = async () => {
  const runId = crypto.randomUUID();
  const start = new Date();

  const after = await evaluate("repository_after");

  const passedGate = after.tests.passed;

  const comparison = {
    passed_gate: passedGate,
    improvement_summary: passedGate
      ? "Verification of requirements passed"
      : "Verification failed",
  };

  const end = new Date();
  const durationSeconds = (end.getTime() - start.getTime()) / 1000;

  const report = {
    run_id: runId,
    started_at: start.toISOString(),
    finished_at: end.toISOString(),
    duration_seconds: durationSeconds,
    environment: environmentInfo(),
    after,
    comparison,
    success: passedGate,
    error: null,
  };

  const dateStr = start.toISOString().split("T")[0];

  try {
    const timeStr = start.toISOString().split("T")[1].replace(/[:\.]/g, "-");
    const reportDir = path.join(REPORTS, dateStr, timeStr);
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    printReport(report, reportPath);
  } catch (e) {
    console.error("Failed to write report file:", e);
    printReport(report, "stdout");
  }

  if (!report.success) {
    console.error("Evaluation Verification Failed.");
    process.exit(1);
  }
  process.exit(0);
};

main();

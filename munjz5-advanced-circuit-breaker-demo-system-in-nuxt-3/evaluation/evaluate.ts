/**
 * Evaluation Script for Circuit Breaker Implementation
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import * as os from "os";
import { join } from "path";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface TestResult {
  nodeid: string;
  name: string;
  outcome: "passed" | "failed" | "error" | "skipped";
  error?: string;
  duration?: number;
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
}

interface RepositoryResults {
  success: boolean;
  exit_code: number;
  tests: TestResult[];
  summary: TestSummary;
  stdout: string;
  stderr: string;
}

interface EvaluationReport {
  run_id: string;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  success: boolean;
  error: string | null;
  environment: {
    node_version: string;
    platform: string;
    os: string;
    os_release: string;
    architecture: string;
    hostname: string;
    git_commit: string;
    git_branch: string;
  };
  results: {
    before: RepositoryResults | null;
    after: RepositoryResults;
    comparison: {
      before_tests_passed: boolean;
      after_tests_passed: boolean;
      before_total: number;
      before_passed: number;
      before_failed: number;
      after_total: number;
      after_passed: number;
      after_failed: number;
    };
  };
}

const BASE_URL = process.env.TEST_URL || "http://localhost:3000";
const INSTANCE_ID = process.env.INSTANCE_ID || "MUNJZ5";

function generateRunId(): string {
  return randomUUID().slice(0, 8);
}

function getGitInfo(): { git_commit: string; git_branch: string } {
  let git_commit = "unknown";
  let git_branch = "unknown";

  try {
    git_commit = execSync("git rev-parse HEAD", {
      encoding: "utf-8",
      timeout: 5000,
    })
      .trim()
      .slice(0, 8);
  } catch {}

  try {
    git_branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
  } catch {}

  return { git_commit, git_branch };
}

function getEnvironment() {
  const gitInfo = getGitInfo();
  return {
    node_version: process.version,
    platform: `${os.type()}-${os.release()}-${os.arch()}`,
    os: os.type(),
    os_release: os.release(),
    architecture: os.arch(),
    hostname: os.hostname(),
    git_commit: gitInfo.git_commit,
    git_branch: gitInfo.git_branch,
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resetBreakers(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/breaker/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {}
}

async function makeRequest(
  service: string,
  params: Record<string, string | number> = {},
): Promise<any> {
  const searchParams = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  );
  const response = await fetch(
    `${BASE_URL}/api/services/${service}?${searchParams}`,
  );
  return response.json();
}

type TestFunction = () => Promise<void>;

const tests: Array<{ name: string; fn: TestFunction }> = [
  {
    name: "Server routes accessible",
    fn: async () => {
      const response = await fetch(`${BASE_URL}/api/services/fast`);
      if (!response.ok) throw new Error("Server route not accessible");
      const data = await response.json();
      if (!data.serviceKey?.startsWith("upstream-"))
        throw new Error("Invalid serviceKey");
    },
  },
  {
    name: "CLOSED state support",
    fn: async () => {
      await resetBreakers();
      const result = await makeRequest("fast");
      if (result.stats.state !== "CLOSED")
        throw new Error(`Expected CLOSED, got ${result.stats.state}`);
    },
  },
  {
    name: "OPEN state support",
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 10; i++) {
        await makeRequest("flaky", {
          failureRate: 100,
          minimumRequestVolume: 3,
        });
      }
      const status = await fetch(
        `${BASE_URL}/api/breaker/status?serviceKey=upstream-flaky`,
      ).then((r) => r.json());
      if (status.status.state !== "OPEN")
        throw new Error(`Expected OPEN, got ${status.status.state}`);
    },
  },
  {
    name: "HALF_OPEN state support",
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 10; i++) {
        await makeRequest("flaky", {
          failureRate: 100,
          minimumRequestVolume: 3,
          resetTimeout: 300,
        });
      }
      await sleep(500);
      const result = await makeRequest("flaky", {
        failureRate: 0,
        resetTimeout: 300,
      });
      if (!["HALF_OPEN", "CLOSED"].includes(result.stats.state)) {
        throw new Error(
          `Expected HALF_OPEN or CLOSED, got ${result.stats.state}`,
        );
      }
    },
  },
  {
    name: "CLOSED to OPEN transition",
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 8; i++) {
        await makeRequest("flaky", {
          failureRate: 100,
          minimumRequestVolume: 3,
          failureRateThreshold: 40,
        });
      }
      const status = await fetch(
        `${BASE_URL}/api/breaker/status?serviceKey=upstream-flaky`,
      ).then((r) => r.json());
      if (status.status.state !== "OPEN")
        throw new Error(`Expected OPEN, got ${status.status.state}`);
    },
  },
  {
    name: "OPEN to HALF_OPEN after reset interval",
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 10; i++) {
        await makeRequest("flaky", {
          failureRate: 100,
          minimumRequestVolume: 3,
          resetTimeout: 300,
        });
      }
      await sleep(500);
      await makeRequest("flaky", { failureRate: 0, resetTimeout: 300 });
      const status = await fetch(
        `${BASE_URL}/api/breaker/status?serviceKey=upstream-flaky`,
      ).then((r) => r.json());
      if (!["HALF_OPEN", "CLOSED"].includes(status.status.state)) {
        throw new Error(
          `Expected HALF_OPEN or CLOSED, got ${status.status.state}`,
        );
      }
    },
  },
  {
    name: "HALF_OPEN to CLOSED after successful probes",
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 10; i++) {
        await makeRequest("flaky", {
          failureRate: 100,
          minimumRequestVolume: 3,
          resetTimeout: 200,
          successThreshold: 2,
        });
      }
      await sleep(400);
      for (let i = 0; i < 5; i++) {
        await makeRequest("flaky", {
          failureRate: 0,
          resetTimeout: 200,
          successThreshold: 2,
        });
      }
      const status = await fetch(
        `${BASE_URL}/api/breaker/status?serviceKey=upstream-flaky`,
      ).then((r) => r.json());
      if (status.status.state !== "CLOSED")
        throw new Error(`Expected CLOSED, got ${status.status.state}`);
    },
  },
  {
    name: "Immediate blocking when OPEN",
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 10; i++) {
        await makeRequest("flaky", {
          failureRate: 100,
          minimumRequestVolume: 3,
          resetTimeout: 30000,
        });
      }
      const start = Date.now();
      const result = await makeRequest("slow", {
        delay: 5000,
        resetTimeout: 30000,
      });
      const duration = Date.now() - start;
      if (!result.fallbackUsed) throw new Error("Expected fallback to be used");
      if (duration > 500)
        throw new Error(`Response took ${duration}ms, expected fast fail`);
    },
  },
  {
    name: "Fallback response when OPEN",
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 10; i++) {
        await makeRequest("flaky", {
          failureRate: 100,
          minimumRequestVolume: 3,
        });
      }
      const result = await makeRequest("flaky");
      if (!result.fallbackUsed) throw new Error("Expected fallback to be used");
      if (result.data === null) throw new Error("Expected fallback data");
    },
  },
  {
    name: "Rolling time window metrics",
    fn: async () => {
      await resetBreakers();
      await makeRequest("fast");
      const status = await fetch(
        `${BASE_URL}/api/breaker/status?serviceKey=upstream-fast`,
      ).then((r) => r.json());
      const m = status.status.metrics;
      if (!("totalSuccesses" in m) || !("buckets" in m))
        throw new Error("Missing metrics fields");
      if (!Array.isArray(m.buckets)) throw new Error("Expected buckets array");
    },
  },
  {
    name: "Timeout enforcement and classification",
    fn: async () => {
      await resetBreakers();
      await makeRequest("slow", { delay: 10000, timeout: 200 });
      const status = await fetch(
        `${BASE_URL}/api/breaker/status?serviceKey=upstream-slow`,
      ).then((r) => r.json());
      if (status.status.metrics.totalTimeouts < 1)
        throw new Error("Expected timeout to be recorded");
    },
  },
  {
    name: "No automatic retries",
    fn: async () => {
      await resetBreakers();
      const start = Date.now();
      await makeRequest("flaky", { failureRate: 100, timeout: 300 });
      const duration = Date.now() - start;
      if (duration > 1500)
        throw new Error(`Took ${duration}ms, may indicate retries`);
    },
  },
  {
    name: "State and stats in response",
    fn: async () => {
      await resetBreakers();
      const result = await makeRequest("fast");
      if (!result.stats) throw new Error("Missing stats");
      const required = ["state", "metrics", "lastStateChange", "config"];
      for (const f of required) {
        if (!(f in result.stats)) throw new Error(`Missing ${f}`);
      }
    },
  },
  {
    name: "Fast service available",
    fn: async () => {
      await resetBreakers();
      const result = await makeRequest("fast");
      if (result.data.service !== "fast")
        throw new Error("Fast service not working");
    },
  },
  {
    name: "Flaky service available",
    fn: async () => {
      await resetBreakers();
      const result = await makeRequest("flaky", { failureRate: 0 });
      if (result.data.service !== "flaky")
        throw new Error("Flaky service not working");
    },
  },
  {
    name: "Slow service available",
    fn: async () => {
      await resetBreakers();
      const result = await makeRequest("slow", { delay: 50, timeout: 5000 });
      if (result.data.service !== "slow")
        throw new Error("Slow service not working");
    },
  },
  {
    name: "State change logging",
    fn: async () => {
      await resetBreakers();
      for (let i = 0; i < 10; i++) {
        await makeRequest("flaky", {
          failureRate: 100,
          minimumRequestVolume: 3,
        });
      }
      const events = await fetch(
        `${BASE_URL}/api/breaker/events?seconds=60`,
      ).then((r) => r.json());
      const stateChanges = events.events.filter(
        (e: any) => e.eventType === "STATE_CHANGE",
      );
      if (stateChanges.length < 1) throw new Error("No state change events");
    },
  },
  {
    name: "UI dashboard serves",
    fn: async () => {
      const response = await fetch(BASE_URL);
      if (!response.ok) throw new Error(`UI returned ${response.status}`);
      const html = await response.text();
      if (!html.toLowerCase().includes("circuit"))
        throw new Error("Not circuit breaker UI");
    },
  },
];

async function runTests(): Promise<RepositoryResults> {
  console.log(`\nRunning tests against ${BASE_URL}\n`);

  const testResults: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  const stdout: string[] = [];

  for (const test of tests) {
    const testId = `${test.name.replace(/\s+/g, "_")}`;
    process.stdout.write(`${test.name}... `);

    const start = Date.now();
    try {
      await test.fn();
      passed++;
      const duration = Date.now() - start;
      console.log(`PASSED (${duration}ms)`);
      stdout.push(`${testId} PASSED`);
      testResults.push({
        nodeid: testId,
        name: test.name,
        outcome: "passed",
        duration,
      });
    } catch (error) {
      failed++;
      const duration = Date.now() - start;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`FAILED: ${errorMsg}`);
      stdout.push(`${testId} FAILED`);
      testResults.push({
        nodeid: testId,
        name: test.name,
        outcome: "failed",
        error: errorMsg,
        duration,
      });
    }

    await sleep(50);
  }

  return {
    success: failed === 0,
    exit_code: failed === 0 ? 0 : 1,
    tests: testResults,
    summary: {
      total: tests.length,
      passed,
      failed,
      errors: 0,
      skipped: 0,
    },
    stdout: stdout.join("\n"),
    stderr: "",
  };
}

async function evaluate(): Promise<EvaluationReport> {
  const runId = generateRunId();
  const startedAt = new Date();

  console.log(`\n${"=".repeat(60)}`);
  console.log("CIRCUIT BREAKER EVALUATION");
  console.log(`${"=".repeat(60)}`);
  console.log(`Run ID: ${runId}`);
  console.log(`Started at: ${startedAt.toISOString()}`);

  let afterResults: RepositoryResults;
  let success = false;
  let errorMessage: string | null = null;

  try {
    afterResults = await runTests();
    success = afterResults.success;
    if (!success) {
      errorMessage = "Some tests failed";
    }
  } catch (error) {
    afterResults = {
      success: false,
      exit_code: 1,
      tests: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 1, skipped: 0 },
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const finishedAt = new Date();
  const durationSeconds = (finishedAt.getTime() - startedAt.getTime()) / 1000;

  const report: EvaluationReport = {
    run_id: runId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: Math.round(durationSeconds * 1000000) / 1000000,
    success,
    error: errorMessage,
    environment: getEnvironment(),
    results: {
      before: null,
      after: afterResults,
      comparison: {
        before_tests_passed: false,
        after_tests_passed: afterResults.success,
        before_total: 0,
        before_passed: 0,
        before_failed: 0,
        after_total: afterResults.summary.total,
        after_passed: afterResults.summary.passed,
        after_failed: afterResults.summary.failed,
      },
    },
  };

  return report;
}

function generateOutputDir(): string {
  const now = new Date();

  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "-"); // HH-MM-SS

  const projectRoot = join(__dirname, "..");
  const outputDir = join(projectRoot, "evaluation", dateStr, timeStr);

  mkdirSync(outputDir, { recursive: true });

  return outputDir;
}

// Main execution
evaluate()
  .then((report) => {
    const outputDir = generateOutputDir();
    const outputPath = join(outputDir, "report.json");
    writeFileSync(outputPath, JSON.stringify(report, null, 2));

    console.log(`\n${"=".repeat(60)}`);
    console.log("EVALUATION COMPLETE");
    console.log(`${"=".repeat(60)}`);
    console.log(`Run ID: ${report.run_id}`);
    console.log(`Duration: ${report.duration_seconds.toFixed(2)}s`);
    console.log(`Success: ${report.success ? "YES" : "NO"}`);
    console.log(
      `Tests: ${report.results.after.summary.passed}/${report.results.after.summary.total} passed`,
    );
    console.log(`\nReport written to: ${outputPath}`);

    process.exit(report.success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Evaluation error:", error);
    process.exit(1);
  });

export { evaluate, EvaluationReport };

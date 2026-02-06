/**
 * Evaluation Script for Circuit Breaker Implementation
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import * as os from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REPORTS = join(ROOT, "evaluation");

const BASE_URL = process.env.TEST_URL || "http://localhost:3000";

interface TestsResult {
  passed: boolean;
  return_code: number;
  output: string;
}

interface RepoResult {
  tests: TestsResult;
  metrics: Record<string, unknown>;
}

interface EvaluationReport {
  run_id: string;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  environment: {
    node_version: string;
    platform: string;
  };
  before: RepoResult;
  after: RepoResult;
  comparison: {
    passed_gate: boolean;
    improvement_summary: string;
  };
  success: boolean;
  error: string | null;
}

function environmentInfo() {
  return {
    node_version: process.version,
    platform: `${os.type()}-${os.release()}-${os.arch()}`,
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
      if (m.buckets.length === 0)
        throw new Error("Expected buckets to contain data");
      if (!("windowSuccesses" in m) || !("windowFailures" in m))
        throw new Error("Missing rolling window fields");
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

async function runTests(): Promise<RepoResult> {
  console.log(`\nRunning tests against ${BASE_URL}\n`);

  const outputLines: string[] = [];
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    process.stdout.write(`${test.name}... `);

    const start = Date.now();
    try {
      await test.fn();
      passed++;
      const duration = Date.now() - start;
      console.log(`PASSED (${duration}ms)`);
      outputLines.push(`${test.name} PASSED (${duration}ms)`);
    } catch (error) {
      failed++;
      const duration = Date.now() - start;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`FAILED: ${errorMsg}`);
      outputLines.push(`${test.name} FAILED: ${errorMsg}`);
    }

    await sleep(50);
  }

  outputLines.push(`\n${passed} passed, ${failed} failed`);

  return {
    tests: {
      passed: failed === 0,
      return_code: failed === 0 ? 0 : 1,
      output: outputLines.join("\n").slice(-8000),
    },
    metrics: {},
  };
}

function runMetrics(): Record<string, unknown> {
  // Optional – trainers implement if needed
  return {};
}

async function runEvaluation(): Promise<EvaluationReport> {
  const runId = randomUUID();
  const start = new Date();

  console.log(`\n${"=".repeat(60)}`);
  console.log("CIRCUIT BREAKER EVALUATION");
  console.log(`${"=".repeat(60)}`);
  console.log(`Run ID: ${runId}`);
  console.log(`Started at: ${start.toISOString()}`);

  // Before repository is empty, so we create a failed result
  const beforeResult: RepoResult = {
    tests: {
      passed: false,
      return_code: 1,
      output: "repository_before is empty - no implementation",
    },
    metrics: {},
  };

  let afterResult: RepoResult;
  try {
    afterResult = await runTests();
  } catch (error) {
    afterResult = {
      tests: {
        passed: false,
        return_code: 1,
        output: error instanceof Error ? error.message : String(error),
      },
      metrics: {},
    };
  }

  const end = new Date();
  const durationSeconds = (end.getTime() - start.getTime()) / 1000;

  const passedGate = afterResult.tests.passed;
  let improvementSummary: string;
  if (passedGate && !beforeResult.tests.passed) {
    improvementSummary =
      "Repository after passes all correctness tests while repository before fails as expected.";
  } else if (passedGate) {
    improvementSummary = "Repository after passes all correctness tests.";
  } else {
    improvementSummary = "Repository after failed correctness tests.";
  }

  const formatTimestamp = (date: Date) =>
    date.toISOString().replace(/(\.\d{3})Z$/, "$1000Z");

  return {
    run_id: runId,
    started_at: formatTimestamp(start),
    finished_at: formatTimestamp(end),
    duration_seconds: Math.round(durationSeconds * 1000000) / 1000000,
    environment: environmentInfo(),
    before: beforeResult,
    after: afterResult,
    comparison: {
      passed_gate: passedGate,
      improvement_summary: improvementSummary,
    },
    success: passedGate,
    error: passedGate ? null : "After implementation tests failed",
  };
}

function generateOutputPath(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, "-");

  const outputDir = join(REPORTS, dateStr, timeStr);
  mkdirSync(outputDir, { recursive: true });

  return join(outputDir, "report.json");
}

// Main execution
runEvaluation()
  .then((report) => {
    const outputPath = generateOutputPath();
    writeFileSync(outputPath, JSON.stringify(report, null, 2));

    console.log(`\n${"=".repeat(60)}`);
    console.log("EVALUATION COMPLETE");
    console.log(`${"=".repeat(60)}`);
    console.log(`Run ID: ${report.run_id}`);
    console.log(`Duration: ${report.duration_seconds.toFixed(2)}s`);
    console.log(`Success: ${report.success ? "YES" : "NO"}`);
    console.log(`\nReport written to: ${outputPath}`);

    process.exit(report.success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Evaluation error:", error);
    process.exit(1);
  });

export { runEvaluation, EvaluationReport };

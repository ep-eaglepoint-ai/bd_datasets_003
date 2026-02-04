import * as child_process from "child_process";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as fs from "fs";
interface TestResult {
  passed: boolean;
  return_code: number;
  output: string;
}

interface EvaluationReport {
  run_id: string;
  started_at: string;
  finished_at?: string;
  duration_seconds?: number;
  environment: {
    node_version: string;
    platform: string;
    arch: string;
  };
  before: {
    tests: TestResult;
    metrics: Record<string, any>;
  };
  after: {
    tests: TestResult;
    metrics: Record<string, any>;
  };
  comparison: {
    passed_gate: boolean;
    improvement_summary: string;
  };
  success: boolean;
  error: string | null;
}

const REPO_BEFORE = "repository_before";
const REPO_AFTER = "repository_after";
const TEST_SCRIPT = "tests/test_audit.ts";

function runCommand(
  command: string,
  envOverrides: Record<string, string>,
): { code: number; stdout: string; stderr: string } {
  const env = { ...process.env, ...envOverrides };
  try {
    // execute synchronously to keep it simple
    const result = child_process.spawnSync(command, {
      encoding: "utf-8",
      shell: true,
      env: env,
      cwd: process.cwd(),
    });

    return {
      code: result.status ?? -1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } catch (e: any) {
    return {
      code: -1,
      stdout: "",
      stderr: e.message,
    };
  }
}

function runTypeScriptCheck(
  repoRelPath: string,
  scriptRelPath: string,
): TestResult {
  const absRepoPath = path.resolve(process.cwd(), repoRelPath);
  const cmd = `ts-node ${scriptRelPath}`;

  // We pass REPO_PATH to the test runner so it knows which implementation to load
  const result = runCommand(cmd, { REPO_PATH: absRepoPath });

  const output = (result.stdout + "\n" + result.stderr).trim();

  return {
    passed: result.code === 0,
    return_code: result.code,
    output: output,
  };
}

function main() {
  const startTime = new Date();
  const startTimeIso = startTime.toISOString();
  const runId = crypto.randomUUID();

  // 1. Before
  let beforeRes: TestResult;
  const beforeModulePath = path.join(
    path.resolve(process.cwd(), REPO_BEFORE),
    "audit_trail.ts",
  );

  if (fs.existsSync(beforeModulePath)) {
    beforeRes = runTypeScriptCheck(REPO_BEFORE, TEST_SCRIPT);
  } else {
    beforeRes = {
      passed: false,
      return_code: 1,
      output:
        "No implementation found in repository_before (clean state expected).",
    };
  }

  // 2. After
  const afterRes = runTypeScriptCheck(REPO_AFTER, TEST_SCRIPT);

  // 3. Comparison
  const passedGate = afterRes.passed && !beforeRes.passed;
  let improvementSummary = "";

  if (passedGate) {
    improvementSummary =
      "Repository after passes all correctness tests while repository before fails as expected.";
  } else if (!afterRes.passed) {
    improvementSummary = "Repository after failed correctness tests.";
  } else {
    improvementSummary = "Repository before unexpectedly passed.";
  }

  const endTime = new Date();
  const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

  const report: EvaluationReport = {
    run_id: runId,
    started_at: startTimeIso,
    finished_at: endTime.toISOString(),
    duration_seconds: durationSeconds,
    environment: {
      node_version: process.version,
      platform: os.platform(),
      arch: os.arch(),
    },
    before: {
      tests: {
        passed: beforeRes.passed,
        return_code: beforeRes.return_code,
        output: beforeRes.output,
      },
      metrics: {},
    },
    after: {
      tests: {
        passed: afterRes.passed,
        return_code: afterRes.return_code,
        output: afterRes.output,
      },
      metrics: {},
    },
    comparison: {
      passed_gate: passedGate,
      improvement_summary: improvementSummary,
    },
    success: passedGate,
    error: null,
  };

  // Ensure reports directory exists
  const reportsDir = path.join(process.cwd(), "evaluation", "reports");
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // Write report to file
  const reportPath = path.join(reportsDir, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // console.log(JSON.stringify(report, null, 2));

  if (!passedGate) {
    process.exit(1);
  }
}

main();

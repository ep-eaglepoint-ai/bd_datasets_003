/* eslint-disable no-console */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function die_oom() {
  try {
    process.stderr.write("evaluation: out of memory\n");
  } catch {
  }
  process.exit(0);
}

function run(cmd, args, env) {
  const start = process.hrtime.bigint();
  const result = spawnSync(cmd, args, {
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const end = process.hrtime.bigint();

  const durationMs = Number(end - start) / 1e6;

  return {
    cmd: [cmd, ...args].join(" "),
    exitCode: typeof result.status === "number" ? result.status : 0,
    durationMs,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function truncateOutput(s, maxLen) {
  if (!s) return "";
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "\n... (truncated)";
}

function toTestReport(result) {
  return {
    passed: result.exitCode === 0,
    return_code: result.exitCode,
    output: truncateOutput([result.stdout, result.stderr].filter(Boolean).join("\n"), 8000),
  };
}

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const python = process.env.PYTHON || "python";

  const startedAt = new Date();
  const startHr = process.hrtime.bigint();

  const testArgs = [
    "-m",
    "unittest",
    "discover",
    "-s",
    "tests",
    "-p",
    "test_*.py",
    "-q",
  ];

  const before = run(python, testArgs, {
    PHYSICS_REPO: "before",
    PYTHONPATH: repoRoot,
  });

  const after = run(python, testArgs, {
    PHYSICS_REPO: "after",
    PYTHONPATH: repoRoot,
  });

  const pyVersionRes = run(python, ["-c", "import sys; print(sys.version.split()[0])"], {
    PYTHONPATH: repoRoot,
  });

  const finishedAt = new Date();
  const durationSeconds = Number(process.hrtime.bigint() - startHr) / 1e9;

  const runId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());

  const improvementSummary =
    before.exitCode !== 0 && after.exitCode === 0
      ? "Tests now pass after the patch"
      : before.exitCode === 0 && after.exitCode === 0
        ? "Tests pass both before and after"
        : "Tests did not pass after the patch";

  const passedGate = after.exitCode === 0;
  const success = passedGate;

  const report = {
    run_id: runId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: durationSeconds,
    environment: {
      python_version: truncateOutput((pyVersionRes.stdout || "").trim(), 32) || "3.x",
      platform: `${process.platform}-${process.arch}`,
    },
    before: {
      tests: toTestReport(before),
      metrics: {},
    },
    after: {
      tests: toTestReport(after),
      metrics: {},
    },
    comparison: {
      passed_gate: passedGate,
      improvement_summary: improvementSummary,
    },
    success,
    error: null,
  };

  const reportsDir = path.join(__dirname, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const outPath = path.join(reportsDir, "report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify(report) + "\n");

  if (after.exitCode !== 0) {
    try {
      process.stderr.write("evaluation: repository_after tests failed (see evaluation/reports/report.json)\n");
    } catch {
    }
  }
}

process.on("unhandledRejection", (e) => {
  const msg = e && e.stack ? String(e.stack) : String(e);
  if (msg.includes("heap out of memory")) return die_oom();
  try {
    process.stderr.write(`evaluation: unhandled rejection: ${msg}\n`);
  } catch {
  }
  process.exit(0);
});

try {
  main();
} catch (e) {
  const msg = e && e.stack ? String(e.stack) : String(e);
  try {
    process.stderr.write(`evaluation: fatal error: ${msg}\n`);
  } catch {
  }
  process.exit(0);
}

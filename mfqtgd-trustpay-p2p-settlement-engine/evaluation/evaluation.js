const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const REPORTS_DIR = path.join(__dirname, "reports");
const REPORT_PATH = path.join(REPORTS_DIR, "report.json");

function nowIso() {
  return new Date().toISOString();
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], shell: true });
  const stdout = r.stdout || "";
  const stderr = r.stderr || "";
  const output = (stdout + stderr).slice(0, 8000);
  const code = r.status ?? (r.signal ? -1 : 0);
  return { code, output };
}

function main() {
  const started = Date.now();
  const startedAt = nowIso();

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const after = run("npm", ["test"], ROOT);
  const afterPassed = after.code === 0;

  // repository_before is empty in this dataset wrapper; treat it as "not applicable".
  const before = { code: -1, output: "repository_before is empty - no tests to run" };

  const finishedAt = nowIso();
  const durationSeconds = Math.max(0, Math.round((Date.now() - started) / 1000));

  const report = {
    run_id: crypto.randomUUID(),
    started_at: startedAt,
    finished_at: finishedAt,
    duration_seconds: durationSeconds,
    environment: {
      node_version: process.version,
      platform: `${os.platform()} ${os.release()}`,
    },
    before: {
      tests: { passed: false, return_code: before.code, output: before.output },
      metrics: {},
    },
    after: {
      tests: { passed: afterPassed, return_code: after.code, output: after.output },
      metrics: {},
    },
    comparison: {
      passed_gate: afterPassed,
      improvement_summary: afterPassed ? "After tests passed." : "After tests failed.",
    },
    success: afterPassed,
    error: afterPassed ? null : "After test suite failed",
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  process.stdout.write(`Wrote ${REPORT_PATH}\n`);
  return afterPassed ? 0 : 1;
}

process.exitCode = main();


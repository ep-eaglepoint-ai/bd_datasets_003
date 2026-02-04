const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

/** @typedef {{ name: string, outcome: 'passed'|'failed'|'error'|'skipped' }} test_case_t */
/** @typedef {{ success: boolean, exit_code: number, tests: test_case_t[], output: string }} run_results_t */

const FORBIDDEN_MARKERS = [
  "No tests found, exiting with code 1",
  "Jest did not exit one second after the test run has completed",
  "JavaScript heap out of memory",
  "EADDRINUSE",
];

function die_oom() {
  // evaluator must never fail the harness
  try {
    process.stderr.write("evaluation: out of memory\n");
  } catch {
    // ignore
  }
  process.exit(0);
}

function truncateOutput(s, maxLen = 65536) {
  if (typeof s !== "string") return "";
  if (s.length <= maxLen) return s;
  const tail = "\n...<truncated>...\n";
  return s.slice(0, Math.max(0, maxLen - tail.length)) + tail;
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/\x1b\[[0-9;]*m/g, "");
}

function generateRunId() {
  return crypto.randomBytes(4).toString("hex");
}

function runOneLine(cmd) {
  const r = spawnSync(cmd, {
    shell: true,
    encoding: "utf8",
  });
  const out = (r.stdout || "") + (r.stderr || "");
  const first = out.split("\n", 1)[0] || "";
  return first.trim();
}

function testsPush(rr, name, outcome) {
  rr.tests.push({ name, outcome });
}

function runCommandMerged(cmd, args, opts) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    ...opts,
  });

  const stdout = r.stdout || "";
  const stderr = r.stderr || "";
  const combined = truncateOutput(`${stdout}\n${stderr}`);

  let exitCode = -1;
  if (typeof r.status === "number") exitCode = r.status;
  else if (typeof r.signal === "string") exitCode = -1;

  return { exitCode, output: combined };
}

function uniquePush(rr, name, outcome) {
  for (const t of rr.tests) {
    if (t.name === name) return;
  }
  testsPush(rr, name, outcome);
}

function parseJestOutput(rr) {
  // Parse Jest output for both file-level and verbose per-test lines.
  // File-level summary lines look like:
  //   PASS  repository_after/foo.test.ts
  //   FAIL  repository_after/bar.test.ts
  // Verbose per-test lines are typically:
  //   ✓ test name
  //   ✕ test name
  const out = stripAnsi(rr.output || "");
  const lines = out.split("\n");

  // IMPORTANT: Jest prints both per-file PASS/FAIL lines and per-test ✓/✕ lines.
  // The terminal "Tests: X total" refers to per-test cases, not per-file lines.
  // So we only count per-test lines by default.
  /** @type {test_case_t[]} */
  const fileOutcomes = [];

  for (const raw of lines) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;

    const mPassFile = line.match(/^\s*PASS\s+(.+?)(\s+\(.*\))?\s*$/);
    if (mPassFile) {
      const name = (mPassFile[1] || "").trim();
      if (name) fileOutcomes.push({ name, outcome: "passed" });
      continue;
    }

    const mFailFile = line.match(/^\s*FAIL\s+(.+?)(\s+\(.*\))?\s*$/);
    if (mFailFile) {
      const name = (mFailFile[1] || "").trim();
      if (name) fileOutcomes.push({ name, outcome: "failed" });
      continue;
    }

    // Skip summary lines like: "✓ tests/foo.test.ts (10 tests)"
    if (/^\s*[✓√]\s+.*\(\d+\s+tests?\)/.test(line)) continue;

    const mPass = line.match(/^\s*[✓√]\s+(.*)$/);
    if (mPass) {
      const name = (mPass[1] || "").trim();
      if (name) uniquePush(rr, name, "passed");
      continue;
    }

    const mFail = line.match(/^\s*[×✗xX✕]\s+(.*)$/);
    if (mFail) {
      const name = (mFail[1] || "").trim();
      if (name) uniquePush(rr, name, "failed");
      continue;
    }
  }

  // Fallback: if Jest didn't emit per-test lines, use per-file PASS/FAIL lines.
  if (rr.tests.length === 0 && fileOutcomes.length > 0) {
    for (const t of fileOutcomes) {
      uniquePush(rr, t.name, t.outcome);
    }
  }
}

function computeSuccess(rr) {
  if (!rr.tests || rr.tests.length === 0) return false;
  for (const t of rr.tests) {
    if (t.outcome === "failed" || t.outcome === "error") return false;
  }
  return true;
}

function requiredEnvDiagnostics() {
  const required = [
    "PGHOST",
    "PGPORT",
    "PGUSER",
    "PGPASSWORD",
    "PGDATABASE",
    "REDIS_HOST",
    "REDIS_PORT",
    "REDIS_DB",
  ];

  const missing = [];
  for (const k of required) {
    if (!process.env[k]) missing.push(k);
  }

  return { required, missing };
}

function hasLocalJest(projectRoot) {
  const bin = path.join(
    projectRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "jest.cmd" : "jest"
  );
  const js = path.join(projectRoot, "node_modules", "jest", "bin", "jest.js");
  return fs.existsSync(bin) || fs.existsSync(js);
}

function ensureDependencies(projectRoot, timeoutS) {
  if (hasLocalJest(projectRoot)) return;

  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
  const { exitCode, output } = runCommandMerged(
    npmBin,
    ["install", "--no-audit", "--no-fund"],
    {
      cwd: projectRoot,
      timeout: Math.max(30, timeoutS) * 1000,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
    }
  );

  if (exitCode !== 0 && !hasLocalJest(projectRoot)) {
    // Best effort only; record in output by throwing a readable message.
    throw new Error(
      `npm install failed (exit ${exitCode}):\n${truncateOutput(output)}`
    );
  }
}

/**
 * Runs a root npm script and parses Jest output.
 * @param {string} scriptName
 * @param {number} timeoutS
 * @returns {run_results_t}
 */
function runRootScript(scriptName, timeoutS) {
  /** @type {run_results_t} */
  const rr = { success: false, exit_code: -1, tests: [], output: "" };

  const projectRoot = path.resolve(__dirname, "..");
  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) {
    rr.exit_code = -1;
    rr.output = truncateOutput(`project not runnable: missing ${pkgPath}\n`);
    testsPush(rr, "runner", "error");
    rr.success = false;
    return rr;
  }

  try {
    ensureDependencies(projectRoot, Math.min(180, Math.max(30, timeoutS)));
  } catch (e) {
    const msg = e && e.stack ? String(e.stack) : String(e);
    rr.exit_code = -1;
    rr.output = truncateOutput(`dependency install error:\n${msg}\n`);
    testsPush(rr, "dependencies", "error");
    rr.success = false;
    return rr;
  }

  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";

  // Force verbose output so we can parse test names where possible.
  const { exitCode, output } = runCommandMerged(
    npmBin,
    ["run", scriptName, "--", "--verbose", "--no-color"],
    {
      cwd: projectRoot,
      timeout: Math.max(1, timeoutS) * 1000,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
    }
  );

  rr.exit_code = exitCode;
  rr.output = truncateOutput(output);

  // Forbidden markers: count as error for reporting clarity.
  const foundForbidden = FORBIDDEN_MARKERS.find((m) => rr.output.includes(m));
  if (foundForbidden) {
    testsPush(rr, `marker:${foundForbidden}`, "error");
  }

  parseJestOutput(rr);

  if (rr.tests.length === 0) {
    // Surface that the runner did not execute tests.
    testsPush(rr, "runner", exitCode === 0 ? "error" : "error");
    rr.success = false;
  } else {
    rr.success = computeSuccess(rr);
  }

  // Timeout convention: spawnSync returns signal sometimes; add explicit marker.
  if (rr.exit_code !== 0 && rr.output.toLowerCase().includes("timed out")) {
    rr.success = false;
    testsPush(rr, "timeout", "error");
  }

  return rr;
}

function writeReportJson(reportPath, runId, runs) {
  const now = new Date();
  const startedAt = now.toISOString();

  const gitCommit = (
    runOneLine("git rev-parse HEAD 2>/dev/null") || "unknown"
  ).slice(0, 8);
  const gitBranch =
    runOneLine("git rev-parse --abbrev-ref HEAD 2>/dev/null") || "unknown";
  const unameS = runOneLine("uname -a 2>/dev/null") || "unknown";
  const nodeV = runOneLine("node --version 2>/dev/null") || "unknown";
  const npmV = runOneLine("npm --version 2>/dev/null") || "unknown";

  function summarize(rr) {
    let passed = 0,
      failed = 0,
      errors = 0,
      skipped = 0;
    for (const t of rr.tests) {
      if (t.outcome === "passed") passed++;
      else if (t.outcome === "failed") failed++;
      else if (t.outcome === "error") errors++;
      else if (t.outcome === "skipped") skipped++;
    }
    return { total: rr.tests.length, passed, failed, errors, skipped };
  }

  const after = runs.after;
  const meta = runs.meta;

  const { missing } = requiredEnvDiagnostics();

  const criteria = {
    env_vars_present: missing.length === 0 ? "Pass" : "Fail",
    integration_suite_passes: after && after.success ? "Pass" : "Fail",
    meta_suite_passes: meta && meta.success ? "Pass" : "Fail",
    meta_proves_faulty_sut_fails: meta && meta.success ? "Pass" : "Fail",
  };

  const report = {
    run_id: runId,
    tool: "PNIW21 Integration Test Evaluator",
    started_at: startedAt,
    environment: {
      platform: unameS,
      os: "linux",
      node: nodeV,
      npm: npmV,
      git_commit: gitCommit || "unknown",
      git_branch: gitBranch || "unknown",
      required_env_missing: missing,
    },
    runs: {
      after: {
        success: !!after.success,
        exit_code: after.exit_code,
        summary: summarize(after),
        tests: after.tests,
        output: after.output || "",
      },
      meta: {
        success: !!meta.success,
        exit_code: meta.exit_code,
        summary: summarize(meta),
        tests: meta.tests,
        output: meta.output || "",
      },
    },
    criteria_analysis: criteria,
    comparison: {
      summary: "Integration suite plus meta suite validation",
      success: !!(after && after.success && meta && meta.success),
    },
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
}

function main() {
  const projectRoot = path.resolve(__dirname, "..");
  let outputPath = path.join(projectRoot, "evaluation", "report.json");
  let timeoutS = 240;

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--output" && i + 1 < argv.length) {
      const provided = argv[++i];
      outputPath = path.isAbsolute(provided)
        ? provided
        : path.join(projectRoot, provided);
    } else if (argv[i] === "--timeout" && i + 1 < argv.length) {
      const n = parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n > 0) timeoutS = n;
    }
  }

  const runId = generateRunId();
  process.stdout.write(`Starting PNIW21 Evaluation [Run ID: ${runId}]\n`);

  const envDiag = requiredEnvDiagnostics();
  if (envDiag.missing.length > 0) {
    process.stdout.write(
      `Warning: missing env vars for Postgres/Redis: ${envDiag.missing.join(
        ", "
      )}\n`
    );
  }

  const after = runRootScript("test:after", timeoutS);
  const meta = runRootScript("test:meta", timeoutS);

  try {
    writeReportJson(outputPath, runId, { after, meta });
    process.stdout.write(`Report saved to: ${outputPath}\n`);
  } catch (e) {
    const msg = e && e.stack ? String(e.stack) : String(e);
    process.stderr.write(`evaluation: failed to write report: ${msg}\n`);
  }

  // ALWAYS EXIT 0
  process.exit(0);
}

process.on("uncaughtException", (e) => {
  const msg = e && e.stack ? String(e.stack) : String(e);
  if (msg.includes("heap out of memory")) return die_oom();
  try {
    process.stderr.write(`evaluation: unhandled error: ${msg}\n`);
  } catch {
    // ignore
  }
  process.exit(0);
});

process.on("unhandledRejection", (e) => {
  const msg = e && e.stack ? String(e.stack) : String(e);
  if (msg.includes("heap out of memory")) return die_oom();
  try {
    process.stderr.write(`evaluation: unhandled rejection: ${msg}\n`);
  } catch {
    // ignore
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
    // ignore
  }
  process.exit(0);
}

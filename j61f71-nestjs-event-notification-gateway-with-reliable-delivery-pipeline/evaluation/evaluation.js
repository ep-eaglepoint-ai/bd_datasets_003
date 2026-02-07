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
  const out = stripAnsi(rr.output || "");
  const lines = out.split("\n");

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
    throw new Error(
      `npm install failed (exit ${exitCode}):\n${truncateOutput(output)}`
    );
  }
}

function runAfterTests(timeoutS) {
  /** @type {run_results_t} */
  const rr = { success: false, exit_code: -1, tests: [], output: "" };

  const repoRoot = path.resolve(__dirname, "..");
  const afterRoot = path.join(repoRoot, "repository_after");
  const pkgPath = path.join(afterRoot, "package.json");

  if (!fs.existsSync(pkgPath)) {
    rr.exit_code = -1;
    rr.output = truncateOutput(`project not runnable: missing ${pkgPath}\n`);
    testsPush(rr, "runner", "error");
    rr.success = false;
    return rr;
  }

  try {
    ensureDependencies(afterRoot, Math.min(180, Math.max(30, timeoutS)));
  } catch (e) {
    const msg = e && e.stack ? String(e.stack) : String(e);
    rr.exit_code = -1;
    rr.output = truncateOutput(`dependency install error:\n${msg}\n`);
    testsPush(rr, "dependencies", "error");
    rr.success = false;
    return rr;
  }

  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";

  const { exitCode, output } = runCommandMerged(
    npmBin,
    ["run", "test:after", "--", "--verbose", "--no-color"],
    {
      cwd: afterRoot,
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

  const foundForbidden = FORBIDDEN_MARKERS.find((m) => rr.output.includes(m));
  if (foundForbidden) {
    testsPush(rr, `marker:${foundForbidden}`, "error");
  }

  parseJestOutput(rr);

  if (rr.tests.length === 0) {
    testsPush(rr, "runner", "error");
    rr.success = false;
  } else {
    rr.success = computeSuccess(rr);
  }

  if (rr.exit_code !== 0 && rr.output.toLowerCase().includes("timed out")) {
    rr.success = false;
    testsPush(rr, "timeout", "error");
  }

  return rr;
}

function writeReportJson(reportPath, runId, after) {
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

  // Project-specific criteria checks (based on required test coverage)
  const hasSigCompute = after.tests.some(
    (t) => t.name.includes("computes HMAC-SHA256") && t.outcome === "passed"
  );
  const hasTimingSafe = after.tests.some(
    (t) => t.name.includes("timing-safe") && t.outcome === "passed"
  );
  const hasSignatureHeader = after.tests.some(
    (t) =>
      t.name.includes("attaches X-Webhook-Signature header") &&
      t.outcome === "passed"
  );
  const hasRetryDelay = after.tests.some(
    (t) =>
      t.name.includes("computes exponential delays") && t.outcome === "passed"
  );
  const hasJitterBounds = after.tests.some(
    (t) => t.name.includes("adds jitter") && t.outcome === "passed"
  );
  const hasCircuitOpenHalfOpen = after.tests.some(
    (t) => t.name.includes("opens after 5 failures") && t.outcome === "passed"
  );
  const hasCircuitHalfOpenFailureReopens = after.tests.some(
    (t) =>
      t.name.includes("re-opens when half-open probe fails") &&
      t.outcome === "passed"
  );
  const hasCircuitHalfOpenSuccessCloses = after.tests.some(
    (t) =>
      t.name.includes("transitions from half-open to closed") &&
      t.outcome === "passed"
  );
  const hasCircuitTransitions =
    hasCircuitOpenHalfOpen &&
    hasCircuitHalfOpenFailureReopens &&
    hasCircuitHalfOpenSuccessCloses;
  const hasQuarantineReplay = after.tests.some(
    (t) => t.name.includes("resets circuit breaker") && t.outcome === "passed"
  );
  const hasQuarantineCreation = after.tests.some(
    (t) => t.name.includes("creates quarantine entry") && t.outcome === "passed"
  );
  const hasDeliveryLogFields = after.tests.some(
    (t) => t.name.includes("logs all required fields") && t.outcome === "passed"
  );

  // Check for the presence of edge case tests
  const hasEdgeCases = after.tests.some(
    (t) =>
      (t.name.toLowerCase().includes("edge") ||
        t.name.includes("handles event with 0 subscribers") ||
        t.name.includes("propagates 404") ||
        t.name.includes("handles unicode correctly")) &&
      t.outcome === "passed"
  );

  const criteria = {
    integration_suite_passes: after && after.success ? "Pass" : "Fail",
    signature_hmac_computation: hasSigCompute ? "Pass" : "Fail",
    signature_timing_safe_verification: hasTimingSafe ? "Pass" : "Fail",
    signature_header_attached: hasSignatureHeader ? "Pass" : "Fail",
    retry_exponential_backoff: hasRetryDelay ? "Pass" : "Fail",
    retry_jitter_bounds: hasJitterBounds ? "Pass" : "Fail",
    circuit_breaker_transitions: hasCircuitTransitions ? "Pass" : "Fail",
    quarantine_creation: hasQuarantineCreation ? "Pass" : "Fail",
    quarantine_replay: hasQuarantineReplay ? "Pass" : "Fail",
    delivery_log_fields: hasDeliveryLogFields ? "Pass" : "Fail",
    robustness_edge_cases: hasEdgeCases ? "Pass" : "Fail",
  };

  const coveragePassed =
    hasSigCompute &&
    hasTimingSafe &&
    hasSignatureHeader &&
    hasRetryDelay &&
    hasJitterBounds &&
    hasCircuitTransitions &&
    hasQuarantineCreation &&
    hasQuarantineReplay &&
    hasDeliveryLogFields &&
    hasEdgeCases;

  const report = {
    run_id: runId,
    tool: "NestJS Event Notification Gateway Evaluator",
    started_at: startedAt,
    environment: {
      platform: unameS,
      os: "linux",
      node: nodeV,
      npm: npmV,
      git_commit: gitCommit || "unknown",
      git_branch: gitBranch || "unknown",
    },
    runs: {
      before: null,
      after: {
        success: !!after.success,
        exit_code: after.exit_code,
        summary: summarize(after),
        tests: after.tests,
        output: after.output || "",
      },
    },
    criteria_analysis: criteria,
    comparison: {
      summary: "Webhook delivery system: test run completed",
      success: !!(after && after.success && coveragePassed),
    },
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
}

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  let outputPath = path.join(repoRoot, "evaluation", "report.json");
  let timeoutS = 240;

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--output" && i + 1 < argv.length) {
      const provided = argv[++i];
      outputPath = path.isAbsolute(provided)
        ? provided
        : path.join(repoRoot, provided);
    } else if (argv[i] === "--timeout" && i + 1 < argv.length) {
      const n = parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n > 0) timeoutS = n;
    }
  }

  const runId = generateRunId();
  process.stdout.write(
    `Starting NestJS Event Notification Gateway Evaluation [Run ID: ${runId}]\n`
  );

  const after = runAfterTests(timeoutS);

  try {
    writeReportJson(outputPath, runId, after);
    process.stdout.write(`Report saved to: ${outputPath}\n`);
  } catch (e) {
    const msg = e && e.stack ? String(e.stack) : String(e);
    process.stderr.write(`evaluation: failed to write report: ${msg}\n`);
  }

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

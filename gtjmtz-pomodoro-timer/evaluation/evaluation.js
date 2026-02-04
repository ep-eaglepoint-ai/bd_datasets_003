// JS evaluator that mirrors the structure/behavior of the provided C harness:
// - Runs "before" and "after" (best-effort)
// - Parses test output into named test cases with outcomes
// - Writes evaluation/report.json
// - ALWAYS exits 0 so the harness never fails

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

/** @typedef {{ name: string, outcome: 'passed'|'failed'|'error'|'skipped' }} test_case_t */
/** @typedef {{ success: boolean, exit_code: number, tests: test_case_t[], output: string }} run_results_t */

const FORBIDDEN_MARKERS = [
  "The CJS build of Vite",
  "vite.dev/guide/troubleshooting.html#vite-cjs-node-api-depre",
  "vite-cjs-node-api-depre",
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
  // 8 hex chars
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

function parseVitestOutput(rr) {
  // Vitest prints checkmarks for passing tests:
  //   ✓ test name
  // and crosses for failing tests:
  //   × test name
  const out = stripAnsi(rr.output || "");
  const lines = out.split("\n");
  for (const raw of lines) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;

    // Skip file summary lines like: "✓ tests/pomodoro.test.tsx (10 tests) 538ms"
    // but DO NOT skip verbose per-test lines like: "✓ tests/pomodoro.test.tsx > suite > test".
    if (/^\s*[✓√]\s+tests\/.*\(\d+\s+tests?\)/.test(line)) continue;

    const mPass = line.match(/^\s*[✓√]\s+(.*)$/);
    if (mPass) {
      const name = (mPass[1] || "").trim();
      if (name) testsPush(rr, name, "passed");
      continue;
    }
    const mFail = line.match(/^\s*[×✗xX]\s+(.*)$/);
    if (mFail) {
      const name = (mFail[1] || "").trim();
      if (name) testsPush(rr, name, "failed");
      continue;
    }
  }
}

function runCommandMerged(cmd, args, opts) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    ...opts,
  });

  const stdout = r.stdout || "";
  const stderr = r.stderr || "";
  const combined = truncateOutput(`${stdout}\n${stderr}`);

  // spawnSync uses different fields across platforms; normalize
  let exitCode = -1;
  if (typeof r.status === "number") exitCode = r.status;
  else if (typeof r.signal === "string") exitCode = -1;

  return { exitCode, output: combined };
}

/**
 * Best-effort "before" and "after" runs.
 * For this dataset, repository_before may be empty; we report an error but still produce a report.
 * @param {string} repoDir
 * @param {'before'|'after'} label
 * @param {number} timeoutS
 * @returns {run_results_t}
 */
function runRepoTests(repoDir, label, timeoutS) {
  /** @type {run_results_t} */
  const rr = { success: false, exit_code: -1, tests: [], output: "" };

  const projectRoot = path.resolve(__dirname, "..");
  const repoPath = path.join(projectRoot, repoDir);
  const pkgPath = path.join(repoPath, "package.json");
  const exists = fs.existsSync(repoPath);

  if (!exists || !fs.existsSync(pkgPath)) {
    rr.exit_code = -1;
    rr.output = truncateOutput(
      `repository_${label} not runnable: missing ${pkgPath}\n`
    );
    testsPush(rr, "runner", "error");
    rr.success = false;
    return rr;
  }

  // Run inside the current environment (the evaluation itself is executed in Docker).
  // This avoids Docker-in-Docker and keeps the evaluator portable.
  const vitestBin = path.join(
    repoPath,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "vitest.cmd" : "vitest"
  );

  const { exitCode, output } = runCommandMerged(
    vitestBin,
    ["run", "--reporter", "verbose", "--no-color"],
    {
      cwd: repoPath,
      timeout: Math.max(1, timeoutS) * 1000,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
    }
  );
  rr.exit_code = exitCode;
  // Drop the Vite CJS deprecation warning lines from stored output.
  rr.output = output
    .split("\n")
    .filter((l) => {
      if (l.includes("The CJS build of Vite")) return false;
      if (l.includes("vite.dev/guide/troubleshooting")) return false;
      if (l.includes("vite-cjs-node-api-deprecat")) return false;
      if (/^\s*d for more details\./.test(l)) return false;
      return true;
    })
    .join("\n");

  // warning markers: count as error for reporting clarity
  const foundForbidden = FORBIDDEN_MARKERS.find((m) => rr.output.includes(m));
  if (foundForbidden) {
    testsPush(rr, "vite_cjs_deprecation_warning", "error");
  }

  parseVitestOutput(rr);

  // Define success based on parsed outcomes (similar spirit to the C harness)
  if (rr.tests.length === 0) {
    testsPush(rr, "runner", "error");
    rr.success = false;
  } else {
    rr.success = true;
    for (const t of rr.tests) {
      if (t.outcome === "failed" || t.outcome === "error") {
        rr.success = false;
        break;
      }
    }
  }

  // timeout convention: spawnSync throws on timeout? It returns signal sometimes.
  // If exit_code is -1 and output mentions timeout, add explicit marker.
  if (rr.exit_code !== 0 && rr.output.toLowerCase().includes("timed out")) {
    rr.success = false;
    testsPush(rr, "timeout", "error");
  }

  return rr;
}

function outcomeForTest(rr, name) {
  for (const t of rr.tests) {
    if (t.name === name) return t.outcome;
    // Verbose reporter includes file + suite prefixes; allow suffix/contains matching.
    if (t.name.endsWith(name)) return t.outcome;
    if (t.name.includes(`> ${name}`)) return t.outcome;
  }
  return null;
}

function passFailNotRun(rr, name) {
  const o = outcomeForTest(rr, name);
  if (!o) return "Not Run";
  return o === "passed" ? "Pass" : "Fail";
}

function writeReportJson(reportPath, runId, before, after) {
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

  // Map our 10 requirement tests to criteria fields (similar to the C harness approach)
  const REQ_TESTS = [
    "shows initial Focus 25:00, monospaced digits, controls, and audio src",
    "mode switching stops running timer and resets to new full duration",
    "Start, Pause, Reset: pause retains time; reset returns to full duration",
    "Settings: saving updates display immediately when not running; invalid (<=0) shows error",
    "Settings: saving while running does not reset the current countdown",
    "Focus completion logs history only when run from full duration to 00:00; persists; plays audio",
    "does NOT log focus history if user resets or switches modes before completion",
    "loads existing history from localStorage on mount (most recent first)",
    "handles invalid localStorage history gracefully",
    "cleans up intervals when paused (no extra ticking after pause)",
  ];

  const criteria = {
    req1_initial_state_and_audio: passFailNotRun(after, REQ_TESTS[0]),
    req2_mode_switch_resets: passFailNotRun(after, REQ_TESTS[1]),
    req3_controls_start_pause_reset: passFailNotRun(after, REQ_TESTS[2]),
    req4_settings_validation_and_apply: passFailNotRun(after, REQ_TESTS[3]),
    req5_settings_while_running_no_reset: passFailNotRun(after, REQ_TESTS[4]),
    req6_focus_completion_history_persist: passFailNotRun(after, REQ_TESTS[5]),
    req7_no_history_on_reset_or_mode_switch: passFailNotRun(
      after,
      REQ_TESTS[6]
    ),
    req8_history_loads_from_storage: passFailNotRun(after, REQ_TESTS[7]),
    req9_invalid_storage_handled: passFailNotRun(after, REQ_TESTS[8]),
    req10_interval_cleanup: passFailNotRun(after, REQ_TESTS[9]),
  };

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

  const report = {
    run_id: runId,
    tool: "Pomodoro Timer Evaluator",
    started_at: startedAt,
    environment: {
      platform: unameS,
      os: "linux",
      node: nodeV,
      npm: npmV,
      git_commit: gitCommit || "unknown",
      git_branch: gitBranch || "unknown",
    },
    before: before
      ? {
          success: !!before.success,
          exit_code: before.exit_code,
          summary: summarize(before),
          tests: before.tests,
          output: before.output || "",
        }
      : null,
    after: {
      success: !!after.success,
      exit_code: after.exit_code,
      summary: summarize(after),
      tests: after.tests,
      output: after.output || "",
    },
    criteria_analysis: criteria,
    comparison: {
      summary: "Baseline (repository_before) vs fixed (repository_after)",
      success: !!after.success,
    },
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
}

function main() {
  const projectRoot = path.resolve(__dirname, "..");
  let outputPath = path.join(projectRoot, "evaluation", "report.json");
  let timeoutS = 120;

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
  process.stdout.write(
    `Starting Pomodoro Timer Evaluation [Run ID: ${runId}]\n`
  );

  const beforePkg = path.join(projectRoot, "repository_before", "package.json");
  const before = fs.existsSync(beforePkg)
    ? runRepoTests("repository_before", "before", timeoutS)
    : null;
  const after = runRepoTests("repository_after", "after", timeoutS);

  try {
    writeReportJson(outputPath, runId, before, after);
    process.stdout.write(`Report saved to: ${outputPath}\n`);
  } catch (e) {
    // Never fail the harness
    const msg = e && e.stack ? String(e.stack) : String(e);
    process.stderr.write(`evaluation: failed to write report: ${msg}\n`);
  }

  // ALWAYS EXIT 0
  process.exit(0);
}

try {
  main();
} catch (e) {
  // Never fail the harness
  const msg = e && e.stack ? String(e.stack) : String(e);
  try {
    process.stderr.write(`evaluation: unhandled error: ${msg}\n`);
  } catch {
    // ignore
  }
  process.exit(0);
}

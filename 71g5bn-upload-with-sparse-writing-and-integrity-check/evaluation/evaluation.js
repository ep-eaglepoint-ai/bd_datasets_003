#!/usr/bin/env node
/*
  Evaluation harness for: Upload with Sparse Writing and Integrity Check

  - Runs the integration runner directly (intended to be executed *inside* the
    Docker container via `docker compose run ... app node evaluation/evluation.js`).
  - Parses test output lines:
      PASS: test_name
      FAILED: test_name
      ALL TESTS PASSED
  - Adds static checks for browser-only requirements (File.slice usage, worker queue cap, TS interfaces).
  - Writes: evaluation/report.json

  NOTE: Always exits 0 so the evaluator never fails the harness.
*/

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function nowIsoUtc() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function randomRunId() {
  // 8 hex chars
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function runCmdCapture(cmd, args, { timeoutMs } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    const killTimer = timeoutMs
      ? setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {}
        }, timeoutMs)
      : null;

    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
      if (stdout.length > 200_000)
        stdout = stdout.slice(0, 200_000) + "\n...<truncated>...\n";
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
      if (stderr.length > 200_000)
        stderr = stderr.slice(0, 200_000) + "\n...<truncated>...\n";
    });

    child.on("close", (code, signal) => {
      if (killTimer) clearTimeout(killTimer);
      const exitCode = typeof code === "number" ? code : -1;
      resolve({ exitCode, signal: signal ?? null, output: stdout + stderr });
    });

    child.on("error", (e) => {
      if (killTimer) clearTimeout(killTimer);
      resolve({ exitCode: -1, signal: null, output: String(e?.stack || e) });
    });
  });
}

function parsePassFail(output) {
  const tests = [];
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith("PASS: ")) {
      tests.push({ name: line.slice(6).trim(), outcome: "passed" });
    } else if (line.startsWith("FAILED: ")) {
      // Keep whole line tail as the name for debugging (matches earlier evaluator style)
      tests.push({ name: line.slice(8).trim(), outcome: "failed" });
    }
  }
  return tests;
}

function summarize(tests) {
  const summary = {
    total: tests.length,
    passed: 0,
    failed: 0,
    errors: 0,
    skipped: 0,
  };
  for (const t of tests) {
    if (t.outcome === "passed") summary.passed++;
    else if (t.outcome === "failed") summary.failed++;
    else if (t.outcome === "error") summary.errors++;
    else if (t.outcome === "skipped") summary.skipped++;
  }
  return summary;
}

function outcomeFor(tests, name) {
  const hit = tests.find((t) => t.name === name);
  return hit?.outcome ?? null;
}

function passFailNotRun(tests, name) {
  const o = outcomeFor(tests, name);
  if (!o) return "Not Run";
  return o === "passed" ? "Pass" : "Fail";
}

function staticCheck(name, ok) {
  return { name, outcome: ok ? "passed" : "failed" };
}

function fileIncludes(filePath, needle) {
  try {
    const s = fs.readFileSync(filePath, "utf8");
    return s.includes(needle);
  } catch {
    return false;
  }
}

async function main() {
  const runId = randomRunId();
  const startedAt = nowIsoUtc();

  const projectRoot = process.cwd();
  const reportPath = path.join(projectRoot, "evaluation", "report.json");
  ensureDir(path.dirname(reportPath));

  const env = {
    platform: `${os.type()} ${os.release()} ${os.arch()}`,
    os: "linux",
    node: process.version,
  };

  // Run integration (this process should itself be run via Docker)
  const timeoutMs = Number(process.env.EVAL_TIMEOUT_MS ?? 300_000);
  const run = await runCmdCapture("node", ["/app/tests/run-integration.mjs"], {
    timeoutMs,
  });

  const tests = parsePassFail(run.output);

  // If no parsed tests, mark error (still exit 0)
  if (tests.length === 0) {
    tests.push({ name: "runner", outcome: "error" });
  }

  // Static checks for frontend requirements that are not executed headlessly
  const feEngine = path.join(
    projectRoot,
    "repository_after",
    "frontend",
    "src",
    "uploadEngine",
    "uploadEngine.ts"
  );
  const feTypes = path.join(
    projectRoot,
    "repository_after",
    "frontend",
    "src",
    "uploadEngine",
    "types.ts"
  );

  tests.push(
    staticCheck(
      "static_frontend_uses_file_slice",
      fileIncludes(feEngine, "file.slice(")
    )
  );
  tests.push(
    staticCheck(
      "static_frontend_worker_queue_concurrency_3",
      fileIncludes(feEngine, "const MAX_CONCURRENCY = 3")
    )
  );
  tests.push(
    staticCheck(
      "static_frontend_ts_interfaces_present",
      fileIncludes(feTypes, "export interface Chunk") &&
        fileIncludes(feTypes, "export interface UploadStatus") &&
        fileIncludes(feTypes, "export interface WorkerQueue")
    )
  );

  const success =
    run.exitCode === 0 &&
    tests.every((t) => t.outcome !== "failed" && t.outcome !== "error");

  // Criteria mapping to the 12 requirements
  const criteria = {
    req1_random_access_fs_write: passFailNotRun(
      tests,
      "upload_partial_parallel_out_of_order"
    ),
    req2_parallel_chunk_uploads: passFailNotRun(
      tests,
      "upload_partial_parallel_out_of_order"
    ),
    req3_frontend_uses_file_slice: passFailNotRun(
      tests,
      "static_frontend_uses_file_slice"
    ),
    req4_duplicate_chunk_safe: passFailNotRun(
      tests,
      "duplicate_chunk_overwrite_ok"
    ),
    req5_head_handshake_bitmap: passFailNotRun(
      tests,
      "handshake_reports_partial_bitmap"
    ),
    req6_server_sha256_verification: passFailNotRun(
      tests,
      "complete_with_correct_sha256"
    ),
    req7_no_full_file_ram_backend: passFailNotRun(
      tests,
      "upload_partial_parallel_out_of_order"
    ),
    req8_frontend_worker_queue_limit: passFailNotRun(
      tests,
      "static_frontend_worker_queue_concurrency_3"
    ),
    req9_content_range_parsed: passFailNotRun(
      tests,
      "reject_content_range_total_mismatch"
    ),
    req10_fd_open_close: passFailNotRun(
      tests,
      "upload_partial_parallel_out_of_order"
    ),
    req11_ts_interfaces_defined: passFailNotRun(
      tests,
      "static_frontend_ts_interfaces_present"
    ),
    req12_final_size_matches_total: passFailNotRun(
      tests,
      "complete_with_correct_sha256"
    ),
  };

  const report = {
    run_id: runId,
    tool: "Resumable Upload Evaluator",
    started_at: startedAt,
    environment: env,
    after: {
      success,
      exit_code: run.exitCode,
      summary: summarize(tests),
      tests,
      output: run.output,
    },
    criteria_analysis: criteria,
    comparison: {
      summary:
        "Single implementation run (repository_after) via Docker integration test",
      success,
    },
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Report saved to: ${reportPath}`);

  // Always exit 0 (never fail harness)
  process.exit(0);
}

main().catch((e) => {
  try {
    ensureDir(path.join(process.cwd(), "evaluation"));
    fs.writeFileSync(
      path.join(process.cwd(), "evaluation", "report.json"),
      JSON.stringify(
        {
          run_id: randomRunId(),
          tool: "Resumable Upload Evaluator",
          started_at: nowIsoUtc(),
          after: {
            success: false,
            exit_code: -1,
            tests: [{ name: "evaluator", outcome: "error" }],
            output: String(e?.stack || e),
          },
        },
        null,
        2
      ),
      "utf8"
    );
  } catch {}

  console.error("evaluation error:", e?.stack || e);
  process.exit(0);
});

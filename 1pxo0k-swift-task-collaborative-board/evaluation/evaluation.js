#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

function generateRunId() {
  return crypto.randomBytes(4).toString("hex");
}

function nowIso() {
  return new Date().toISOString();
}

async function runCommand(cmd, args, { cwd, env, timeoutMs } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks = [];
    const stderrChunks = [];

    let killedByTimeout = false;
    const timeout = timeoutMs
      ? setTimeout(() => {
          killedByTimeout = true;
          child.kill("SIGKILL");
        }, timeoutMs)
      : null;

    child.stdout.on("data", (d) => stdoutChunks.push(d));
    child.stderr.on("data", (d) => stderrChunks.push(d));

    child.on("close", (code, signal) => {
      if (timeout) clearTimeout(timeout);
      resolve({
        code: typeof code === "number" ? code : -1,
        signal: signal ?? null,
        timedOut: killedByTimeout,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });

    child.on("error", (err) => {
      if (timeout) clearTimeout(timeout);
      resolve({
        code: -1,
        signal: null,
        timedOut: false,
        stdout: "",
        stderr: String(err),
      });
    });
  });
}

async function getGitInfo(projectRoot) {
  const info = { git_commit: "unknown", git_branch: "unknown" };

  const commit = await runCommand("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
    timeoutMs: 5000,
  });
  if (commit.code === 0) info.git_commit = commit.stdout.trim().slice(0, 8);

  const branch = await runCommand(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    {
      cwd: projectRoot,
      timeoutMs: 5000,
    }
  );
  if (branch.code === 0) info.git_branch = branch.stdout.trim();

  return info;
}

async function getEnvironmentInfo(projectRoot) {
  const git = await getGitInfo(projectRoot);
  return {
    node_version: process.version,
    platform: os.platform(),
    os_release: os.release(),
    arch: os.arch(),
    git_commit: git.git_commit,
    git_branch: git.git_branch,
  };
}

function generateOutputPath(projectRoot) {
  return path.join(projectRoot, "evaluation", "report.json");
}

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function walkFiles(rootDir, predicate) {
  const out = [];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    if (!current) break;

    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        if (!predicate || predicate(full)) out.push(full);
      }
    }
  }

  return out;
}

function parseJestJson(stdout) {
  const parsed = JSON.parse(stdout);

  const tests = [];
  for (const suite of parsed.testResults ?? []) {
    const file = suite.name;
    for (const a of suite.assertionResults ?? []) {
      const outcome =
        a.status === "passed"
          ? "passed"
          : a.status === "failed"
          ? "failed"
          : a.status;
      tests.push({
        nodeid: `${file}::${a.fullName}`,
        name: a.fullName,
        file,
        outcome,
      });
    }
  }

  const summary = {
    total: tests.length,
    passed: tests.filter((t) => t.outcome === "passed").length,
    failed: tests.filter((t) => t.outcome === "failed").length,
    errors: 0,
    skipped: tests.filter((t) => t.outcome === "skipped").length,
  };

  return { tests, summary };
}

async function canRunDocker(projectRoot) {
  const probe = await runCommand("docker", ["--version"], {
    cwd: projectRoot,
    timeoutMs: 3000,
  });
  return probe.code === 0;
}

async function runEvaluationTestsDirect(projectRoot, timeoutS = 180) {
  const timeoutMs = timeoutS * 1000;
  const result = await runCommand(
    "sh",
    [
      "-lc",
      [
        "cd repository_after",
        "export DATABASE_URL=file:./test.db",
        // Send human logs to stderr; keep JSON-only on stdout.
        "npm test -- --json --outputFile=/tmp/jest.json 1>&2",
        "JEST_EXIT=$?",
        "cat /tmp/jest.json",
        "exit $JEST_EXIT",
      ].join(" && "),
    ],
    {
      cwd: projectRoot,
      env: process.env,
      timeoutMs,
    }
  );

  if (result.timedOut) {
    return {
      success: false,
      exit_code: -1,
      tests: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 1, skipped: 0 },
      stdout: "",
      stderr: `Evaluation timed out (>${timeoutS}s).`,
    };
  }

  try {
    const { tests, summary } = parseJestJson(result.stdout);
    return {
      success: result.code === 0,
      exit_code: result.code,
      tests,
      summary,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (e) {
    return {
      success: false,
      exit_code: result.code,
      tests: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 1, skipped: 0 },
      stdout: result.stdout,
      stderr: result.stderr || String(e),
    };
  }
}

async function runEvaluationTests(projectRoot, timeoutS = 180) {
  const timeoutMs = timeoutS * 1000;

  // If we're already running inside a container (or Docker isn't available),
  // run the tests directly. This is what enables:
  //   docker compose run --rm node evaluation/evaluation.js
  if (!(await canRunDocker(projectRoot))) {
    return runEvaluationTestsDirect(projectRoot, timeoutS);
  }

  // Run inside Docker to match the project's expected execution environment.
  // Keep Jest JSON on stdout; send build/tooling logs to stderr.
  const dockerArgs = [
    "compose",
    "run",
    "--rm",
    "app",
    "sh",
    "-lc",
    [
      "cd /app/repository_after",
      "export DATABASE_URL=file:./test.db",
      "npx prisma db push --force-reset 1>&2",
      "npx jest --config jest.config.cjs --json --outputFile=/tmp/jest.json 1>&2",
      "JEST_EXIT=$?",
      "cat /tmp/jest.json",
      "exit $JEST_EXIT",
    ].join(" && "),
  ];

  const result = await runCommand("docker", dockerArgs, {
    cwd: projectRoot,
    env: process.env,
    timeoutMs,
  });

  if (result.timedOut) {
    return {
      success: false,
      exit_code: -1,
      tests: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 1, skipped: 0 },
      stdout: "",
      stderr: `Evaluation timed out (>${timeoutS}s).`,
    };
  }

  try {
    const { tests, summary } = parseJestJson(result.stdout);
    return {
      success: result.code === 0,
      exit_code: result.code,
      tests,
      summary,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (e) {
    // If JSON parsing fails (e.g., Docker/Jest never ran), keep raw output for debugging.
    return {
      success: false,
      exit_code: result.code,
      tests: [],
      summary: { total: 0, passed: 0, failed: 0, errors: 1, skipped: 0 },
      stdout: result.stdout,
      stderr: result.stderr || String(e),
    };
  }
}

function staticChecks(projectRoot) {
  const repoAfter = path.join(projectRoot, "repository_after");

  const schemaPath = path.join(repoAfter, "prisma", "schema.prisma");
  const schema = safeReadText(schemaPath) ?? "";

  const hasEnum =
    /enum\s+TaskStatus\s*\{[^}]*\bTODO\b[^}]*\bIN_PROGRESS\b[^}]*\bDONE\b[^}]*\}/s.test(
      schema
    );
  const hasVersion = /model\s+Task\s*\{[^}]*\bversion\s+Int\b[^}]*\}/s.test(
    schema
  );
  const hasUpdatedAt = /\bupdatedAt\s+DateTime\s+@updatedAt\b/.test(schema);

  const tasksActionPath = path.join(repoAfter, "src", "actions", "tasks.ts");
  const tasksAction = safeReadText(tasksActionPath) ?? "";
  const hasOccUpdate =
    tasksAction.includes("updateMany") &&
    tasksAction.includes("expectedVersion") &&
    tasksAction.includes("version: { increment: 1 }");

  // Ensure Prisma usage is isolated (only lib/prisma.ts and actions/tasks.ts).
  const srcDir = path.join(repoAfter, "src");
  const sourceFiles = walkFiles(
    srcDir,
    (p) => p.endsWith(".ts") || p.endsWith(".tsx")
  );
  const prismaHits = [];

  for (const file of sourceFiles) {
    const rel = path.relative(repoAfter, file).replaceAll(path.sep, "/");
    const text = safeReadText(file) ?? "";

    const hits =
      text.includes("@prisma/client") ||
      text.includes("@/lib/prisma") ||
      /\bprisma\./.test(text);

    if (hits) prismaHits.push(rel);
  }

  const allowed = new Set(["src/lib/prisma.ts", "src/actions/tasks.ts"]);
  const prismaIsolationOk = prismaHits.every((p) => allowed.has(p));

  const boardClientPath = path.join(
    repoAfter,
    "src",
    "components",
    "BoardClient.tsx"
  );
  const boardClient = safeReadText(boardClientPath) ?? "";
  const hasUseOptimistic = boardClient.includes("useOptimistic");

  // Req 7 nuance: ensure the UI test actually toggles "offline" (not only mocking a rejection).
  // This is a static verification of the test implementation.
  const boardClientTestPath = path.join(
    projectRoot,
    "tests",
    "boardClient.test.tsx"
  );
  const boardClientTest = safeReadText(boardClientTestPath) ?? "";
  const offlineTogglesNavigatorOnLine =
    boardClientTest.includes("Object.defineProperty") &&
    (boardClientTest.includes('navigator,\n    "onLine"') ||
      boardClientTest.includes('navigator, "onLine"') ||
      boardClientTest.includes('window.navigator,\n    "onLine"') ||
      boardClientTest.includes('window.navigator, "onLine"'));
  const offlineDispatchesEvent =
    boardClientTest.includes('new Event("offline")') ||
    boardClientTest.includes("new Event('offline')");
  const offlineTestImplementsOfflineToggle =
    offlineTogglesNavigatorOnLine && offlineDispatchesEvent;

  return {
    schema_has_taskstatus_enum: hasEnum,
    schema_has_version_field: hasVersion,
    schema_has_updatedAt_field: hasUpdatedAt,
    server_action_has_occ_update: hasOccUpdate,
    prisma_isolation_ok: prismaIsolationOk,
    prisma_isolation_hits: prismaHits,
    client_uses_useOptimistic: hasUseOptimistic,
    test_offline_toggle_present: offlineTestImplementsOfflineToggle,
  };
}

function mapCriteria({ tests, static_checks }) {
  const byName = (fragment) => {
    const match = (tests ?? []).find((t) => (t.name ?? "").includes(fragment));
    if (!match) return "Not Run";
    return match.outcome === "passed" ? "Pass" : "Fail";
  };

  const passFail = (ok) => (ok ? "Pass" : "Fail");

  return {
    // 1) Conflict detection (versioning)
    conflict_detection_versioning: passFail(
      Boolean(
        static_checks.schema_has_version_field &&
          static_checks.server_action_has_occ_update
      )
    ),

    // 2) Server-side state management (Prisma only in Server Actions)
    server_side_state_management: passFail(
      Boolean(static_checks.prisma_isolation_ok)
    ),

    // 3) Optimistic UI feedback + revert on conflict
    optimistic_ui_reversion_on_conflict: byName(
      "Optimistic UI rolls back on conflict rejection"
    ),

    // 4) Concurrency handling (simultaneous moves)
    concurrency_two_moves_only_one_succeeds: byName(
      "simultaneous moves: only one succeeds"
    ),

    // 5) Data integrity (invalid status rejected)
    invalid_status_rejected: byName("rejects invalid status values"),

    // 6) Testing requirement: stale update rejected
    stale_update_rejected: byName("stale update is rejected"),

    // 7) Testing requirement: offline/network rollback
    // Evaluators may require that the test explicitly toggles offline state.
    optimistic_ui_reversion_on_offline: passFail(
      byName("offline/network error") === "Pass" &&
        Boolean(static_checks.test_offline_toggle_present)
    ),
  };
}

function parseArgs(argv) {
  const args = { output: null, timeout: 180 };

  for (let i = 2; i < argv.length; i++) {
    const cur = argv[i];
    if (cur === "--output" && i + 1 < argv.length) {
      args.output = argv[i + 1];
      i++;
      continue;
    }

    if (cur === "--timeout" && i + 1 < argv.length) {
      const v = Number(argv[i + 1]);
      if (Number.isFinite(v) && v > 0) args.timeout = Math.floor(v);
      i++;
      continue;
    }
  }

  return args;
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const run_id = generateRunId();

    const projectRoot = path.resolve(__dirname, "..");
    const testsDir = path.join(projectRoot, "tests");

    if (!fs.existsSync(testsDir)) {
      console.log(`Error: Could not locate tests directory at ${testsDir}`);
      process.exit(0);
    }

    console.log(`Starting SwiftTask Evaluation [Run ID: ${run_id}]`);

    const environment = await getEnvironmentInfo(projectRoot);
    const static_checks = staticChecks(projectRoot);

    const results_before = null;
    const results_after = await runEvaluationTests(projectRoot, args.timeout);

    const criteria_analysis = mapCriteria({
      tests: results_after.tests,
      static_checks,
    });

    const report = {
      run_id,
      tool: "SwiftTask Evaluator",
      started_at: nowIso(),
      environment,
      before: results_before,
      after: results_after,
      static_checks,
      criteria_analysis,
      comparison: {
        summary:
          "Single-target evaluation for repository_after (no baseline repository_before)",
        improvement_detected: null,
        success: Boolean(results_after.success),
      },
    };

    const outputPath = args.output
      ? path.resolve(args.output)
      : generateOutputPath(projectRoot);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

    console.log(`\nReport saved to: ${outputPath}`);
  } catch (e) {
    console.log(`INTERNAL EVALUATION SCRIPT ERROR: ${e}`);
  }

  // ALWAYS EXIT 0 (matches dataset evaluator behavior)
  process.exit(0);
}

main();

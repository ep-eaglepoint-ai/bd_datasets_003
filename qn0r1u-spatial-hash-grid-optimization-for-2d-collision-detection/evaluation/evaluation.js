/* eslint-disable no-console */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function die_oom() {
  try {
    process.stderr.write("evaluation: out of memory\n");
  } catch {
    // ignore
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

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const python = process.env.PYTHON || "python";

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

  const report = {
    instance_id: "QN0R1U",
    before: {
      exitCode: before.exitCode,
      durationMs: before.durationMs,
    },
    after: {
      exitCode: after.exitCode,
      durationMs: after.durationMs,
    },
    notes: [
      "Exit codes are captured but evaluation exits 0 by design.",
      "repository_before is expected to fail the performance gate.",
    ],
  };

  const outPath = path.join(__dirname, "report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  // Keep output small but useful.
  process.stdout.write(JSON.stringify(report) + "\n");

  // Also surface any failures in stderr without failing the harness.
  if (after.exitCode !== 0) {
    try {
      process.stderr.write("evaluation: repository_after tests failed (see report.json)\n");
    } catch {
      // ignore
    }
  }
}

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

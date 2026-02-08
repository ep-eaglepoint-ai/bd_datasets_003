const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function die_oom() {
  const out = {
    ok: false,
    error: "OOM",
    report_url: "No report available",
    report_content: "Error: heap out of memory",
  };
  safeWriteFile(reportJsonPath(), JSON.stringify(out, null, 2));
  safeStdout(JSON.stringify(out));
  process.exit(0);
}

function safeStdout(s) {
  try {
    process.stdout.write(String(s) + "\n");
  } catch {
  }
}

function safeStderr(s) {
  try {
    process.stderr.write(String(s) + "\n");
  } catch {
  }
}

function safeWriteFile(filePath, content) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  } catch {
  }
}

function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function projectRoot() {
  return path.resolve(__dirname, "..");
}

function reportXmlPaths() {
  const root = projectRoot();
  return {
    primary: path.join(root, "evaluation", "report.xml"),
    fallback: path.join(root, "report.xml"),
  };
}

function reportJsonPath() {
  return path.join(projectRoot(), "evaluation", "reports", "report.json");
}

function runPythonEvaluation() {
  const res = spawnSync("python", [path.join("evaluation", "evaluation.py")], {
    cwd: projectRoot(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    command: "python evaluation/evaluation.py",
    code: typeof res.status === "number" ? res.status : null,
    signal: res.signal || null,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    error: res.error ? String(res.error && res.error.message ? res.error.message : res.error) : null,
  };
}

function runDockerCompose(args) {
  const res = spawnSync("docker", ["compose", ...args], {
    cwd: projectRoot(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  return {
    command: `docker compose ${args.join(" ")}`,
    code: typeof res.status === "number" ? res.status : null,
    signal: res.signal || null,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    error: res.error ? String(res.error && res.error.message ? res.error.message : res.error) : null,
  };
}

function truncate(s, maxChars) {
  if (!s) return "";
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + `\n... truncated (${s.length - maxChars} chars)`;
}

function main() {
  const exec = runPythonEvaluation();
  const reportPath = reportJsonPath();
  const report = safeReadFile(reportPath);
  const ok = exec.code === 0;

  if (!report) {
    const fallback = {
      ok: false,
      error: exec.error || "Failed to generate report.json",
      logs: {
        stdout: truncate(exec.stdout, 50_000),
        stderr: truncate(exec.stderr, 50_000),
      },
    };
    safeWriteFile(reportPath, JSON.stringify(fallback, null, 2));
    safeStdout(JSON.stringify({ ok: false, report_url: "evaluation/reports/report.json" }));
    process.exit(0);
  }

  safeStdout(JSON.stringify({ ok, report_url: "evaluation/reports/report.json" }));
  process.exit(0);
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
  if (msg.includes("heap out of memory")) die_oom();
  try {
    process.stderr.write(`evaluation: fatal error: ${msg}\n`);
  } catch {
  }
  process.exit(0);
}

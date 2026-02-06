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
  return path.join(projectRoot(), "evaluation", "report.json");
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
  const results = {
    ok: true,
    test: null,
    test_report: null,
    report_url: "No report available",
    report_content: "",
  };
  results.test = runDockerCompose(["run", "--rm", "test"]);
  if (results.test.code !== 0) results.ok = false;
  results.test_report = runDockerCompose(["run", "--rm", "test-report"]);
  if (results.test_report.code !== 0) results.ok = false;
  const { primary, fallback } = reportXmlPaths();
  const xml = safeReadFile(primary) ?? safeReadFile(fallback);

  if (xml) {
    results.report_url = fs.existsSync(primary) ? "evaluation/report.xml" : "report.xml";
    results.report_content = truncate(xml, 200_000);
  } else {
    results.ok = false;
    results.report_url = "No report available";
    results.report_content = "Error: report.xml not found";
  }

  results.logs = {
    test_stdout: truncate(results.test.stdout, 50_000),
    test_stderr: truncate(results.test.stderr, 50_000),
    report_stdout: truncate(results.test_report.stdout, 50_000),
    report_stderr: truncate(results.test_report.stderr, 50_000),
  };

  safeWriteFile(reportJsonPath(), JSON.stringify(results, null, 2));
  safeStdout(JSON.stringify({ ok: results.ok, report_url: results.report_url }));
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

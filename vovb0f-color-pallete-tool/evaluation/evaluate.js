#!/usr/bin/env node
/**
 * Evaluation script: runs requirement tests and writes evaluation/report.json.
 * Run from repo root: npm run evaluate  or  node evaluation/evaluate.js
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const reportPath = path.join(repoRoot, "evaluation", "report.json");

if (!fs.existsSync(__dirname)) {
  fs.mkdirSync(__dirname, { recursive: true });
}

// Run with json reporter; capture stdout and write to report.json
const result = spawnSync("npx", [
  "vitest", "run", "tests",
  "--reporter=json",
], {
  encoding: "utf-8",
  cwd: repoRoot,
  stdio: ["inherit", "pipe", "inherit"],
  env: { ...process.env, CI: "true" },
  maxBuffer: 10 * 1024 * 1024,
});

const raw = (result.stdout || "").trim();
if (raw) {
  try {
    JSON.parse(raw);
    fs.writeFileSync(reportPath, raw, "utf-8");
    console.log("Report written to evaluation/report.json");
  } catch {
    fs.writeFileSync(reportPath, raw, "utf-8");
    console.log("Report written to evaluation/report.json (raw output)");
  }
} else if (!fs.existsSync(reportPath)) {
  fs.writeFileSync(reportPath, JSON.stringify({
    success: result.status === 0,
    exitCode: result.status ?? 1,
    error: "No JSON output from Vitest",
    stderr: (result.stderr || "").slice(0, 1000),
  }, null, 2), "utf-8");
  console.log("Fallback report written to evaluation/report.json");
}

process.exit(result.status ?? 1);

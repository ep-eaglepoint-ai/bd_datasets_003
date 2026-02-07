#!/usr/bin/env node
/**
 * Evaluation script: runs requirement tests and writes evaluation/report.json.
 * Run from repo root: npm run evaluate  or  node evaluation/evaluate.js
 *
 * With CI=true, vitest.config.ts writes JSON to evaluation/report.json via
 * outputFile. This script runs the tests then normalizes the report with
 * success and exitCode.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const reportPath = path.join(repoRoot, "evaluation", "report.json");
const evaluationDir = path.dirname(reportPath);

if (!fs.existsSync(evaluationDir)) {
  fs.mkdirSync(evaluationDir, { recursive: true });
}

// Run tests with JSON reporter writing to evaluation/report.json (explicit path)
const result = spawnSync("npx", [
  "vitest", "run", "tests",
  "--reporter=default",
  "--reporter=json",
  "--outputFile.json=./evaluation/report.json",
], {
  encoding: "utf-8",
  cwd: repoRoot,
  stdio: "inherit",
  env: { ...process.env, CI: "true" },
});

const exitCode = result.status ?? 1;
const success = exitCode === 0;

let report;
if (fs.existsSync(reportPath)) {
  try {
    const raw = fs.readFileSync(reportPath, "utf-8").trim();
    report = raw ? JSON.parse(raw) : {};
  } catch (e) {
    report = { parseError: String(e.message || e) };
  }
} else {
  report = {};
}

// Normalize report with top-level success and exitCode for consistent consumption
const normalized = {
  ...report,
  success,
  exitCode,
};

fs.writeFileSync(reportPath, JSON.stringify(normalized, null, 2), "utf-8");
console.log("Report written to evaluation/report.json");

process.exit(exitCode);

/**
 * Evaluation Runner
 * Executes tests and generates detailed performance metrics
 */

import { spawn } from "child_process";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes for output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runTests(testLabel, description) {
  return new Promise((resolve, reject) => {
    log(`\n${"=".repeat(80)}`, "cyan");
    log(`Running tests: ${testLabel}`, "bright");
    log(`Description: ${description}`, "blue");
    log("=".repeat(80), "cyan");

    const startTime = Date.now();
    let stdout = "";
    let stderr = "";

    const env = {
      ...process.env,
      NODE_OPTIONS: "--max-old-space-size=250 --expose-gc",
    };

    // Run tests from repository_after directory
    const child = spawn("npm", ["test", "--", "--verbose", "--runInBand"], {
      env,
      shell: true,
      cwd: join(__dirname, "..", "repository_after"),
    });

    // Set hard timeout (30 seconds)
    const timeout = setTimeout(() => {
      log("\n⚠️  Test execution timeout (30s) - terminating process", "red");
      child.kill("SIGTERM");

      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 5000);
    }, 30000);

    child.stdout.on("data", (data) => {
      const output = data.toString();
      stdout += output;
      process.stdout.write(output);
    });

    child.stderr.on("data", (data) => {
      const output = data.toString();
      stderr += output;
      process.stderr.write(output);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      const result = {
        label: testLabel,
        description,
        exitCode: code,
        duration,
        timestamp: new Date().toISOString(),
        stdout,
        stderr,
        passed: code === 0,
      };

      if (code === 0) {
        log(`\n✅ Tests PASSED for ${testLabel}`, "green");
      } else {
        log(`\n❌ Tests FAILED for ${testLabel} (exit code: ${code})`, "red");
      }

      log(`Duration: ${duration}ms`, "yellow");

      resolve(result);
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      log(`\n❌ Error running tests: ${error.message}`, "red");
      reject(error);
    });
  });
}

async function main() {
  log("\n" + "=".repeat(80), "bright");
  log("ANALYTICS SERVICE EVALUATION", "bright");
  log("High-Performance Cardinality Aggregator", "cyan");
  log("=".repeat(80) + "\n", "bright");

  const results = [];
  const startTime = Date.now();

  try {
    // Run the optimized implementation tests
    log("\n📋 Running Tests for Optimized Implementation", "yellow");
    log("Expected: O(n) performance, all tests pass", "yellow");

    const testResult = await runTests(
      "Optimized O(n) Implementation",
      "Tests the repository_after implementation with Set-based optimization",
    );

    results.push(testResult);

    // Generate evaluation report
    const totalDuration = Date.now() - startTime;

    const report = {
      summary: {
        totalDuration,
        timestamp: new Date().toISOString(),
        testsPassed: testResult.passed,
        allRequirementsMet: testResult.passed,
      },
      results,
    };

    // Save detailed report
    const reportPath = join(__dirname, "evaluation_report.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Generate human-readable summary
    const summaryPath = join(__dirname, "evaluation_summary.txt");
    const summary = generateSummary(report);
    writeFileSync(summaryPath, summary);

    // Print summary
    log("\n" + "=".repeat(80), "bright");
    log("EVALUATION SUMMARY", "bright");
    log("=".repeat(80), "bright");
    log(summary, "cyan");

    log("\n📊 Reports generated:", "green");
    log(`  - ${reportPath}`, "blue");
    log(`  - ${summaryPath}`, "blue");

    // Final verdict
    log("\n" + "=".repeat(80), "bright");
    if (testResult.passed) {
      log("✅ EVALUATION PASSED: All tests passed successfully!", "green");
    } else {
      log("❌ EVALUATION FAILED: Some tests failed", "red");
    }
    log("=".repeat(80) + "\n", "bright");

    process.exit(testResult.passed ? 0 : 1);
  } catch (error) {
    log(`\n❌ Evaluation error: ${error.message}`, "red");
    log(error.stack, "red");
    process.exit(1);
  }
}

function generateSummary(report) {
  const lines = [];

  lines.push("Analytics Service Optimization Evaluation");
  lines.push("=".repeat(80));
  lines.push("");
  lines.push(`Evaluation Date: ${report.summary.timestamp}`);
  lines.push(`Total Duration: ${report.summary.totalDuration}ms`);
  lines.push("");

  lines.push("Results:");
  lines.push("-".repeat(80));

  for (const result of report.results) {
    lines.push(`\n${result.label}`);
    lines.push(`  Description: ${result.description}`);
    lines.push(`  Status: ${result.passed ? "PASSED ✅" : "FAILED ❌"}`);
    lines.push(`  Duration: ${result.duration}ms`);
    lines.push(`  Exit Code: ${result.exitCode}`);

    if (result.error) {
      lines.push(`  Error: ${result.error}`);
    }
  }

  lines.push("");
  lines.push("-".repeat(80));
  lines.push("");

  if (report.summary.allRequirementsMet) {
    lines.push("✅ ALL REQUIREMENTS MET");
    lines.push("   - All 9 requirements validated");
    lines.push("   - O(n) time complexity achieved");
    lines.push("   - Memory constraints respected");
    lines.push("   - Production ready");
  } else {
    lines.push("❌ ISSUES DETECTED");
    lines.push("   - Review test output for details");
    lines.push("   - Some requirements not met");
  }

  lines.push("");
  lines.push("=".repeat(80));

  return lines.join("\n");
}

// Handle uncaught errors
process.on("unhandledRejection", (error) => {
  log(`\n❌ Unhandled rejection: ${error.message}`, "red");
  console.error(error);
  process.exit(1);
});

// Run evaluation
main();

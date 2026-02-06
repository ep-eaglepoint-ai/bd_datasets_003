const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const REPORTS_DIR = path.join(ROOT, "evaluation", "reports");

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function runCommand(command, args, cwd, envExtra = {}) {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      shell: true,
      env: { ...process.env, CI: "true", REPO_PATH: "repository_after", ...envExtra },
    });

    let output = "";
    proc.stdout.on("data", (data) => (output += data.toString()));
    proc.stderr.on("data", (data) => (output += data.toString()));

    proc.on("close", (code) => {
      resolve({ passed: code === 0, output: output.trim(), code });
    });
  });
}

async function runEvaluation() {
  const startTime = new Date();
  console.log(`🚀 Starting Integrated Evaluation...`);

  const dbPath = path.join(ROOT, "backend/data/auction.db");
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  console.log("📡 Starting Backend Server...");
  const server = spawn("node", ["backend/server.js"], { 
    cwd: ROOT, 
    env: { ...process.env, REPO_PATH: "repository_after" } 
  });
  
  await new Promise(r => setTimeout(r, 5000));

  // 1. Backend Tests
  console.log("🧪 Running Backend Tests...");
  const backendResult = await runCommand(
    "/app/backend/node_modules/.bin/jest",
    ["/app/test/backend.test.js", "--runInBand", "--config", "/app/backend/package.json", "--rootDir", "/app", "--modulePaths", "/app/backend/node_modules"],
    ROOT
  );

  // 2. Prepare & Run Frontend Tests
  console.log("🧪 Preparing & Running Frontend Tests...");
  const testContent = fs.readFileSync("/app/test/frontend.test.js", "utf8");
  const patchedContent = testContent.replace(/..\/repository_after\/frontend\/src\/components\/AuctionComponent/g, "./components/AuctionComponent");
  fs.writeFileSync("/app/frontend/src/integration.test.jsx", patchedContent);

  const frontendResult = await runCommand("npx vitest run src/integration.test.jsx", [], path.join(ROOT, "frontend"));

  // 3. Generate Report Object
  const endTime = new Date();
  const success = backendResult.passed && frontendResult.passed;
  
  const report = {
    status: success ? "passed" : "failed",
    timestamp: endTime.toISOString(),
    duration_ms: endTime - startTime,
    results: {
      backend: {
        passed: backendResult.passed,
        exit_code: backendResult.code,
        details: backendResult.passed ? "Success" : backendResult.output.split('\n')[0]
      },
      frontend: {
        passed: frontendResult.passed,
        exit_code: frontendResult.code,
        details: frontendResult.passed ? "Success" : frontendResult.output.split('\n')[0]
      }
    }
  };

  // Write to File
  const reportPath = path.join(REPORTS_DIR, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n✅ Report saved to: ${reportPath}`);
  console.log(`OVERALL SUCCESS: ${success ? "✅ YES" : "❌ NO"}`);

  server.kill();
  process.exit(success ? 0 : 1);
}

runEvaluation();
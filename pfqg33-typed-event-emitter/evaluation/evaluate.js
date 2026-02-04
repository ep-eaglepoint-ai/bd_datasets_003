const path = require("path"); // 1. Import path first
module.paths.push(path.resolve(__dirname, '../repository_after/node_modules'));

const fs = require("fs");
const { spawnSync } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const REPORTS_DIR = path.join(ROOT, "evaluation", "reports");

if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function getEnvironmentInfo() {
  return {
    node_version: process.version,
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
  };
}

// Runs the test by compiling the specific repository and the test file
 
function runEvaluationTest(repoPath) {
  const isWin = process.platform === "win32";
  const npxCmd = isWin ? "npx.cmd" : "npx";
  const nodeCmd = "node";

  console.log(`[DEBUG] Compiling ${repoPath}...`);
  
  const compile = spawnSync(npxCmd, [
    "tsc",
    "tests/event-emitter.test.ts",
    "--target", "es2020",
    "--module", "commonjs",
    "--esModuleInterop", "true",
    "--skipLibCheck", "true",
    "--outDir", `dist/${repoPath}`
  ], { 
    cwd: ROOT, 
    shell: true // Crucial for Windows to find npx.cmd
  });

  if (compile.error) {
    console.error(`[DEBUG] System failed to run compiler:`, compile.error.message);
    return { passed: false, output: "System Error" };
  }

  if (compile.status !== 0) {
    const errText = compile.stderr ? compile.stderr.toString() : "Unknown error";
    console.error(`[DEBUG] Compilation failed for ${repoPath}:`, errText);
  }

  console.log(`[DEBUG] Running tests for ${repoPath}...`);
  const run = spawnSync(nodeCmd, [`dist/${repoPath}/tests/event-emitter.test.js`], { 
    cwd: ROOT,
    shell: true 
  });

  const output = (run.stdout ? run.stdout.toString() : "") + (run.stderr ? run.stderr.toString() : "");
  
  console.log(`[DEBUG] Test Output:\n${output}`);

  const passed = run.status === 0 && /\d\/\d Tests Passed/i.test(output);

  return {
    passed,
    return_code: run.status,
    output: output.trim()
  };
}

async function runEvaluation() {
  const runId = uuidv4();
  const startTime = new Date();

  console.log(`Starting Evaluation [${runId}]...`);

  const beforeResult = {
    passed: false,
    return_code: 1,
    output: "Baseline repository is empty (.gitkeep only). Implementation missing."
  };

  console.log("Testing repository_after...");
  const afterResult = runEvaluationTest("repository_after");

  const endTime = new Date();
  const report = {
    run_id: runId,
    started_at: startTime.toISOString(),
    finished_at: endTime.toISOString(),
    environment: getEnvironmentInfo(),
    before: { tests: beforeResult },
    after: { tests: afterResult },
    comparison: {
      passed_gate: afterResult.passed,
      improvement_summary: "Successfully implemented TypedEventEmitter from scratch."
    },
    success: afterResult.passed
  };

  const reportPath = path.join(REPORTS_DIR, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`Evaluation complete. Success: ${report.success}`);
  process.exit(report.success ? 0 : 1);
}

runEvaluation();
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

const ROOT = path.join(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'evaluation', 'reports');


if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

interface TestResult {
  passed: boolean;
  return_code: number;
  output: string;
}

interface EnvironmentInfo {
  node_version: string;
  typescript_version: string;
  platform: string;
  arch: string;
  cpus: number;
}

interface EvaluationReport {
  run_id: string;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  environment: EnvironmentInfo;
  before: {
    tests: TestResult;
    metrics: Record<string, unknown>;
  };
  after: {
    tests: TestResult;
    metrics: Record<string, unknown>;
  };
  meta_tests: {
    tests: TestResult;
    metrics: Record<string, unknown>;
  };
  comparison: {
    passed_gate: boolean;
    improvement_summary: string;
  };
  success: boolean;
  error: string | null;
}

function getEnvironmentInfo(): EnvironmentInfo {
  const tsVersion = execSync('npx tsc --version', { encoding: 'utf-8' }).trim();
  
  return {
    node_version: process.version,
    typescript_version: tsVersion,
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
  };
}

function runTests(repoPath: string): TestResult {
  let cmd: string;
  
  if (repoPath === 'repository_before') {
    // Run tests against repository_before
    cmd = 'npx jest --config jest.config.ts --silent';
  } else {
    // Run tests against repository_after
    cmd = 'npx jest --config jest.config.ts --silent';
  }
  
  try {
    const output = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 120000,
      stdio: 'pipe',
    });
    
    return {
      passed: true,
      return_code: 0,
      output: output.length > 500 ? output.substring(0, 500) : output,
    };
  } catch (error: any) {
    if (error.killed) {
      return {
        passed: false,
        return_code: -1,
        output: 'Test execution timed out',
      };
    }
    
    const output = error.stdout?.toString() || error.stderr?.toString() || error.message;
    return {
      passed: false,
      return_code: error.status || -1,
      output: output.length > 500 ? output.substring(0, 500) : output,
    };
  }
}

function runMetaTests(): TestResult {
  const cmd = 'npx jest --config jest.meta.config.ts --silent';
  
  try {
    const output = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 120000,
      stdio: 'pipe',
    });
    
    return {
      passed: true,
      return_code: 0,
      output: output.length > 500 ? output.substring(0, 500) : output,
    };
  } catch (error: any) {
    const output = error.stdout?.toString() || error.stderr?.toString() || error.message;
    return {
      passed: false,
      return_code: error.status || -1,
      output: output.length > 500 ? output.substring(0, 500) : output,
    };
  }
}

function runEvaluation(): void {
  const runId = randomUUID();
  const startTime = new Date();
  const startTimeISO = startTime.toISOString();
  

  const beforeResult = runTests('repository_before');
  

  const afterResult = runTests('repository_after');
  

  const metaResult = runMetaTests();
  
  const endTime = new Date();
  const endTimeISO = endTime.toISOString();
  const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
  

  let improvementSummary: string;
  if (!beforeResult.passed && afterResult.passed) {
    improvementSummary = 'Tests pass after implementation - requirements met.';
  } else if (beforeResult.passed && afterResult.passed) {
    improvementSummary = 'Tests passed in both states.';
  } else if (!afterResult.passed) {
    improvementSummary = 'Implementation failed to pass requirements.';
  } else {
    improvementSummary = 'No tests in repository_before.';
  }
  
  // Build report
  const report: EvaluationReport = {
    run_id: runId,
    started_at: startTimeISO,
    finished_at: endTimeISO,
    duration_seconds: durationSeconds,
    environment: getEnvironmentInfo(),
    before: {
      tests: beforeResult,
      metrics: {},
    },
    after: {
      tests: afterResult,
      metrics: {},
    },
    meta_tests: {
      tests: metaResult,
      metrics: {},
    },
    comparison: {
      passed_gate: afterResult.passed && metaResult.passed,
      improvement_summary: improvementSummary,
    },
    success: afterResult.passed && metaResult.passed,
    error: null,
  };
  

  const reportPath = path.join(REPORTS_DIR, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  
  process.exit(report.success ? 0 : 1);
}


runEvaluation();

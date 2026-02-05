#!/usr/bin/env tsx
import { execSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { randomUUID } from 'crypto'
import { platform } from 'os'

// Get root directory (parent of evaluation directory)
// Use process.cwd() which should be the project root when running from root
const ROOT = process.cwd()
const REPORTS_DIR = join(ROOT, 'evaluation', 'reports')

interface TestResult {
  passed: boolean
  return_code: number
  output: string
}

interface Metrics {
  [key: string]: number | boolean
}

interface RepoResult {
  tests: TestResult
  metrics: Metrics
}

interface Environment {
  node_version: string
  platform: string
}

interface EvaluationReport {
  run_id: string
  started_at: string
  finished_at: string
  duration_seconds: number
  environment: Environment
  before: RepoResult
  after: RepoResult
  comparison: {
    passed_gate: boolean
    improvement_summary: string
  }
  success: boolean
  error: string | null
}

function environmentInfo(): Environment {
  return {
    node_version: process.version,
    platform: `${platform()}-${process.arch}`,
  }
}

function runTests(repoPath: string): TestResult {
  try {
    const startTime = Date.now()
    const output = execSync('npm test', {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 120000, // 120 seconds
      stdio: 'pipe',
    })
    const duration = Date.now() - startTime

    return {
      passed: true,
      return_code: 0,
      output: output.substring(0, 8000), // Truncate to 8000 chars
    }
  } catch (error: any) {
    const output = error.stdout?.toString() || error.stderr?.toString() || error.message || 'Unknown error'
    return {
      passed: false,
      return_code: error.status || 1,
      output: output.substring(0, 8000), // Truncate to 8000 chars
    }
  }
}

function runMetrics(repoPath: string): Metrics {
  // Optional – implement if needed for task-specific metrics
  return {}
}

function evaluate(repoName: string): RepoResult {
  const repoPath = join(ROOT, repoName)

  // For repository_before, return static failed status
  if (repoName === 'repository_before') {
    return {
      tests: {
        passed: false,
        return_code: 1,
        output: 'no test to run against repository_before',
      },
      metrics: {},
    }
  }

  // For repository_after, run actual tests
  if (repoName === 'repository_after') {
    const tests = runTests(ROOT) // Run tests from root
    const metrics = runMetrics(repoPath)
    return {
      tests,
      metrics,
    }
  }

  // Fallback
  return {
    tests: {
      passed: false,
      return_code: 1,
      output: `Unknown repository: ${repoName}`,
    },
    metrics: {},
  }
}

function runEvaluation(): EvaluationReport {
  const runId = randomUUID()
  const startTime = new Date()
  const startISO = startTime.toISOString()

  let before: RepoResult
  let after: RepoResult
  let error: string | null = null

  try {
    before = evaluate('repository_before')
    after = evaluate('repository_after')
  } catch (e: any) {
    error = e.message || 'Unknown error during evaluation'
    before = {
      tests: {
        passed: false,
        return_code: 1,
        output: error,
      },
      metrics: {},
    }
    after = {
      tests: {
        passed: false,
        return_code: 1,
        output: error,
      },
      metrics: {},
    }
  }

  const endTime = new Date()
  const endISO = endTime.toISOString()
  const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000

  const comparison = {
    passed_gate: after.tests.passed,
    improvement_summary: after.tests.passed
      ? 'After implementation passed correctness tests'
      : 'After implementation failed correctness tests',
  }

  return {
    run_id: runId,
    started_at: startISO,
    finished_at: endISO,
    duration_seconds: durationSeconds,
    environment: environmentInfo(),
    before,
    after,
    comparison,
    success: comparison.passed_gate,
    error,
  }
}

async function main(): Promise<number> {
  // Ensure reports directory exists
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true })
  }

  const report = runEvaluation()
  const reportPath = join(REPORTS_DIR, 'latest.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')

  console.log(`Report written to ${reportPath}`)
  console.log(`Success: ${report.success}`)

  return report.success ? 0 : 1
}

// Run main function
main().then(exitCode => process.exit(exitCode)).catch(err => {
  console.error('Evaluation error:', err)
  process.exit(1)
})

export { runEvaluation, main }


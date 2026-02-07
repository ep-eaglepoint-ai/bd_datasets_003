#!/usr/bin/env node
/**
 * Evaluation runner
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

interface TestResult {
  nodeid: string;
  name: string;
  outcome: 'passed' | 'failed' | 'skipped' | 'unknown';
}

interface JestRunOutput {
  passed: boolean;
  return_code: number;
  output: string;
}

interface TestMetrics {
  avg_time_ms: number;
  p95_time_ms: number;
  failures: number;
  failure_rate: number;
  deadlocks: number;
  ops_per_second: number;
  rows_processed: number;
  warnings: number;
}

interface JestRunOutputWithMetrics extends JestRunOutput {
  metrics: TestMetrics;
}

interface EvaluationResults {
  before: JestRunOutputWithMetrics;
  after: JestRunOutputWithMetrics;
  passed_gate: boolean;
  improvement_summary: string;
}

interface EnvironmentInfo {
  node_version: string;
  platform: string;
}

function generateRunId(): string {
  return uuidv4();
}

function getEnvironmentInfo(): EnvironmentInfo {
  return {
    node_version: process.version,
    platform: process.platform,
  };
}

function parseJestOutput(output: string): TestResult[] {
  const tests: TestResult[] = [];
  const lines = output.split('\n');
  
  let currentSuite = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (line.match(/^\s{2}[A-Z]/) && !trimmed.match(/^(√|✓|✕|×|○|PASS|FAIL)/)) {
      currentSuite = trimmed;
      continue;
    }
    
    const testMatch = trimmed.match(/^(√|✓|✕|×|○)\s+(.+?)(?:\s+\(\d+\s*ms\))?$/);
    
    if (testMatch) {
      const symbol = testMatch[1];
      const testName = testMatch[2].trim();
      let outcome: TestResult['outcome'] = 'unknown';
      
      if (symbol === '√' || symbol === '✓') {
        outcome = 'passed';
      } else if (symbol === '✕' || symbol === '×') {
        outcome = 'failed';
      } else if (symbol === '○') {
        outcome = 'skipped';
      }
      
      const nodeid = currentSuite ? `${currentSuite} > ${testName}` : testName;
      
      tests.push({
        nodeid,
        name: testName,
        outcome,
      });
    }
  }
  
  return tests;
}

function parseJestDurations(output: string): number[] {
  const durations: number[] = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    // Match Jest timing output like "√ test name (123 ms)"
    const durationMatch = line.match(/\((\d+)\s*ms\)/);
    if (durationMatch) {
      const durationMs = parseFloat(durationMatch[1]);
      durations.push(durationMs);
    }
  }
  
  return durations;
}

function calculateMetrics(
  tests: TestResult[],
  testDurations: number[],
  executionTimeMs: number,
  passed: number,
  failed: number,
  errors: number
): TestMetrics {
  const totalTests = tests.length;
  const totalFailures = failed + errors;
  
  // Calculate average and p95 from test durations if available
  let avgTimeMs: number, p95TimeMs: number;
  if (testDurations.length > 0) {
    avgTimeMs = testDurations.reduce((a, b) => a + b, 0) / testDurations.length;
    const sortedDurations = [...testDurations].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedDurations.length * 0.95);
    p95TimeMs = sortedDurations[p95Index] || sortedDurations[sortedDurations.length - 1];
  } else {
    // Fallback: estimate from total execution time
    avgTimeMs = totalTests > 0 ? executionTimeMs / totalTests : 0;
    p95TimeMs = avgTimeMs * 1.5; // Rough estimate
  }
  
  // Calculate ops per second (tests per second)
  const executionTimeSeconds = executionTimeMs / 1000;
  const opsPerSecond = executionTimeSeconds > 0 ? totalTests / executionTimeSeconds : 0;
  
  // Calculate failure rate
  const failureRate = totalTests > 0 ? totalFailures / totalTests : 0.0;
  
  return {
    avg_time_ms: Math.round(avgTimeMs * 10) / 10,
    p95_time_ms: Math.round(p95TimeMs * 10) / 10,
    failures: totalFailures,
    failure_rate: Math.round(failureRate * 100) / 100,
    deadlocks: 0, // Would need specific detection logic
    ops_per_second: Math.round(opsPerSecond * 10) / 10,
    rows_processed: totalTests,
    warnings: 0 // Would need to parse Jest warnings
  };
}

function runJestTests(testsDir: string, label: string): JestRunOutputWithMetrics {
  console.log('\n' + '='.repeat(100));
  console.log(`RUNNING TESTS FOR: ${label.toUpperCase()}`);
  console.log('='.repeat(100));
  console.log(`Tests directory: ${testsDir}`);
  
  const projectRoot = path.resolve(__dirname, '..');
  const startTime = Date.now();
  
  try {
    const result = execSync(
      'npm test -- --verbose --no-coverage 2>&1',
      {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000,
      }
    );
    
    const endTime = Date.now();
    const executionTimeMs = endTime - startTime;
    const output = result.toString();
    const tests = parseJestOutput(output);
    const testDurations = parseJestDurations(output);
    
    const passed = tests.filter(t => t.outcome === 'passed').length;
    const failed = tests.filter(t => t.outcome === 'failed').length;
    const errors = 0;
    const skipped = tests.filter(t => t.outcome === 'skipped').length;
    const total = tests.length;
    
    console.log(`\nResults: ${passed} passed, ${failed} failed, ${errors} errors, ${skipped} skipped (total: ${total})`);
    
    printTestSummary(tests);
    
    const metrics = calculateMetrics(tests, testDurations, executionTimeMs, passed, failed, errors);
    
    return {
      passed: true,
      return_code: 0,
      output,
      metrics,
    };
    
  } catch (error: any) {
    const endTime = Date.now();
    const executionTimeMs = endTime - startTime;
    const output = error.stdout ? error.stdout.toString() : '';
    const stderr = error.stderr ? error.stderr.toString() : '';
    const combinedOutput = output + stderr;
    
    const tests = parseJestOutput(combinedOutput);
    const testDurations = parseJestDurations(combinedOutput);
    
    const passed = tests.filter(t => t.outcome === 'passed').length;
    const failed = tests.filter(t => t.outcome === 'failed').length;
    const errors = 0;
    const skipped = tests.filter(t => t.outcome === 'skipped').length;
    const total = tests.length;
    
    console.log(`\nResults: ${passed} passed, ${failed} failed, ${errors} errors, ${skipped} skipped (total: ${total})`);
    
    printTestSummary(tests);
    
    const metrics = calculateMetrics(tests, testDurations, executionTimeMs, passed, failed, errors);
    
    return {
      passed: false,
      return_code: error.status || -1,
      output: combinedOutput,
      metrics,
    };
  }
}

function printTestSummary(tests: TestResult[]): void {
  const passed = tests.filter(t => t.outcome === 'passed').length;
  const failed = tests.filter(t => t.outcome === 'failed').length;
  const skipped = tests.filter(t => t.outcome === 'skipped').length;
  const total = tests.length;
  
  console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped (total: ${total})`);
  
  for (const test of tests) {
    const statusIcon: Record<string, string> = {
      passed: '✅',
      failed: '❌',
      skipped: '⏭️',
      unknown: '❓'
    };
    console.log(`  ${statusIcon[test.outcome]} ${test.nodeid}: ${test.outcome}`);
  }
}

function runEvaluation(): EvaluationResults {
  const projectRoot = path.resolve(__dirname, '..');
  const testsDir = path.join(projectRoot, 'tests');
  
  // Check if repository_before is empty (only has .gitkeep or is empty)
  const beforeDir = path.join(projectRoot, 'repository_before');
  const beforeFiles = fs.readdirSync(beforeDir);
  const isBeforeEmpty = beforeFiles.length === 0 || (beforeFiles.length === 1 && beforeFiles[0] === '.gitkeep');
  
  // Run tests with BEFORE implementation
  let beforeResults: JestRunOutputWithMetrics;
  if (isBeforeEmpty) {
    console.log('\n' + '='.repeat(100));
    console.log('RUNNING TESTS FOR: BEFORE (REPOSITORY_BEFORE)');
    console.log('='.repeat(100));
    console.log('Repository before is empty - skipping tests');
    beforeResults = {
      passed: false,
      return_code: -1,
      output: 'No tests run',
      metrics: {
        avg_time_ms: 0,
        p95_time_ms: 0,
        failures: 0,
        failure_rate: 0.0,
        deadlocks: 0,
        ops_per_second: 0,
        rows_processed: 0,
        warnings: 0
      }
    };
  } else {
    beforeResults = runJestTests(testsDir, 'before (repository_before)');
  }
  
  const afterResults = runJestTests(testsDir, 'after (repository_after)');
  
  console.log('\n' + '='.repeat(100));
  console.log('EVALUATION SUMMARY');
  console.log('='.repeat(100));
  console.log('\nBefore Implementation (repository_before):');
  if (isBeforeEmpty) {
    console.log(`  Overall: ⏭️  SKIPPED (repository empty)`);
  } else {
    console.log(`  Overall: ${beforeResults.passed ? '✅ PASSED' : '❌ FAILED'}`);
  }
  console.log('\nAfter Implementation (repository_after):');
  console.log(`  Overall: ${afterResults.passed ? '✅ PASSED' : '❌ FAILED'}`);
  
  const afterPassed = afterResults.passed;
  if (afterPassed) {
    console.log('✅ After implementation: All tests passed (expected)');
  } else {
    console.log('❌ After implementation: Some tests failed (unexpected - should pass all)');
  }
  
  const improvementSummary = afterPassed
    ? 'Repository after passes all correctness tests.'
    : 'Repository after failed some tests.';

  return {
    before: beforeResults,
    after: afterResults,
    passed_gate: afterPassed,
    improvement_summary: improvementSummary,
  };
}

function generateOutputPath(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toISOString().split('T')[1].replace(/:/g, '-').split('.')[0];
  
  const projectRoot = path.resolve(__dirname, '..');
  const outputDir = path.join(projectRoot, 'evaluation', dateStr, timeStr);
  
  fs.mkdirSync(outputDir, { recursive: true });
  return path.join(outputDir, 'report.json');
}

function main(): void {
  const args = process.argv.slice(2);
  let outputPath: string | null = null;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && i + 1 < args.length) {
      outputPath = args[i + 1];
    }
  }
  
  const runId = generateRunId();
  const startedAt = new Date();
  
  console.log(`Run ID: ${runId}`);
  console.log(`Started at: ${startedAt.toISOString()}`);
  
  let success: boolean;
  let errorMessage: string | null = null;
  let evaluationResults: EvaluationResults;
  let beforeTests: JestRunOutput;
  let afterTests: JestRunOutput;
  let beforeMetrics: TestMetrics;
  let afterMetrics: TestMetrics;
  let passedGate: boolean;
  let improvementSummary: string;
  
  try {
    evaluationResults = runEvaluation();
    success = evaluationResults.after.passed;
    
    // Extract before and after results
    const { metrics: beforeMet, ...beforeRest } = evaluationResults.before;
    const { metrics: afterMet, ...afterRest } = evaluationResults.after;
    
    beforeTests = beforeRest;
    afterTests = afterRest;
    beforeMetrics = beforeMet;
    afterMetrics = afterMet;
    passedGate = evaluationResults.passed_gate;
    improvementSummary = evaluationResults.improvement_summary;
  } catch (error: any) {
    console.error(`\nERROR: ${error.message}`);
    console.error(error.stack);
    
    beforeTests = {
      passed: false,
      return_code: -1,
      output: 'Error during evaluation',
    };
    afterTests = {
      passed: false,
      return_code: -1,
      output: `Error during evaluation: ${error.message}`,
    };
    beforeMetrics = {
      avg_time_ms: 0,
      p95_time_ms: 0,
      failures: 0,
      failure_rate: 0.0,
      deadlocks: 0,
      ops_per_second: 0,
      rows_processed: 0,
      warnings: 0
    };
    afterMetrics = {
      avg_time_ms: 0,
      p95_time_ms: 0,
      failures: 0,
      failure_rate: 0.0,
      deadlocks: 0,
      ops_per_second: 0,
      rows_processed: 0,
      warnings: 0
    };
    passedGate = false;
    improvementSummary = `Evaluation failed with error: ${error.message}`;
    success = false;
    errorMessage = error.message;
  }
  
  const finishedAt = new Date();
  const duration = (finishedAt.getTime() - startedAt.getTime()) / 1000;
  
  const report = {
    run_id: runId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: parseFloat(duration.toFixed(6)),
    environment: getEnvironmentInfo(),
    before: {
      tests: beforeTests,
      metrics: beforeMetrics
    },
    after: {
      tests: afterTests,
      metrics: afterMetrics
    },
    comparison: {
      passed_gate: passedGate,
      improvement_summary: improvementSummary,
    },
    success,
    error: errorMessage,
  };
  
  const finalPath = outputPath || generateOutputPath();
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(finalPath, JSON.stringify(report, null, 2));
  
  console.log(`\n✅ Report saved to: ${finalPath}`);
  console.log('\n' + '='.repeat(100));
  console.log('EVALUATION COMPLETE');
  console.log('='.repeat(100));
  console.log(`Run ID: ${runId}`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Success: ${success ? '✅ YES' : '❌ NO'}`);
  
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main();
}

export { runEvaluation, generateRunId, getEnvironmentInfo };
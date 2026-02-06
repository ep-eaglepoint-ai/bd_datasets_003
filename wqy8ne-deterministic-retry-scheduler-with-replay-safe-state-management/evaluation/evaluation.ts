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

interface EvaluationResults {
  after: JestRunOutput;
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

function runJestTests(testsDir: string, label: string): JestRunOutput {
  console.log('\n' + '='.repeat(100));
  console.log(`RUNNING TESTS FOR: ${label.toUpperCase()}`);
  console.log('='.repeat(100));
  console.log(`Tests directory: ${testsDir}`);
  
  const projectRoot = path.resolve(__dirname, '..');
  
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
    
    const output = result.toString();
    const tests = parseJestOutput(output);
    printTestSummary(tests);
    
    return {
      passed: true,
      return_code: 0,
      output,
    };
    
  } catch (error: any) {
    const output = error.stdout ? error.stdout.toString() : '';
    const stderr = error.stderr ? error.stderr.toString() : '';
    const combinedOutput = output + stderr;
    
    const tests = parseJestOutput(combinedOutput);
    printTestSummary(tests);
    
    return {
      passed: false,
      return_code: error.status || -1,
      output: combinedOutput,
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
  
  const afterResults = runJestTests(testsDir, 'after (repository_after)');
  
  console.log('\n' + '='.repeat(100));
  console.log('EVALUATION SUMMARY');
  console.log('='.repeat(100));
  console.log('\nAfter Implementation (repository_after):');
  console.log(`  Overall: ${afterResults.passed ? '✅ PASSED' : '❌ FAILED'}`);
  
  const afterPassed = afterResults.passed;
  const improvementSummary = afterPassed
    ? 'Repository after passes all correctness tests.'
    : 'Repository after failed some tests.';

  return {
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
  
  try {
    evaluationResults = runEvaluation();
    success = evaluationResults.after.passed;
  } catch (error: any) {
    console.error(`\nERROR: ${error.message}`);
    evaluationResults = {
      after: { passed: false, return_code: -1, output: error.message },
      passed_gate: false,
      improvement_summary: `Evaluation failed with error: ${error.message}`
    };
    success = false;
    errorMessage = error.message;
  }
  
  const finishedAt = new Date();
  const report = {
    run_id: runId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: (finishedAt.getTime() - startedAt.getTime()) / 1000,
    environment: getEnvironmentInfo(),
    after: { tests: evaluationResults.after, metrics: {} },
    comparison: {
      passed_gate: evaluationResults.passed_gate,
      improvement_summary: evaluationResults.improvement_summary,
    },
    success,
    error: errorMessage,
  };
  
  const finalPath = outputPath || generateOutputPath();
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(finalPath, JSON.stringify(report, null, 2));
  
  console.log(`\n✅ Report saved to: ${finalPath}`);
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main();
}

export { runEvaluation, generateRunId, getEnvironmentInfo };
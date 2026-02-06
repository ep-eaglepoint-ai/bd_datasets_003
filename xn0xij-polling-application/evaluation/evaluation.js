#!/usr/bin/env node
/**
 * Evaluation runner for Polling Application.
 * 
 * This evaluation script:
 * - Runs Jest tests on the tests/ folder for after implementation
 * - Collects individual test results with pass/fail status
 * - Generates structured reports with environment metadata
 * 
 * Run with:
 * node evaluation/evaluation.js [options]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');

function generateRunId() {
  return uuidv4();
}

function getEnvironmentInfo() {
  return {
    node_version: process.version,
    platform: process.platform,
  };
}

function parseJestOutput(output) {
  const tests = [];
  const lines = output.split('\n');
  
  // Track current test suite
  let currentSuite = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Detect test suite names (indented, no special characters at start)
    if (line.match(/^\s{2}[A-Z]/) && !trimmed.match(/^(✓|✕|○|√|PASS|FAIL)/)) {
      currentSuite = trimmed;
      continue;
    }
    
    // Match Jest test output patterns with various symbols
    // Jest uses √ (not ✓) in verbose mode
    const testMatch = trimmed.match(/^(√|✓|✕|×|○)\s+(.+?)(?:\s+\(\d+\s*ms\))?$/);
    
    if (testMatch) {
      const symbol = testMatch[1];
      const testName = testMatch[2].trim();
      let outcome = 'unknown';
      
      if (symbol === '√' || symbol === '✓') {
        outcome = 'passed';
      } else if (symbol === '✕' || symbol === '×') {
        outcome = 'failed';
      } else if (symbol === '○') {
        outcome = 'skipped';
      }
      
      const nodeid = currentSuite ? `${currentSuite} > ${testName}` : testName;
      
      tests.push({
        nodeid: nodeid,
        name: testName,
        outcome: outcome,
      });
    }
  }
  
  return tests;
}

function runJestTests(testsDir, label) {
  console.log('\n' + '='.repeat(100));
  console.log(`RUNNING TESTS FOR: ${label.toUpperCase()}`);
  console.log('='.repeat(100));
  console.log(`Tests directory: ${testsDir}`);
  
  const projectRoot = path.resolve(__dirname, '..');
  
  try {
    // Run Jest with verbose output and capture to buffer
    const result = execSync(
      'npm test -- --verbose --no-coverage 2>&1',
      {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: 120000,
      }
    );
    
    const output = result;
    
    // Parse test results
    const tests = parseJestOutput(output);
    
    // Count results
    const passed = tests.filter(t => t.outcome === 'passed').length;
    const failed = tests.filter(t => t.outcome === 'failed').length;
    const skipped = tests.filter(t => t.outcome === 'skipped').length;
    const total = tests.length;
    
    console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped (total: ${total})`);
    
    // Print individual test results
    for (const test of tests) {
      const statusIcon = {
        passed: '✅',
        failed: '❌',
        error: '💥',
        skipped: '⏭️',
      }[test.outcome] || '❓';
      
      console.log(`  ${statusIcon} ${test.nodeid}: ${test.outcome}`);
    }
    
    return {
      passed: true,
      return_code: 0,
      output: output,
    };
    
  } catch (error) {
    const output = error.stdout ? error.stdout.toString() : '';
    const stderr = error.stderr ? error.stderr.toString() : '';
    const combinedOutput = output + stderr;
    
    // Parse test results even on failure
    const tests = parseJestOutput(combinedOutput);
    
    // Count results
    const passed = tests.filter(t => t.outcome === 'passed').length;
    const failed = tests.filter(t => t.outcome === 'failed').length;
    const skipped = tests.filter(t => t.outcome === 'skipped').length;
    const total = tests.length;
    
    console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped (total: ${total})`);
    
    // Print individual test results
    for (const test of tests) {
      const statusIcon = {
        passed: '✅',
        failed: '❌',
        error: '💥',
        skipped: '⏭️',
      }[test.outcome] || '❓';
      
      console.log(`  ${statusIcon} ${test.nodeid}: ${test.outcome}`);
    }
    
    return {
      passed: false,
      return_code: error.status || -1,
      output: combinedOutput,
    };
  }
}

function runEvaluation() {
  const projectRoot = path.resolve(__dirname, '..');
  const testsDir = path.join(projectRoot, 'tests');
  
  // Run tests with AFTER implementation
  const afterResults = runJestTests(testsDir, 'after (repository_after)');
  
  // Print summary
  console.log('\n' + '='.repeat(100));
  console.log('EVALUATION SUMMARY');
  console.log('='.repeat(100));
  console.log('\nAfter Implementation (repository_after):');
  console.log(`  Overall: ${afterResults.passed ? '✅ PASSED' : '❌ FAILED'}`);
  
  // Determine expected behavior
  const afterPassed = afterResults.passed;
  
  if (afterPassed) {
    console.log('✅ After implementation: All tests passed (expected)');
  } else {
    console.log('❌ After implementation: Some tests failed (unexpected - should pass all)');
  }
  
  // Generate summary
  const improvementSummary = afterPassed
    ? 'Repository after passes all correctness tests.'
    : 'Repository after failed some tests.';
  
  const passedGate = afterPassed;
  
  return {
    after: afterResults,
    passed_gate: passedGate,
    improvement_summary: improvementSummary,
  };
}

function generateOutputPath() {
  const now = new Date();
  
  // Use UTC time for consistency
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`; // YYYY-MM-DD
  
  // Format time as HH-MM-SS in UTC
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const timeStr = `${hours}-${minutes}-${seconds}`;
  
  const projectRoot = path.resolve(__dirname, '..');
  const outputDir = path.join(projectRoot, 'evaluation', dateStr, timeStr);
  
  fs.mkdirSync(outputDir, { recursive: true });
  
  return path.join(outputDir, 'report.json');
}

function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let outputPath = null;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && i + 1 < args.length) {
      outputPath = args[i + 1];
    }
  }
  
  // Generate run ID and timestamps (UTC)
  const runId = generateRunId();
  const startedAt = new Date();
  
  console.log(`Run ID: ${runId}`);
  console.log(`Started at: ${startedAt.toISOString()}`);
  
  let results;
  let success;
  let errorMessage = null;
  let afterTests;
  let passedGate;
  let improvementSummary;
  
  try {
    results = runEvaluation();
    
    // Success if after implementation passes all tests
    success = results.after.passed;
    
    // Extract after results
    afterTests = results.after;
    passedGate = results.passed_gate;
    improvementSummary = results.improvement_summary;
    
  } catch (error) {
    console.error(`\nERROR: ${error.message}`);
    console.error(error.stack);
    
    // Create default error results
    afterTests = {
      passed: false,
      return_code: -1,
      output: `Error during evaluation: ${error.message}`,
    };
    
    passedGate = false;
    improvementSummary = `Evaluation failed with error: ${error.message}`;
    success = false;
    errorMessage = error.message;
  }
  
  const finishedAt = new Date();
  const duration = (finishedAt - startedAt) / 1000; // seconds
  
  // Collect environment information
  const environment = getEnvironmentInfo();
  
  // Build report
  const report = {
    run_id: runId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: parseFloat(duration.toFixed(6)),
    environment: environment,
    after: {
      tests: afterTests,
      metrics: {},
    },
    comparison: {
      passed_gate: passedGate,
      improvement_summary: improvementSummary,
    },
    success: success,
    error: errorMessage,
  };
  
  // Determine output path
  if (!outputPath) {
    outputPath = generateOutputPath();
  }
  
  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  
  // Write report
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  
  console.log(`\n✅ Report saved to: ${outputPath}`);
  console.log('\n' + '='.repeat(100));
  console.log('EVALUATION COMPLETE');
  console.log('='.repeat(100));
  console.log(`Run ID: ${runId}`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Success: ${success ? '✅ YES' : '❌ NO'}`);
  
  process.exit(success ? 0 : 1);
}

// Check if uuid is available, if not provide instructions
try {
  require('uuid');
} catch (error) {
  console.error('Error: uuid package is required. Install it with:');
  console.error('  npm install uuid');
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { runEvaluation, generateRunId, getEnvironmentInfo };

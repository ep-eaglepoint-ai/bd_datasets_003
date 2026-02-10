#!/usr/bin/env node
/**
 * Evaluation script for Editor Test Suite
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.dirname(__dirname);

function runActualTests(repoPath) {
  const results = {
    passed: 0,
    failed: 0,
    total: 0,
    tests: []
  };

  try {
    const result = spawnSync('npm', ['test'], {
      cwd: repoPath,
      env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
      encoding: 'utf-8',
      timeout: 180000,
      shell: true
    });

    const output = result.stdout + result.stderr;

    // Strip ANSI color codes
    const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');

    // Parse test summary from Vitest output
    // Format: "Tests  98 passed (98)" or "Tests  1 failed | 97 passed (98)"
    const testLineMatch = cleanOutput.match(/Tests\s+(?:(\d+)\s+failed\s+\|\s+)?(\d+)\s+passed\s+\((\d+)\)/i);
    if (testLineMatch) {
      results.failed = parseInt(testLineMatch[1] || '0');
      results.passed = parseInt(testLineMatch[2]);
      results.total = parseInt(testLineMatch[3]);
    }

    // Parse individual test results - Vitest verbose format
    const lines = cleanOutput.split('\n');

    for (const line of lines) {
      // Match lines like: ✓ src/__tests__/formatTime.test.ts > formatTime > Edge cases > should return...
      if (line.includes('✓') && line.includes('src/__tests__')) {
        const match = line.match(/✓\s+src\/__tests__\/[\w\.-]+\s+>\s+(.+)$/);
        if (match) {
          const testName = match[1].trim().replace(/\s+>\s+/g, ' ').replace(/\s+\d+m?s$/, '');
          results.tests.push({
            name: testName,
            passed: true
          });
        }
      }

      if (line.includes('✗') && line.includes('src/__tests__')) {
        const match = line.match(/✗\s+src\/__tests__\/[\w\.-]+\s+>\s+(.+)$/);
        if (match) {
          const testName = match[1].trim().replace(/\s+>\s+/g, ' ').replace(/\s+\d+m?s$/, '');
          results.tests.push({
            name: testName,
            passed: false
          });
        }
      }
    }

  } catch (error) {
    results.error = error.message;
  }

  return results;
}

function runMetaTests(testsPath) {
  const results = {
    passed: 0,
    failed: 0,
    total: 0,
    tests: []
  };

  try {
    // First install dependencies for meta tests
    spawnSync('npm', ['install'], {
      cwd: testsPath,
      env: { ...process.env, CI: 'true' },
      encoding: 'utf-8',
      shell: true,
      stdio: 'ignore'
    });

    // Run Jest meta tests
    const result = spawnSync('npm', ['test', '--', '--verbose'], {
      cwd: testsPath,
      env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
      encoding: 'utf-8',
      timeout: 180000,
      shell: true
    });

    const output = result.stdout + result.stderr;

    // Parse Jest output
    // Format: "Tests: 48 passed, 48 total" or "Tests: 1 failed, 47 passed, 48 total"
    const testSummaryMatch = output.match(/Tests:\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed,\s+(\d+)\s+total/i);
    if (testSummaryMatch) {
      results.failed = parseInt(testSummaryMatch[1] || '0');
      results.passed = parseInt(testSummaryMatch[2]);
      results.total = parseInt(testSummaryMatch[3]);
    }

    // Parse individual Jest test results
    const lines = output.split('\n');
    for (const line of lines) {
      // Match: ✓ test name (123ms) or ✕ test name (123ms)
      const passMatch = line.match(/✓\s+(.+?)(?:\s+\(\d+\s*m?s\))?$/);
      if (passMatch && !line.includes('PASS')) {
        const testName = passMatch[1].trim();
        if (testName && testName.length > 5) { // Filter out noise
          results.tests.push({
            name: testName,
            passed: true
          });
        }
      }

      const failMatch = line.match(/✕\s+(.+?)(?:\s+\(\d+\s*m?s\))?$/);
      if (failMatch && !line.includes('FAIL')) {
        const testName = failMatch[1].trim();
        if (testName && testName.length > 5) {
          results.tests.push({
            name: testName,
            passed: false
          });
        }
      }
    }

  } catch (error) {
    results.error = error.message;
  }

  return results;
}

function saveReport(actualTestResults, metaTestResults) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  const outputDir = path.join(projectRoot, 'evaluation', dateStr, timeStr);

  fs.mkdirSync(outputDir, { recursive: true });

  const report = {
    timestamp: now.toISOString(),
    repository_before: {
      passed: actualTestResults.passed,
      failed: actualTestResults.failed,
      total: actualTestResults.total,
      tests: actualTestResults.tests
    },
    repository_after: {
      passed: metaTestResults.passed,
      failed: metaTestResults.failed,
      total: metaTestResults.total,
      tests: metaTestResults.tests
    }
  };

  const filepath = path.join(outputDir, 'report.json');
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));

  return `evaluation/${dateStr}/${timeStr}/report.json`;
}

function main() {
  console.log('='.repeat(60));
  console.log('Editor Test Suite - Evaluation');
  console.log('='.repeat(60));

  const repoAfter = path.join(projectRoot, 'repository_after');
  const testsRoot = path.join(projectRoot, 'tests');

  console.log('\n[Actual Component Tests - repository_after]');
  const actualResults = runActualTests(repoAfter);
  console.log(`  Passed: ${actualResults.passed}`);
  console.log(`  Failed: ${actualResults.failed}`);
  console.log(`  Total:  ${actualResults.total}`);

  console.log('\n[Meta Tests - tests/ (validates requirements)]');
  const metaResults = runMetaTests(testsRoot);
  console.log(`  Passed: ${metaResults.passed}`);
  console.log(`  Failed: ${metaResults.failed}`);
  console.log(`  Total:  ${metaResults.total}`);

  const reportPath = saveReport(actualResults, metaResults);
  console.log(`\n  Report: ${reportPath}`);

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));

  // Both actual tests and meta tests must pass
  if (actualResults.failed === 0 && actualResults.passed > 0 &&
      metaResults.failed === 0 && metaResults.passed > 0) {
    console.log('✅ PASS: All actual tests pass');
    console.log('✅ PASS: All meta tests pass (requirements validated)');
    process.exit(0);
  } else {
    if (actualResults.failed > 0 || actualResults.passed === 0) {
      console.log('❌ FAIL: Some actual tests failed');
    }
    if (metaResults.failed > 0 || metaResults.passed === 0) {
      console.log('❌ FAIL: Some meta tests failed (requirements not met)');
    }
    process.exit(1);
  }
}

main();

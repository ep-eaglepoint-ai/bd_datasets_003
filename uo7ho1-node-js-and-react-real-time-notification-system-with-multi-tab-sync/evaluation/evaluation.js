/**
 * Evaluation script for Real-time Notification System
 * Parses vitest verbose output and generates timestamped reports
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read stdin (piped output from vitest)
let inputData = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  processResults(inputData);
});

// Strip ANSI escape codes
function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\[[\d;]*m/g, '');
}

function processResults(data) {
  console.log('============================================================');
  console.log('Real-time Notification System - Evaluation');
  console.log('============================================================\n');

  // Strip ANSI codes first
  const cleanData = stripAnsi(data);

  const tests = [];
  let passed = 0;
  let failed = 0;

  try {
    const lines = cleanData.split('\n');

    for (const line of lines) {
      // Match vitest verbose format: "✓ tests/file.ts > describe > test name"
      const passMatch = line.match(/^\s*[✓√✔]\s+tests\/[^\s]+\s+>\s+(.+)$/);
      if (passMatch) {
        const testPath = passMatch[1].trim();
        const testName = testPath.replace(/\s+>\s+/g, ' ');
        tests.push({
          name: testName,
          passed: true
        });
        passed++;
        continue;
      }

      // Match failed tests
      const failMatch = line.match(/^\s*[✗×✘]\s+tests\/[^\s]+\s+>\s+(.+)$/);
      if (failMatch) {
        const testPath = failMatch[1].trim();
        const testName = testPath.replace(/\s+>\s+/g, ' ');
        tests.push({
          name: testName,
          passed: false
        });
        failed++;
        continue;
      }
    }

    // Fallback: if no tests parsed, get counts from summary
    if (tests.length === 0) {
      const testsMatch = cleanData.match(/Tests\s+(\d+)\s+passed/);
      const failedMatch = cleanData.match(/(\d+)\s+failed/);

      if (testsMatch) {
        passed = parseInt(testsMatch[1]);
      }
      if (failedMatch) {
        failed = parseInt(failedMatch[1]);
      }

      // Create placeholder entries
      for (let i = 1; i <= passed; i++) {
        tests.push({ name: `Test ${i}`, passed: true });
      }
      for (let i = 1; i <= failed; i++) {
        tests.push({ name: `Failed Test ${i}`, passed: false });
      }
    }

  } catch (error) {
    console.error('Error parsing test results:', error.message);
  }

  const total = passed + failed;

  // Print results
  console.log(' Evaluating repository_after...');
  console.log(`    Passed: ${passed}`);
  console.log(`    Failed: ${failed}\n`);

  const successRate = total > 0 ? ((passed / total) * 100).toFixed(2) : '0.00';
  const overallPass = failed === 0 && passed > 0;

  console.log('============================================================');
  console.log('EVALUATION SUMMARY');
  console.log('============================================================');
  console.log(`Total Tests: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${successRate}%`);
  console.log(`Overall: ${overallPass ? 'PASS' : 'FAIL'}`);
  console.log('============================================================');

  // Generate report
  generateReport(tests, passed, failed, total);
}

function generateReport(tests, passed, failed, total) {
  const now = new Date();
  const dateFolder = now.toISOString().split('T')[0];
  const timeFolder = now.toISOString().split('T')[1].slice(0, 8).replace(/:/g, '-');

  const baseEval = path.resolve(__dirname);
  const outputDir = path.join(baseEval, dateFolder, timeFolder);

  fs.mkdirSync(outputDir, { recursive: true });

  // Build report in the correct format
  const report = {
    timestamp: now.toISOString(),
    repository_after: {
      passed: passed,
      failed: failed,
      total: total,
      tests: tests
    }
  };

  const reportPath = path.join(outputDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\nReport saved to: ${reportPath}`);
}

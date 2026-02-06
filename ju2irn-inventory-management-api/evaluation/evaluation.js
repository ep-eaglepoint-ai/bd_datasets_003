const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function runTests(scriptName, testName) {
  console.log(`\n[${testName}]`);
  console.log('='.repeat(60));

  const result = spawnSync('npm', ['run', scriptName], {
    cwd: projectRoot,
    env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
    encoding: 'utf-8',
    timeout: 180000,
    shell: true
  });

  const output = (result.stdout || '') + (result.stderr || '');

  // Strip ANSI codes
  const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');

  const results = {
    passed: 0,
    failed: 0,
    total: 0,
    tests: []
  };

  // Parse Jest output: Tests: X passed, X total or Tests: X failed, X passed, X total
  const testLineMatch = cleanOutput.match(/Tests:\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed,\s+(\d+)\s+total/i);
  if (testLineMatch) {
    results.failed = parseInt(testLineMatch[1] || '0');
    results.passed = parseInt(testLineMatch[2]);
    results.total = parseInt(testLineMatch[3]);
  }

  // Parse individual test results
  const passPattern = /✓\s+(.+?)(?:\s+\(\d+\s*m?s\))?$/gm;
  const failPattern = /✕\s+(.+?)(?:\s+\(\d+\s*m?s\))?$/gm;

  let match;
  while ((match = passPattern.exec(cleanOutput)) !== null) {
    results.tests.push({ name: match[1].trim(), status: 'passed' });
  }
  while ((match = failPattern.exec(cleanOutput)) !== null) {
    results.tests.push({ name: match[1].trim(), status: 'failed' });
  }

  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Total:  ${results.total}`);

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
    instance_id: 'JU2IRN',
    repository_before: {
      description: 'Actual API tests (Jest + Supertest)',
      passed: actualTestResults.passed,
      failed: actualTestResults.failed,
      total: actualTestResults.total,
      tests: actualTestResults.tests
    },
    repository_after: {
      description: 'Meta tests (validates test suite)',
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
  console.log('============================================================');
  console.log('Inventory Management API - Test Evaluation');
  console.log('============================================================');

  // Run actual API tests
  const actualTestResults = runTests('test:api', 'Actual API Tests - repository_after');

  // Run meta tests
  const metaTestResults = runTests('test:meta', 'Meta Tests - tests/ (validates requirements)');

  // Save report
  const reportPath = saveReport(actualTestResults, metaTestResults);

  console.log('\n============================================================');
  console.log('Summary');
  console.log('============================================================');
  console.log(`  Report: ${reportPath}`);

  if (actualTestResults.failed === 0 && metaTestResults.failed === 0) {
    console.log('\n✅ PASS: All tests pass');
  } else {
    console.log('\n❌ FAIL: Some tests failed');
    if (actualTestResults.failed > 0) {
      console.log(`   - ${actualTestResults.failed} actual test(s) failed`);
    }
    if (metaTestResults.failed > 0) {
      console.log(`   - ${metaTestResults.failed} meta test(s) failed`);
    }
  }

  console.log('');
}

main();

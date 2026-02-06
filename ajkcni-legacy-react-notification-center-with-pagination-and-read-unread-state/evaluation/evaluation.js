#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function generateRunId() {
  return Math.random().toString(16).substring(2, 10);
}

function getGitInfo() {
  const gitInfo = { git_commit: 'unknown', git_branch: 'unknown' };
  
  try {
    const commitResult = spawnSync('git', ['rev-parse', 'HEAD'], { 
      encoding: 'utf-8', 
      timeout: 5000 
    });
    if (commitResult.status === 0) {
      gitInfo.git_commit = commitResult.stdout.trim().substring(0, 8);
    }
  } catch (e) {}

  try {
    const branchResult = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { 
      encoding: 'utf-8', 
      timeout: 5000 
    });
    if (branchResult.status === 0) {
      gitInfo.git_branch = branchResult.stdout.trim();
    }
  } catch (e) {}

  return gitInfo;
}

function getEnvironmentInfo() {
  const gitInfo = getGitInfo();

  return {
    node_version: process.version,
    platform: `${os.platform()}-${os.release()}`,
    os: os.platform(),
    os_release: os.release(),
    architecture: os.arch(),
    hostname: os.hostname(),
    git_commit: gitInfo.git_commit,
    git_branch: gitInfo.git_branch,
  };
}

function runJestTests(testsDir, label, targetRepo) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RUNNING TESTS: ${label.toUpperCase()}`);
  console.log('='.repeat(60));
  console.log(`Tests directory: ${testsDir}`);

  // In the original snippet, cwd was testsDir.
  // However, to ensure dependencies are found (Jest), we usually need to run from the repo dir.
  // The provided report example shows 'before' failing (likely due to missing env) and 'after' passing.
  // Running from targetRepo achieves this naturally in our container.
  
  const projectRoot = path.resolve(__dirname, '..');
  const repoDir = path.join(projectRoot, targetRepo);
  const cwd = fs.existsSync(repoDir) ? repoDir : testsDir;

  const cmd = 'npx';
  const args = ['jest', '--json', '--runInBand', '--forceExit'];

  const env = Object.assign({}, process.env, {
    TARGET_REPO: targetRepo,
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || 'test-secret',
  });

  try {
    const result = spawnSync(cmd, args, {
      cwd: cwd,
      env: env,
      encoding: 'utf-8',
      timeout: 120000,
    });

    const stdout = result.stdout || '';
    const stderr = result.stderr || '';

    try {
      const jestData = JSON.parse(stdout);

      const passed = jestData.numPassedTests || 0;
      const failed = jestData.numFailedTests || 0;
      const total = jestData.numTotalTests || 0;

      const tests = [];
      const testResults = jestData.testResults || [];
      
      for (let i = 0; i < testResults.length; i++) {
        const testFile = testResults[i];
        const assertionResults = testFile.assertionResults || [];
        for (let j = 0; j < assertionResults.length; j++) {
          const assertion = assertionResults[j];
          const status = assertion.status;
          const name = assertion.title;
          const ancestor = assertion.ancestorTitles || [];
          const fullName = [...ancestor, name].join(' > ');

          tests.push({
            nodeid: fullName,
            name: name,
            outcome: status,
          });
        }
      }

      console.log(`\nResults: ${passed} passed, ${failed} failed (total: ${total})`);

      for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        const statusIcon = test.outcome === 'passed' ? '✅' : '❌';
        console.log(`  ${statusIcon} ${test.nodeid}`);
      }

      return {
        success: result.status === 0,
        exit_code: result.status || 0,
        tests: tests,
        summary: {
          total: total,
          passed: passed,
          failed: failed,
          errors: 0,
          skipped: jestData.numPendingTests || 0,
        },
        stdout: stdout.length > 3000 ? stdout.slice(-3000) : stdout,
        stderr: stderr.length > 1000 ? stderr.slice(-1000) : stderr,
      };
    } catch (e) {
      console.log(`❌ Failed to parse Jest JSON output: ${e}`);
      return {
        success: false,
        exit_code: result.status || -1,
        tests: [],
        summary: { error: 'Failed to parse Jest output', total: 0, passed: 0, failed: 0, errors: 0, skipped: 0 },
        stdout: stdout,
        stderr: stderr,
      };
    }
  } catch (e) {
    if (e.message && e.message.includes('TIMEOUT')) {
      console.log('❌ Test execution timed out');
      return {
        success: false,
        exit_code: -1,
        tests: [],
        summary: { error: 'Test execution timed out', total: 0, passed: 0, failed: 0, errors: 0, skipped: 0 },
        stdout: '',
        stderr: '',
      };
    }
    console.log(`❌ Error running tests: ${e}`);
    return {
      success: false,
      exit_code: -1,
      tests: [],
      summary: { error: String(e), total: 0, passed: 0, failed: 0, errors: 0, skipped: 0 },
      stdout: '',
      stderr: '',
    };
  }
}

function runEvaluation() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Three Mens Morris EVALUATION');
  console.log('='.repeat(60));

  const projectRoot = path.resolve(__dirname, '..');
  const testsDir = path.join(projectRoot, 'tests');

  console.log(`\n${'='.repeat(60)}`);
  console.log('RUNNING TESTS: BEFORE (repository_before)');
  console.log('='.repeat(60));

  const beforeResults = runJestTests(testsDir, 'before (repository_before)', 'repository_before');

  const afterResults = runJestTests(testsDir, 'after (repository_after)', 'repository_after');

  const comparison = {
    before_tests_passed: beforeResults.success,
    after_tests_passed: afterResults.success,
    before_total: (beforeResults.summary && beforeResults.summary.total) || 0,
    before_passed: (beforeResults.summary && beforeResults.summary.passed) || 0,
    before_failed: (beforeResults.summary && beforeResults.summary.failed) || 0,
    after_total: (afterResults.summary && afterResults.summary.total) || 0,
    after_passed: (afterResults.summary && afterResults.summary.passed) || 0,
    after_failed: (afterResults.summary && afterResults.summary.failed) || 0,
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log('EVALUATION SUMMARY');
  console.log('='.repeat(60));

  console.log(`\nBefore Implementation (repository_before):`);
  console.log(`  Overall: ${beforeResults.success ? '✅ PASSED' : '⏭️ SKIPPED/FAILED'}`);
  console.log(`  Tests: ${comparison.before_passed}/${comparison.before_total} passed`);

  console.log(`\nAfter Implementation (repository_after):`);
  console.log(`  Overall: ${afterResults.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  Tests: ${comparison.after_passed}/${comparison.after_total} passed`);

  console.log(`\n${'='.repeat(60)}`);
  console.log('EXPECTED BEHAVIOR CHECK');
  console.log('='.repeat(60));

  if (afterResults.success) {
    console.log('✅ After implementation: All tests passed (expected)');
  } else {
    console.log('❌ After implementation: Some tests failed (unexpected - should pass all)');
  }

  return {
    before: beforeResults,
    after: afterResults,
    comparison: comparison,
  };
}

function generateOutputPath() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');

  const projectRoot = path.resolve(__dirname, '..');
  const outputDir = path.join(projectRoot, 'evaluation', dateStr, timeStr);

  // fs.mkdirSync(outputDir, { recursive: true });
  // The snippet had mkdirSync here, but we also do it in main.
  // We'll keep it to return the path.
  // Actually, main calls mkdirSync on outputDir.
  return path.join(outputDir, 'report.json');
}

function main() {
  const args = process.argv.slice(2);
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[i + 1];
    }
  }

  const runId = generateRunId();
  const startedAt = new Date();

  console.log(`Run ID: ${runId}`);
  console.log(`Started at: ${startedAt.toISOString()}`);

  let results = null;
  let success = false;
  let errorMessage = null;

  try {
    results = runEvaluation();
    success = results.after.success;
    errorMessage = success ? null : 'After implementation tests failed';
  } catch (e) {
    console.log(`\nERROR: ${e}`);
    if (e.stack) console.error(e.stack);
    success = false;
    errorMessage = String(e);
  }

  const finishedAt = new Date();
  const duration = (finishedAt.getTime() - startedAt.getTime()) / 1000;

  const environment = getEnvironmentInfo();

  const report = {
    run_id: runId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: Math.round(duration * 1000000) / 1000000,
    success: success,
    error: errorMessage,
    environment: environment,
    results: results,
  };

  const finalOutputPath = outputPath || generateOutputPath();
  const outputDir = path.dirname(finalOutputPath);
  if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(finalOutputPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Report saved to: ${finalOutputPath}`);

  console.log(`\n${'='.repeat(60)}`);
  console.log('EVALUATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Run ID: ${runId}`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Success: ${success ? '✅ YES' : '❌ NO'}`);

  return success ? 0 : 1;
}

const exitCode = main();
process.exit(exitCode);

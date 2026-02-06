import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

function tryParseJSONCandidates(text: string, predicate?: (obj: any) => boolean) {
  // Find all '{' indices
  const starts: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === '{') starts.push(i);
  const lastBrace = text.lastIndexOf('}');
  if (starts.length === 0 || lastBrace === -1) return null;

  for (let si = starts.length - 1; si >= 0; si--) {
    const s = starts[si];
    const candidate = text.slice(s, lastBrace + 1);
    try {
      const obj = JSON.parse(candidate);
      if (!predicate || predicate(obj)) return obj;
    } catch (e) {
      // try smaller last brace positions if nested braces
      for (let end = lastBrace; end > s; end--) {
        if (text[end] !== '}') continue;
        const cand2 = text.slice(s, end + 1);
        try {
          const obj2 = JSON.parse(cand2);
          if (!predicate || predicate(obj2)) return obj2;
        } catch (_) {
          continue;
        }
      }
    }
  }
  return null;
}

function extractEnvJson(stdout: string) {
  // Look for a small JSON object that contains platform/arch/hostname keys
  const obj = tryParseJSONCandidates(stdout, (o) => o && (o.platform || o.hostname || o.arch));
  return obj || null;
}

function extractJestJson(stdout: string) {
  // Jest JSON contains keys like numTotalTests or testResults
  const obj = tryParseJSONCandidates(stdout, (o) => o && (o.numTotalTests !== undefined || o.testResults !== undefined));
  return obj || null;
}

function runEvaluate() {
  const runId = randomUUID();
  const startedAt = new Date();

  // Compose a shell command that runs npm test with JSON output and prints it
  const shCommand = `node -v; node -p \"JSON.stringify({node_version:process.version, platform:process.platform, os:require('os').type(), architecture:process.arch, hostname:require('os').hostname()})\"; npm test -- --json --outputFile=/tmp/jest-results.json --silent || true; cat /tmp/jest-results.json`;

  const proc = spawnSync('docker', ['compose', 'run', '--rm', 'test', 'sh', '-c', shCommand], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });

  const finishedAt = new Date();
  const durationSeconds = (finishedAt.getTime() - startedAt.getTime()) / 1000;

  let stdout = proc.stdout || '';
  let stderr = proc.stderr || '';
  let exitCode = proc.status === null ? (proc.error ? 1 : 0) : proc.status;

  // Extract environment info emitted by the container
  const envFromContainer = extractEnvJson(stdout);

  // Extract Jest JSON results printed at end
  let jestJson = extractJestJson(stdout);

  // No fallback to local. Correctness requires the Docker environment for reproducibility.
  if (!jestJson) {
    console.error('CRITICAL: Could not parse Jest JSON from Docker container output.');
    // We still proceed to write the report with whatever info we have (stdout/stderr)
  }

  // Detect unexpected console.error calls
  // Filtering out standard Jest "Error: " messages and stack traces to avoid false positives.
  const hasConsoleError = stderr.split('\n').some(line =>
    line.includes('console.error') ||
    (line.includes('Error:') && !line.includes('expect(received)') && !line.includes('at '))
  );

  const report: any = {
    run_id: runId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: durationSeconds,
    success: exitCode === 0,
    error: exitCode === 0
      ? null
      : (stderr || `exit code ${exitCode}`),
    environment: envFromContainer || {
      node_version: process.version,
      platform: process.platform,
      os: require('os').type(),
      architecture: process.arch,
      hostname: require('os').hostname(),
    },
    results: {
      after: {
        success: exitCode === 0,
        exit_code: exitCode,
        unexpected_console_errors: hasConsoleError,
        raw_stdout: stdout.split('\n').slice(-1000).join('\n'),
        raw_stderr: stderr.split('\n').slice(-1000).join('\n'),
        tests: [] as any[],
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          xfailed: 0,
          errors: 0,
          skipped: 0,
        },
      },
      comparison: {
        after_tests_passed: exitCode === 0,
      },
    },
  };

  if (jestJson) {
    const tests: any[] = [];
    if (Array.isArray(jestJson.testResults)) {
      for (const suite of jestJson.testResults) {
        if (Array.isArray(suite.assertionResults)) {
          for (const r of suite.assertionResults) {
            tests.push({ name: r.fullName || r.title, status: r.status, duration: r.duration || null, failureMessages: r.failureMessages || [] });
          }
        }
      }
    }
    report.results.after.tests = tests;
    report.results.after.summary = {
      total: jestJson.numTotalTests || tests.length,
      passed: jestJson.numPassedTests || tests.filter(t => t.status === 'passed').length,
      failed: jestJson.numFailedTests || tests.filter(t => t.status === 'failed').length,
      xfailed: jestJson.numPendingTests || 0,
      errors: (jestJson.testExecError ? 1 : 0),
      skipped: jestJson.numPendingTests || 0,
    };
    report.results.comparison.after_total = report.results.after.summary.total;
    report.results.comparison.after_passed = report.results.after.summary.passed;
    report.results.comparison.after_failed = report.results.after.summary.failed;
    report.results.comparison.after_xfailed = report.results.after.summary.xfailed || 0;
  }

  if (jestJson) {
    const failed = (jestJson.numFailedTests || 0) + (jestJson.testExecError ? 1 : 0);
    if (failed > 0) {
      report.success = false;
      report.results.after.success = false;
      report.results.comparison.after_tests_passed = false;
    } else {
      report.success = true;
      report.results.after.success = true;
      report.results.comparison.after_tests_passed = true;
    }
  }

  // Write report to evaluation/yyyy-mm-dd/hh-mm-ss/report.json
  const pad = (n: number) => n.toString().padStart(2, '0');
  const d = new Date();
  const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const timePart = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const dir = join(__dirname, datePart, timePart);
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, 'report.json');

  // Save full logs to separate files for better interpretation
  writeFileSync(join(dir, 'stdout.log'), stdout, 'utf8');
  writeFileSync(join(dir, 'stderr.log'), stderr, 'utf8');

  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Wrote report to ${outPath}`);
  if (!jestJson) console.warn('Warning: could not parse Jest JSON from test run output; report contains raw stdout/stderr.');
}

if (require.main === module) {
  try {
    runEvaluate();
  } catch (e: any) {
    console.error('Evaluation run failed:', e && e.message ? e.message : e);
    process.exit(2);
  }
}

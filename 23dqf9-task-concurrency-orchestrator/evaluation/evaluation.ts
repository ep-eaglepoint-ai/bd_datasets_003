import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const reportPath = path.join(__dirname, 'report.json');

async function runEvaluation() {
  console.log('🧪 Starting Evaluation...');

  try {
    
    execSync(
      `npx vitest run /app/tests/QueueManager.test.ts --reporter=json --outputFile=${reportPath}`,
      { stdio: 'inherit' }
    );
  } catch (e) {
    console.log('\n⚠️ Tests finished with failures.');
  }

  if (existsSync(reportPath)) {
    const rawData = readFileSync(reportPath, 'utf8');
    const data = JSON.parse(rawData);

    const summary = {
      score: `${((data.numPassedTests / data.numTotalTests) * 100).toFixed(0)}%`,
      passed: data.numPassedTests,
      failed: data.numFailedTests,
      total: data.numTotalTests,
      results: data.testResults[0]?.assertionResults.map((r: any) => ({
        test: r.title,
        status: r.status
      }))
    };

    writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`\n✅ Report saved to evaluation/report.json`);
    console.log(`Final Score: ${summary.score}`);
  }
}

runEvaluation();
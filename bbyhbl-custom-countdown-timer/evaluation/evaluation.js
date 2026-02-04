const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_BEFORE = path.resolve(__dirname, '../repository_before');
const REPO_AFTER = path.resolve(__dirname, '../repository_after');
const TESTS_DIR = path.resolve(__dirname, '../tests');
const REPORTS_DIR = path.join(__dirname, 'reports');

if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function runTestsAgainst(repoPath, env = {}) {
  console.log(`\n=== Running tests against: ${repoPath} ===`);
  
  const envVars = { 
    ...process.env, 
    ...env,
    REPO_PATH: repoPath,
    NODE_ENV: 'test',
  };
  
  try {
    const result = execSync(
      `cd ${TESTS_DIR} && npm run test:all`,
      { 
        env: envVars,
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 60000,
      }
    );
    
    return {
      success: true,
      output: result,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || error.message,
    };
  }
}

async function generateEvaluationReport() {
  const report = {
    timestamp: new Date().toISOString(),
    task: 'BBYHBL - Custom Countdown Timer',
    
    before: runTestsAgainst(REPO_BEFORE, {
      DATABASE_URL: process.env.TEST_DB_URL || 'postgresql://postgres:password@localhost:5432/countdown_test',
    }),
    after: runTestsAgainst(REPO_AFTER, {
      DATABASE_URL: process.env.TEST_DB_URL || 'postgresql://postgres:password@localhost:5432/countdown_test',
      API_URL: 'http://localhost:3001',
    }),

    requirements: [
      { id: 1, description: 'Countdown creation form', verified: false },
      { id: 2, description: 'Beautiful countdown display', verified: false },
      { id: 3, description: 'Shareable URLs', verified: false },
      { id: 4, description: 'User countdown grid view', verified: false },
      { id: 5, description: 'Three states handling', verified: false },
      { id: 6, description: 'Theme customization', verified: false },
    ],
  };
  const reportPath = path.join(REPORTS_DIR, 'evaluation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\n=== Evaluation Report Generated ===`);
  console.log(`Location: ${reportPath}`);
  console.log(`Before tests passed: ${report.before.success ? '✅' : '❌'}`);
  console.log(`After tests passed: ${report.after.success ? '✅' : '❌'}`);

  process.exit(report.after.success ? 0 : 1);
}
generateEvaluationReport().catch(error => {
  console.error('Evaluation failed:', error);
  process.exit(1);
});
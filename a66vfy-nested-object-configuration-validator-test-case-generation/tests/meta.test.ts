import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = path.join(__dirname, '..');
const REPO_AFTER = path.join(ROOT_DIR, 'repository_after');
const RESOURCES = path.join(__dirname, 'resources');
const CORRECT_IMPL = path.join(REPO_AFTER, 'configValidator.ts');
const BACKUP_IMPL = path.join(REPO_AFTER, 'configValidator.ts.backup');

const brokenImplementations = [
  { file: 'broken_no_server_check.ts', label: 'No server validation' },
  { file: 'broken_no_array_check.ts', label: 'No array check on services' },
  { file: 'broken_no_name_check.ts', label: 'No service name validation' },
  { file: 'broken_no_replicas_check.ts', label: 'No replicas type check' },
  { file: 'broken_always_true.ts', label: 'Always returns true' },
  { file: 'broken_always_false.ts', label: 'Always returns false' },
];

function runJestTests(): boolean {
  try {
    execSync('npx jest --config jest.config.ts --silent --no-cache', {
      cwd: ROOT_DIR,
      stdio: 'pipe',
    });
    return true; 
  } catch {
    return false; 
  }
}

describe('Meta-Test Suite', () => {
  beforeAll(() => {
    fs.copyFileSync(CORRECT_IMPL, BACKUP_IMPL);
  });

  afterAll(() => {
    if (fs.existsSync(BACKUP_IMPL)) {
      fs.copyFileSync(BACKUP_IMPL, CORRECT_IMPL);
      fs.unlinkSync(BACKUP_IMPL);
    }
  });

  afterEach(() => {
    if (fs.existsSync(BACKUP_IMPL)) {
      fs.copyFileSync(BACKUP_IMPL, CORRECT_IMPL);
    }
  });

  test('Tests should PASS against the correct implementation', () => {
    const passed = runJestTests();
    expect(passed).toBe(true);
  });

  brokenImplementations.forEach(({ file, label }) => {
    test(`Tests should FAIL against broken implementation: ${label}`, () => {
      const brokenPath = path.join(RESOURCES, file);
      fs.copyFileSync(brokenPath, CORRECT_IMPL);


      const passed = runJestTests();
      expect(passed).toBe(false);
    });
  });
});

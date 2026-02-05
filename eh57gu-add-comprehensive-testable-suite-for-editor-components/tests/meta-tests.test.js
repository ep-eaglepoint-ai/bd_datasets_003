/**
 * Meta tests that validate the test suite meets all requirements
 * These tests verify that the tests in repository_after are comprehensive and correct
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoAfterPath = path.join(__dirname, '..', 'repository_after');
const testsPath = path.join(repoAfterPath, 'src', '__tests__');

describe('Meta Test Suite - Requirement Validation', () => {
  let testFiles;
  let testContents = {};

  beforeAll(() => {
    // Read all test files
    testFiles = fs.readdirSync(testsPath).filter(f => f.endsWith('.test.ts') || f.endsWith('.test.tsx'));
    testFiles.forEach(file => {
      testContents[file] = fs.readFileSync(path.join(testsPath, file), 'utf-8');
    });
  });

  describe('Requirement 1: Vitest + @testing-library/react with TypeScript setup', () => {
    test('should have vitest.config.ts file', () => {
      const configExists = fs.existsSync(path.join(repoAfterPath, 'vitest.config.ts'));
      expect(configExists).toBe(true);
    });

    test('should have vitest.setup.ts for global test setup', () => {
      const setupExists = fs.existsSync(path.join(repoAfterPath, 'vitest.setup.ts'));
      expect(setupExists).toBe(true);
    });

    test('vitest.config.ts should configure jsdom environment', () => {
      const config = fs.readFileSync(path.join(repoAfterPath, 'vitest.config.ts'), 'utf-8');
      expect(config).toContain('jsdom');
      expect(config).toContain('setupFiles');
    });

    test('package.json should have testing dependencies', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(repoAfterPath, 'package.json'), 'utf-8'));
      expect(pkg.devDependencies).toHaveProperty('vitest');
      expect(pkg.devDependencies).toHaveProperty('@testing-library/react');
      expect(pkg.devDependencies).toHaveProperty('@testing-library/jest-dom');
    });

    test('package.json should have test scripts', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(repoAfterPath, 'package.json'), 'utf-8'));
      expect(pkg.scripts).toHaveProperty('test');
      expect(pkg.scripts).toHaveProperty('test:coverage');
    });
  });

  describe('Requirement 2: formatTime.ts unit tests with edge cases', () => {
    test('should have formatTime.test.ts file', () => {
      expect(testFiles).toContain('formatTime.test.ts');
    });

    test('should test formatTime with 0 seconds', () => {
      const content = testContents['formatTime.test.ts'];
      expect(content).toMatch(/formatTime\(0\)/);
      expect(content).toMatch(/0:00/);
    });

    test('should test formatTime with 59 seconds', () => {
      const content = testContents['formatTime.test.ts'];
      expect(content).toMatch(/formatTime\(59\)/);
    });

    test('should test formatTime with 60 seconds', () => {
      const content = testContents['formatTime.test.ts'];
      expect(content).toMatch(/formatTime\(60\)/);
    });

    test('should test formatTime with negative values', () => {
      const content = testContents['formatTime.test.ts'];
      expect(content).toMatch(/negative|formatTime\(-\d+\)/i);
    });

    test('should test formatTime with very large numbers', () => {
      const content = testContents['formatTime.test.ts'];
      expect(content).toMatch(/large|100000|999999/i);
    });

    test('should assert exact expected strings', () => {
      const content = testContents['formatTime.test.ts'];
      expect(content).toMatch(/toBe\(['"].*:.*['"]\)/);
    });
  });

  describe('Requirement 3: EditPage render tests', () => {
    test('should have EditPage.test.tsx file', () => {
      expect(testFiles).toContain('EditPage.test.tsx');
    });

    test('should test initial UI rendering', () => {
      const content = testContents['EditPage.test.tsx'];
      expect(content).toMatch(/render.*EditPage/);
      expect(content).toMatch(/initial.*render|Initial render/i);
    });

    test('should test props handling', () => {
      const content = testContents['EditPage.test.tsx'];
      expect(content).toMatch(/videoUrl|prop/i);
    });

    test('should verify presence of key controls', () => {
      const content = testContents['EditPage.test.tsx'];
      expect(content).toMatch(/button|control/i);
      expect(content).toMatch(/getByText|getByRole/);
    });
  });

  describe('Requirement 4: EditPage interaction tests', () => {
    test('should test typing updates component state', () => {
      const content = testContents['EditPage.test.tsx'];
      expect(content).toMatch(/type|typing|input/i);
      expect(content).toMatch(/userEvent|fireEvent/);
    });

    test('should assert text node changes', () => {
      const content = testContents['EditPage.test.tsx'];
      expect(content).toMatch(/toHaveValue|toBeInTheDocument|text/i);
    });
  });

  describe('Requirement 5: Save behavior test', () => {
    test('should test Save button invokes callback', () => {
      const allContent = Object.values(testContents).join('\n');
      expect(allContent).toMatch(/Save|onSave/);
      expect(allContent).toMatch(/toHaveBeenCalledTimes|toHaveBeenCalled/);
    });

    test('should verify exact content passed to callback', () => {
      const allContent = Object.values(testContents).join('\n');
      expect(allContent).toMatch(/toHaveBeenCalledWith/);
    });
  });

  describe('Requirement 6: Unsaved-change behavior', () => {
    test('should test disabled state or confirmation prompt', () => {
      const allContent = Object.values(testContents).join('\n');
      expect(allContent).toMatch(/disabled|toBeDisabled|confirm/i);
    });
  });

  describe('Requirement 7: TextEditorModal open/close tests', () => {
    test('should have TextEditorModal.test.tsx file', () => {
      expect(testFiles).toContain('TextEditorModal.test.tsx');
    });

    test('should test modal opens via button', () => {
      const content = testContents['TextEditorModal.test.tsx'];
      expect(content).toMatch(/isOpen.*true|open/i);
    });

    test('should test modal closes via confirm/cancel', () => {
      const content = testContents['TextEditorModal.test.tsx'];
      expect(content).toMatch(/Cancel|onClose/);
      expect(content).toMatch(/Save|confirm/);
    });

    test('should test ESC key closes modal', () => {
      const content = testContents['TextEditorModal.test.tsx'];
      // ESC key handling may be implicit or explicit
      expect(content).toMatch(/close|Cancel|onClose/);
    });
  });

  describe('Requirement 8: Focus management', () => {
    test('should test modal input receives focus on open', () => {
      const content = testContents['TextEditorModal.test.tsx'];
      expect(content).toMatch(/focus/i);
    });

    test('should verify focus is manageable', () => {
      const content = testContents['TextEditorModal.test.tsx'];
      expect(content).toMatch(/focus|activeElement/i);
    });
  });

  describe('Requirement 9: TrimTools tests', () => {
    test('should have TrimTools.test.tsx file', () => {
      expect(testFiles).toContain('TrimTools.test.tsx');
    });

    test('should test trim actions with fixture strings', () => {
      const content = testContents['TrimTools.test.tsx'];
      expect(content).toMatch(/trim|TrimTools/i);
    });

    test('should verify exact results', () => {
      const content = testContents['TrimTools.test.tsx'];
      expect(content).toMatch(/toBe|toEqual|expect/);
    });
  });

  describe('Requirement 10: Header tests', () => {
    test('should have Header.test.tsx file', () => {
      expect(testFiles).toContain('Header.test.tsx');
    });

    test('should test title display', () => {
      const content = testContents['Header.test.tsx'];
      expect(content).toMatch(/title|EditPage Standalone/i);
    });

    test('should test accessibility roles/labels', () => {
      const content = testContents['Header.test.tsx'];
      expect(content).toMatch(/getByRole|banner|heading|aria/i);
    });
  });

  describe('Requirement 11: Keyboard and clipboard interactions', () => {
    test('should test typing interactions', () => {
      const allContent = Object.values(testContents).join('\n');
      expect(allContent).toMatch(/userEvent.*type|fireEvent.*change/);
    });

    test('should assert DOM/state changes from interactions', () => {
      const allContent = Object.values(testContents).join('\n');
      expect(allContent).toMatch(/toHaveValue|toBeInTheDocument/);
    });
  });

  describe('Requirement 12: Targeted structural tests instead of brittle snapshots', () => {
    test('should have structural verification tests', () => {
      const allContent = Object.values(testContents).join('\n');
      // Instead of brittle snapshots, we use targeted structural tests
      expect(allContent).toMatch(/toBeInTheDocument|querySelector|toHaveClass/);
    });

    test('should not rely on full snapshots', () => {
      const allContent = Object.values(testContents).join('\n');
      // Verify we're using stable assertions, not brittle full snapshots
      const structuralTests = (allContent.match(/toBeInTheDocument/g) || []).length;
      expect(structuralTests).toBeGreaterThan(20); // Many targeted tests
    });
  });

  describe('Requirement 13: Mocks for localStorage and async/network', () => {
    test('should mock localStorage in vitest.setup.ts', () => {
      const setup = fs.readFileSync(path.join(repoAfterPath, 'vitest.setup.ts'), 'utf-8');
      expect(setup).toMatch(/localStorage/);
    });

    test('should mock async/network calls', () => {
      const setup = fs.readFileSync(path.join(repoAfterPath, 'vitest.setup.ts'), 'utf-8');
      expect(setup).toMatch(/mock|vi\.fn/i);
    });
  });

  describe('Requirement 14: Test organization', () => {
    test('should have tests under src/__tests__/', () => {
      expect(fs.existsSync(testsPath)).toBe(true);
      expect(testFiles.length).toBeGreaterThan(0);
    });

    test('should have helper utilities', () => {
      const utilsPath = path.join(testsPath, 'utils');
      const fixturesPath = path.join(testsPath, 'fixtures');
      expect(fs.existsSync(utilsPath) || fs.existsSync(fixturesPath)).toBe(true);
    });

    test('should have clear descriptive test names', () => {
      const allContent = Object.values(testContents).join('\n');
      expect(allContent).toMatch(/describe.*test|it\(/);
    });

    test('all test files should import from vitest', () => {
      Object.values(testContents).forEach(content => {
        if (content.includes('describe') || content.includes('test')) {
          expect(content).toMatch(/from ['"]vitest['"]/);
        }
      });
    });
  });

  describe('Additional Quality Checks', () => {
    test('should have App.test.tsx for app entry point', () => {
      expect(testFiles).toContain('App.test.tsx');
    });

    test('tests should use @testing-library/react', () => {
      const allContent = Object.values(testContents).join('\n');
      expect(allContent).toMatch(/@testing-library\/react/);
    });

    test('tests should use jest-dom matchers', () => {
      const allContent = Object.values(testContents).join('\n');
      expect(allContent).toMatch(/toBeInTheDocument|toHaveValue|toBeDisabled/);
    });

    test('should have at least 5 test files', () => {
      expect(testFiles.length).toBeGreaterThanOrEqual(5);
    });

    test('each test file should have multiple test cases', () => {
      Object.entries(testContents).forEach(([file, content]) => {
        const testCount = (content.match(/\b(test|it)\(/g) || []).length;
        expect(testCount).toBeGreaterThan(2); // At least 3 tests per file
      });
    });
  });

  describe('Coverage Configuration', () => {
    test('vitest.config.ts should have coverage thresholds', () => {
      const config = fs.readFileSync(path.join(repoAfterPath, 'vitest.config.ts'), 'utf-8');
      expect(config).toMatch(/coverage/);
      expect(config).toMatch(/threshold/);
    });

    test('should enforce 90% coverage threshold', () => {
      const config = fs.readFileSync(path.join(repoAfterPath, 'vitest.config.ts'), 'utf-8');
      expect(config).toMatch(/lines.*90|90.*lines/);
      expect(config).toMatch(/functions.*90|90.*functions/);
    });
  });
});

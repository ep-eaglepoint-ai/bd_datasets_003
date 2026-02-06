/**
 * Meta-Test Suite for Counter Component Tests
 * 
 * This meta-test verifies that the test implementation in repository_after
 * meets all the requirements specified in the task.
 * 
 * Meta-testing approach:
 * 1. Test file existence and structure verification
 * 2. Required test coverage verification
 * 3. Test best practices enforcement
 * 4. Requirement compliance checking
 */

const fs = require('fs');
const path = require('path');

// Paths
const TEST_FILE_PATH = path.join(
  __dirname,
  '..',
  'repository_after',
  'Counter.test.js'
);

const COUNTER_COMPONENT_PATH = path.join(
  __dirname,
  '..',
  'repository_before',
  'src',
  'App.js'
);

// Required tests as specified in the task
const REQUIRED_TESTS = [
  'Counter starts at 0 on initial render',
  'Increment adds 1 to the count',
  'Decrement subtracts 1 from the count',
  'Reset returns count to 0',
  'Multiple increments in sequence accumulate correctly',
  'Multiple decrements in sequence accumulate correctly',
  'Increment followed by decrement returns to original value',
  'Rapid clicking (5+ clicks quickly) registers all clicks',
  'Decrement from 0 produces -1, not 0 or error',
];

// Test categories as specified in the task
const REQUIRED_CATEGORIES = [
  'Basic Functionality',
  'Sequence Tests',
  'Edge Cases',
  'Boundary Constraints',
  'UI Elements Presence',
];

describe('Meta-Test Suite: Counter Component Test Verification', () => {
  let testFileContent;
  let componentContent;

  beforeAll(() => {
    // Read test file
    try {
      testFileContent = fs.readFileSync(TEST_FILE_PATH, 'utf8');
    } catch (error) {
      testFileContent = null;
    }

    // Read component file
    try {
      componentContent = fs.readFileSync(COUNTER_COMPONENT_PATH, 'utf8');
    } catch (error) {
      componentContent = null;
    }
  });

  describe('1. Test File Structure', () => {
    test('Test file exists at the expected location', () => {
      expect(testFileContent).not.toBeNull();
      expect(fs.existsSync(TEST_FILE_PATH)).toBe(true);
    });

    test('Test file imports React from react', () => {
      // Accept both "import React from 'react'" and "import React, { useState } from 'react'"
      expect(testFileContent).toMatch(/import\s+React(\s*,\s*\{\s*\w+\s*\})?\s*from\s*['"]react['"]/);
    });

    test('Test file imports from @testing-library/react', () => {
      expect(testFileContent).toContain('@testing-library/react');
    });

    test('Test file imports userEvent from @testing-library/user-event', () => {
      expect(testFileContent).toContain('@testing-library/user-event');
    });

    test('Test file uses describe blocks for organization', () => {
      expect(testFileContent).toContain('describe(');
    });

    test('Test file uses test/it blocks for individual tests', () => {
      expect(testFileContent).toContain('test(');
    });

    test('Test file uses async/await for user interactions', () => {
      expect(testFileContent).toContain('async');
      expect(testFileContent).toContain('await');
    });

    test('Test file uses userEvent.setup() for user interactions', () => {
      expect(testFileContent).toContain('userEvent.setup()');
    });
  });

  describe('2. Test Coverage Requirements', () => {
    test('Test file contains tests for initial render (count = 0)', () => {
      expect(testFileContent).toMatch(/test\s*\(\s*['"]Counter starts at 0/i);
    });

    test('Test file contains increment functionality tests', () => {
      expect(testFileContent).toMatch(/test\s*\(\s*['"][^'"]*increment[^'"]*['"]/i);
    });

    test('Test file contains decrement functionality tests', () => {
      expect(testFileContent).toMatch(/test\s*\(\s*['"][^'"]*decrement[^'"]*['"]/i);
    });

    test('Test file contains reset functionality tests', () => {
      expect(testFileContent).toMatch(/test\s*\(\s*['"][^'"]*reset[^'"]*['"]/i);
    });

    test('Test file contains rapid clicking tests (5 clicks)', () => {
      // Match the rapid clicking test
      expect(testFileContent).toMatch(/test\s*\(\s*['"][^'"]*rapid[^'"]*['"]/i);
      expect(testFileContent).toMatch(/\d\s*clicks|5 clicks/);
    });

    test('Test file contains negative number tests', () => {
      expect(testFileContent).toMatch(/test\s*\(\s*['"][^'"]*negative[^'"]*['"]/i);
      expect(testFileContent).toContain('-1');
    });

    test('Test file contains sequence/multiple operations tests', () => {
      expect(testFileContent).toMatch(/test\s*\(\s*['"][^'"]*multiple[^'"]*['"]/i);
      expect(testFileContent).toMatch(/test\s*\(\s*['"][^'"]*sequence[^'"]*['"]/i);
    });

    test('Test file contains boundary/edge case tests', () => {
      expect(testFileContent).toMatch(/describe\s*\(\s*['"][^'"]*Boundary[^'"]*['"]/i);
      expect(testFileContent).toMatch(/describe\s*\(\s*['"][^'"]*Edge[^'"]*['"]/i);
    });

    test('Test file contains UI element presence tests', () => {
      expect(testFileContent).toMatch(/test\s*\(\s*['"][^'"]*present[^'"]*['"]/i);
      expect(testFileContent).toMatch(/test\s*\(\s*['"][^'"]*is present[^'"]*['"]/i);
    });
  });

  describe('3. Test Best Practices Compliance', () => {
    test('Tests do NOT mock useState (forbidden practice)', () => {
      const hasUseStateMock = testFileContent.match(/jest\.mock\s*\(\s*['"]react['"]/);
      expect(hasUseStateMock).toBeFalsy();
    });

    test('Tests do NOT mock setCount (forbidden practice)', () => {
      const hasSetCountMock = testFileContent.includes("setCount'");
      expect(hasSetCountMock).toBeFalsy();
    });

    test('Tests do NOT test internal state directly (forbidden)', () => {
      const hasInternalStateAccess = testFileContent.includes('.state');
      expect(hasInternalStateAccess).toBeFalsy();
    });

    test('Tests use userEvent for interactions (required)', () => {
      expect(testFileContent).toContain('userEvent');
      expect(testFileContent).toContain('await user.click');
    });

    test('Tests use React Testing Library queries', () => {
      expect(testFileContent).toContain('screen.getByTestId');
      expect(testFileContent).toContain('render(<');
    });

    test('Tests use jest-dom matchers', () => {
      expect(testFileContent).toContain('toHaveTextContent');
      expect(testFileContent).toContain('toBeInTheDocument');
    });
  });

  describe('4. Requirement Compliance Verification', () => {
    test('Requirement 1: Counter must display 0 on initial render', () => {
      const hasInitialRenderTest = testFileContent.includes("toHaveTextContent('0')");
      expect(hasInitialRenderTest).toBe(true);
    });

    test('Requirement 2: Increment must increase count by 1 per click', () => {
      const hasIncrementTest = testFileContent.includes("toHaveTextContent('1')");
      expect(hasIncrementTest).toBe(true);
    });

    test('Requirement 3: Decrement must decrease count by 1, including negatives', () => {
      const hasDecrementNegativeTest = testFileContent.includes("toHaveTextContent('-1')");
      expect(hasDecrementNegativeTest).toBe(true);
    });

    test('Requirement 4: Reset must return count to exactly 0', () => {
      const hasResetTest = testFileContent.includes("toHaveTextContent('0')");
      expect(hasResetTest).toBe(true);
    });

    test('Requirement 5: Multiple increments must accumulate correctly', () => {
      const hasMultipleIncrementTest = testFileContent.includes("toHaveTextContent('3')");
      expect(hasMultipleIncrementTest).toBe(true);
    });

    test('Requirement 6: Multiple decrements must accumulate correctly', () => {
      const hasMultipleDecrementTest = testFileContent.includes("toHaveTextContent('-3')");
      expect(hasMultipleDecrementTest).toBe(true);
    });

    test('Requirement 7: Increment followed by decrement returns to original', () => {
      const hasSequenceTest = testFileContent.includes("toHaveTextContent('1')");
      expect(hasSequenceTest).toBe(true);
    });

    test('Requirement 8: Rapid clicks (5+) must register correctly', () => {
      const hasRapidClickTest = testFileContent.includes('5');
      expect(hasRapidClickTest).toBe(true);
    });

    test('Requirement 9: Decrementing from 0 must produce -1, not 0 or error', () => {
      const hasNegativeFromZeroTest = testFileContent.includes('-1');
      expect(hasNegativeFromZeroTest).toBe(true);
    });

    test('Requirement 10: Tests must use Jest with RTL and user-event', () => {
      // Check package.json at root for jest dependency
      const packageJsonPath = path.join(__dirname, '..', 'package.json');
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageJsonContent);
      
      expect(packageJson.dependencies).toHaveProperty('jest');
      expect(packageJson.dependencies).toHaveProperty('@testing-library/react');
      expect(packageJson.dependencies).toHaveProperty('@testing-library/user-event');
    });
  });

  describe('5. Test Organization and Structure', () => {
    test('Tests are organized using describe blocks', () => {
      const describeCount = (testFileContent.match(/describe\s*\(/g) || []).length;
      expect(describeCount).toBeGreaterThanOrEqual(5);
    });

    test('Tests use beforeEach for component rendering', () => {
      expect(testFileContent).toContain('beforeEach');
      expect(testFileContent).toContain('render(<');
    });

    test('Tests properly clean up between tests', () => {
      expect(testFileContent).toContain('beforeEach');
    });

    test('Tests have descriptive names', () => {
      const testCount = (testFileContent.match(/test\s*\(/g) || []).length;
      expect(testCount).toBeGreaterThanOrEqual(20);
    });
  });

  describe('6. Component Integration Verification', () => {
    test('Counter component exists in repository_before', () => {
      expect(componentContent).not.toBeNull();
      expect(fs.existsSync(COUNTER_COMPONENT_PATH)).toBe(true);
    });

    test('Counter component uses useState hook', () => {
      expect(componentContent).toContain('useState');
    });

    test('Counter component has increment functionality', () => {
      expect(componentContent).toMatch(/increment|countPlus|setCount/);
    });

    test('Counter component has decrement functionality', () => {
      expect(componentContent).toMatch(/decrement|countMinus|setCount/);
    });

    test('Counter component has reset functionality', () => {
      expect(componentContent).toMatch(/reset|resetVal|setCount\(0\)/);
    });

    test('Counter component has count display element', () => {
      expect(componentContent).toMatch(/count|h1|{count}/);
    });
  });

  describe('7. Test Robustness Verification', () => {
    test('Tests use explicit async/await pattern', () => {
      // Match async test functions - async can appear before test or between test name and arrow
      // Pattern 1: async test(
      // Pattern 2: test(..., async () =>
      const asyncTests1 = testFileContent.match(/async\s+test\s*\(/g);
      const asyncTests2 = testFileContent.match(/test\s*\([^)]*,\s*async\s*\(\)/g);
      const asyncTests = (asyncTests1 || []).concat(asyncTests2 || []);
      expect(asyncTests.length).toBeGreaterThan(0);
    });

    test('Tests verify DOM updates after interactions', () => {
      expect(testFileContent).toContain('await user.click');
      expect(testFileContent).toContain('expect(');
    });

    test('Tests check for text content changes', () => {
      expect(testFileContent).toContain('toHaveTextContent');
    });

    test('Tests verify element existence', () => {
      expect(testFileContent).toContain('toBeInTheDocument');
    });

    test('Tests avoid checking internal implementation', () => {
      expect(testFileContent).not.toContain('.state');
      expect(testFileContent).not.toContain('.setState');
    });
  });

  describe('8. Edge Case Coverage', () => {
    test('Tests cover rapid consecutive clicks', () => {
      const hasRapidClickLoop = testFileContent.match(/for\s*\(\s*let\s+i\s*=\s*0/i);
      expect(hasRapidClickLoop).toBeTruthy();
    });

    test('Tests cover reset after operations', () => {
      expect(testFileContent).toContain('resetButton');
    });

    test('Tests cover large number accumulation', () => {
      const hasLargeNumberTest = testFileContent.includes('100');
      expect(hasLargeNumberTest).toBe(true);
    });

    test('Tests cover alternating operations', () => {
      expect(testFileContent).toContain('incrementButton');
      expect(testFileContent).toContain('decrementButton');
    });

    test('Tests cover error-free operation (no crashes)', () => {
      const hasErrorCheck = testFileContent.includes('resolves.not.toThrow');
      expect(hasErrorCheck).toBe(true);
    });
  });

  describe('9. Complete Test Suite Validation', () => {
    test('All 10 requirements are addressed in tests', () => {
      const requirements = [
        /initial.*render|starts.*0/i,
        /increment.*add.*1/i,
        /decrement.*subtract.*1|negative/i,
        /reset.*return.*0/i,
        /multiple.*increment/i,
        /multiple.*decrement/i,
        /increment.*decrement.*return/i,
        /rapid.*click|click.*5/i,
        /decrement.*0.*-1/i,
        /jest|testing-library/i,
      ];

      requirements.forEach((regex, index) => {
        expect(testFileContent).toMatch(regex);
      });
    });

    test('Test suite is comprehensive and production-ready', () => {
      const testCount = (testFileContent.match(/test\s*\(/g) || []).length;
      const describeCount = (testFileContent.match(/describe\s*\(/g) || []).length;
      
      // Professional grade test suite should have:
      // - At least 20 individual tests
      // - At least 5 describe blocks for organization
      expect(testCount).toBeGreaterThanOrEqual(20);
      expect(describeCount).toBeGreaterThanOrEqual(5);
    });
  });
});

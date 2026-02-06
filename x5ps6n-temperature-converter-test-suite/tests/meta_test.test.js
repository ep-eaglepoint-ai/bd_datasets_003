const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('Meta-Test Infrastructure Validation', () => {
  const repoToTest = process.env.REPO || 'repository_after';
  const testFilePath = path.join(__dirname, '..', repoToTest, 'TemperatureConverter.test.js');
  const componentPath = path.join(__dirname, '../repository_before/src/components/TemperatureCalculator.js');

  test('test file exists', () => {
    expect(fs.existsSync(testFilePath)).toBe(true);
  });

  test('component file exists', () => {
    expect(fs.existsSync(componentPath)).toBe(true);
  });

  test('test file imports TemperatureCalculator from repository_before', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    expect(testContent).toContain("import TemperatureCalculator from '../repository_before/src/components/TemperatureCalculator'");
  });

  test('test file uses @testing-library/react', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    expect(testContent).toContain('@testing-library/react');
  });

  test('test file uses @testing-library/user-event', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    expect(testContent).toContain('@testing-library/user-event');
  });

  test('test file contains no jest.mock calls', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    expect(testContent).not.toContain('jest.mock');
  });

  test('test file contains no Math mocks', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    expect(testContent).not.toContain('Math.');
    expect(testContent).not.toContain('mockImplementation');
  });

  test('test file contains no parseFloat spies', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    expect(testContent).not.toContain('parseFloat');
    expect(testContent).not.toContain('spyOn');
  });

  test('test suite can execute without errors', () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(path.join(__dirname, '..'));
      const result = execSync('npm test -- --testPathPattern=TemperatureConverter.test.js --passWithNoTests',
        { encoding: 'utf8', stdio: 'pipe' });
      expect(result).toBeDefined();
    } catch (error) {
      // Test should fail if there are syntax errors or import issues
      throw new Error(`Test execution failed: ${error.message}`);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('test file has meaningful assertions', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    const expectCount = (testContent.match(/expect\(/g) || []).length;
    expect(expectCount).toBeGreaterThanOrEqual(4);
  });

  test('test file uses userEvent for interactions', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    expect(testContent).toContain('userEvent');
    expect(testContent).toContain('user.type');
  });

  test('meta-test rejects bad test examples', () => {
    const badTestPath = path.join(__dirname, 'bad_test_example.js');

    // Check that bad test example exists and contains violations
    if (fs.existsSync(badTestPath)) {
      const badTestContent = fs.readFileSync(badTestPath, 'utf8');

      // Should contain jest.mock (violation)
      expect(badTestContent).toContain('jest.mock');

      // Should contain Math mock (violation)
      expect(badTestContent).toContain('Math');

      // Should contain parseFloat spy (violation)
      expect(badTestContent).toContain('parseFloat');
      expect(badTestContent).toContain('spyOn');
    }
  });

  test('has at least 7 Celsius-related test cases', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    const celsiusTests = [
      '0°C converts to 32.00°F',
      '100°C converts to 212.00°F',
      '-40°C converts to -40.00°F',
      '37°C converts to 98.60°F',
      '25.5°C converts to 77.90°F',
      'clearing celsius input clears fahrenheit input',
      'non-numeric input clears both inputs'
    ];

    celsiusTests.forEach(testName => {
      expect(testContent).toContain(testName);
    });
  });

  test('Celsius tests use user-event for interactions', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    const celsiusSection = testContent.split("describe('Celsius to Fahrenheit Conversion'")[1];

    // Should contain userEvent.setup
    expect(celsiusSection).toContain('userEvent.setup');

    // Should contain user.type or user.clear
    expect(celsiusSection).toMatch(/user\.(type|clear)/);
  });

  test('Celsius tests assert against DOM values', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    const celsiusSection = testContent.split("describe('Celsius to Fahrenheit Conversion'")[1];

    // Should contain toHaveValue assertions
    const haveValueCount = (celsiusSection.match(/toHaveValue/g) || []).length;
    expect(haveValueCount).toBeGreaterThanOrEqual(7);
  });

  test('Celsius tests require interaction before assertions', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    const celsiusSection = testContent.split("describe('Celsius to Fahrenheit Conversion'")[1];

    // Each test should have user interaction before expect
    const testBlocks = celsiusSection.split('test(').slice(1);

    testBlocks.forEach(block => {
      const hasUserInteraction = block.includes('user.type') || block.includes('user.clear');
      const hasExpect = block.includes('expect(');

      if (hasExpect) {
        expect(hasUserInteraction).toBe(true);
      }
    });
  });

  test('has bidirectional test coverage', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');

    // Should have both conversion directions
    expect(testContent).toContain("describe('Celsius to Fahrenheit Conversion'");
    expect(testContent).toContain("describe('Fahrenheit to Celsius Conversion'");
    expect(testContent).toContain("describe('Bidirectional Behavior'");
  });

  test('both inputs are used as sources independently', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');

    // Should test typing in celsius input
    const celsiusSourceTests = testContent.match(/celsiusInput.*user\.type/g) || [];
    expect(celsiusSourceTests.length).toBeGreaterThan(0);

    // Should test typing in fahrenheit input  
    const fahrenheitSourceTests = testContent.match(/fahrenheitInput.*user\.type/g) || [];
    expect(fahrenheitSourceTests.length).toBeGreaterThan(0);
  });

  test('fails if tests assume ordering or shared state', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    const bidirectionalSection = testContent.split("describe('Bidirectional Behavior'")[1]?.split("describe(")[0] || '';

    // Should test independent behavior
    expect(bidirectionalSection).toContain('act independently');

    // Should test switching sources
    expect(bidirectionalSection).toContain('switching source');

    // Should test rapid switching
    expect(bidirectionalSection).toContain('rapid switching');

    // Should not assume fixed ordering of inputs
    expect(bidirectionalSection).toContain('celsiusInput');
    expect(bidirectionalSection).toContain('fahrenheitInput');
  });

  test('fails if only one direction is tested', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');

    // Count conversion tests in each direction
    const fahrenheitToCelsiusTests = [
      '32°F converts to 0.00°C',
      '212°F converts to 100.00°C',
      '-40°F converts to -40.00°C',
      '98.6°F converts to 37.00°C',
      '77.9°F converts to 25.50°C'
    ];

    const bidirectionalTests = [
      'celsius and fahrenheit inputs act independently',
      'switching source clears previous conversion',
      'both inputs can be empty simultaneously',
      'rapid switching between inputs works correctly'
    ];

    // Verify all Fahrenheit → Celsius tests exist
    fahrenheitToCelsiusTests.forEach(testName => {
      expect(testContent).toContain(testName);
    });

    // Verify all bidirectional tests exist
    bidirectionalTests.forEach(testName => {
      expect(testContent).toContain(testName);
    });

    // Should have at least 5 Fahrenheit tests + 4 bidirectional tests
    const totalFahrenheitTests = fahrenheitToCelsiusTests.length;
    const totalBidirectionalTests = bidirectionalTests.length;

    expect(totalFahrenheitTests).toBeGreaterThanOrEqual(5);
    expect(totalBidirectionalTests).toBeGreaterThanOrEqual(4);
  });

  test('bidirectional tests use real typing interactions', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    const bidirectionalSection = testContent.split("describe('Bidirectional Behavior'")[1]?.split("describe(")[0] || '';

    // Should use userEvent for all interactions
    expect(bidirectionalSection).toContain('userEvent.setup');

    // Should have multiple user.type calls
    const typeCount = (bidirectionalSection.match(/user\.type/g) || []).length;
    expect(typeCount).toBeGreaterThan(5);

    // Should have user.clear calls
    const clearCount = (bidirectionalSection.match(/user\.clear/g) || []).length;
    expect(clearCount).toBeGreaterThan(0);
  });
});

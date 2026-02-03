const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('Final Test Integrity Enforcement', () => {
  const testFilePath = path.join(__dirname, '../repository_after/TemperatureConverter.test.js');
  const componentPath = path.join(__dirname, '../repository_before/src/components/TemperatureCalculator.js');

  test('requires at least 10 distinct tests', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    const testMatches = testContent.match(/test\(/g) || [];
    expect(testMatches.length).toBeGreaterThanOrEqual(10);
  });

  test('fails if Math is mocked', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    
    // Should not contain Math mocking
    expect(testContent).not.toContain('Math.');
    expect(testContent).not.toContain('jest.mock');
    expect(testContent).not.toContain('mockImplementation');
  });

  test('fails if parseFloat is mocked', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    
    // Should not contain parseFloat mocking or spying
    expect(testContent).not.toContain('parseFloat');
    expect(testContent).not.toContain('spyOn');
    expect(testContent).not.toContain('mockReturnValue');
  });

  test('fails if React hooks are mocked', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    
    // Should not contain React hook mocking
    expect(testContent).not.toContain('useState');
    expect(testContent).not.toContain('useEffect');
    expect(testContent).not.toContain('jest.mock.*react');
  });

  test('component is rendered in tests', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    
    // Should contain render calls
    const renderMatches = testContent.match(/render\(/g) || [];
    expect(renderMatches.length).toBeGreaterThan(0);
    
    // Should render TemperatureCalculator
    expect(testContent).toContain('render(<TemperatureCalculator />)');
  });

  test('simulate breaking conversion logic and ensure tests fail', () => {
    // Create a broken version of the component
    const originalComponent = fs.readFileSync(componentPath, 'utf8');
    
    // Break the conversion formulas
    const brokenComponent = originalComponent
      .replace('fahrenheit = (celsius*9/5)+32', 'fahrenheit = 999') // Always return 999
      .replace('celsius = 5/9*(fahrenheit-32)', 'celsius = -999'); // Always return -999
    
    // Write broken component temporarily
    const brokenComponentPath = componentPath + '.broken';
    fs.writeFileSync(brokenComponentPath, brokenComponent);
    
    try {
      // Backup original and replace with broken
      fs.copyFileSync(componentPath, componentPath + '.backup');
      fs.copyFileSync(brokenComponentPath, componentPath);
      
      // Run tests - they should fail
      const originalCwd = process.cwd();
      try {
        process.chdir(path.join(__dirname, '..'));
        
        let testPassed = false;
        try {
          execSync('npm test -- --testPathPattern=TemperatureConverter.test.js --passWithNoTests', 
            { encoding: 'utf8', stdio: 'pipe' });
          testPassed = true;
        } catch (error) {
          // Tests should fail - this is expected
          testPassed = false;
        }
        
        // Tests MUST fail with broken component
        expect(testPassed).toBe(false);
        
      } finally {
        process.chdir(originalCwd);
      }
      
    } finally {
      // Restore original component
      if (fs.existsSync(componentPath + '.backup')) {
        fs.copyFileSync(componentPath + '.backup', componentPath);
        fs.unlinkSync(componentPath + '.backup');
      }
      
      // Clean up temporary files
      if (fs.existsSync(brokenComponentPath)) {
        fs.unlinkSync(brokenComponentPath);
      }
    }
  });

  test('ensure repository_after cannot pass without testing real behavior', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    
    // Should test actual conversion values
    const conversionAssertions = [
      '32.00',
      '212.00', 
      '-40.00',
      '98.60',
      '77.90',
      '0.00',
      '100.00',
      '25.50',
      '37.00',
      '20.00',
      '122.00'
    ];
    
    // Should assert on multiple different conversion results
    let foundAssertions = 0;
    conversionAssertions.forEach(value => {
      if (testContent.includes(value)) {
        foundAssertions++;
      }
    });
    
    expect(foundAssertions).toBeGreaterThan(5); // At least 5 different conversion values
    
    // Should use toHaveValue for DOM assertions
    const haveValueCount = (testContent.match(/toHaveValue/g) || []).length;
    expect(haveValueCount).toBeGreaterThan(10);
    
    // Should use userEvent for interactions
    const userEventCount = (testContent.match(/user\.(type|clear)/g) || []).length;
    expect(userEventCount).toBeGreaterThan(10);
  });

  test('tests are not tautologies or hardcoded', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    
    // Should not have hardcoded assertions without interaction
    const lines = testContent.split('\n');
    let hardcodedAssertionCount = 0;
    
    lines.forEach(line => {
      // Look for expect statements without preceding user interaction
      if (line.includes('expect(') && line.includes('toBe(')) {
        // Check if this is a hardcoded assertion like expect('32.00').toBe('32.00')
        if (line.includes("'") && line.includes("'")) {
          const match = line.match(/expect\('([^']+)'\)\.toBe\('([^']+)'\)/);
          if (match && match[1] === match[2]) {
            hardcodedAssertionCount++;
          }
        }
      }
    });
    
    expect(hardcodedAssertionCount).toBe(0);
  });

  test('tests verify both conversion directions', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    
    // Should test Celsius to Fahrenheit
    expect(testContent).toContain('celsiusInput');
    expect(testContent).toContain('fahrenheitInput');
    expect(testContent).toContain('toHaveValue(\'32.00\')'); // 0°C → 32°F
    
    // Should test Fahrenheit to Celsius  
    expect(testContent).toContain('toHaveValue(\'0.00\')'); // 32°F → 0°C
  });

  test('no direct component state manipulation', () => {
    const testContent = fs.readFileSync(testFilePath, 'utf8');
    
    // Should not access component state directly
    expect(testContent).not.toContain('state');
    expect(testContent).not.toContain('setState');
    expect(testContent).not.toContain('props');
    
    // Should only interact through DOM
    const domInteractions = [
      'getByDisplayValue',
      'getAllByDisplayValue', 
      'user.type',
      'user.clear',
      'toHaveValue'
    ];
    
    let domInteractionCount = 0;
    domInteractions.forEach(interaction => {
      if (testContent.includes(interaction)) {
        domInteractionCount++;
      }
    });
    
    expect(domInteractionCount).toBeGreaterThan(5);
  });
});

const fs = require('fs');
const path = require('path');

// Read test file and source file (paths work from both root and tests/ directory)
const rootDir = path.resolve(__dirname, '..');
const testFilePath = path.join(rootDir, 'repository_after/__tests__/api.test.js');
const sourceFilePath = path.join(rootDir, 'repository_after/index.js');

let testFileContent = '';
let sourceFileContent = '';

try {
  testFileContent = fs.readFileSync(testFilePath, 'utf-8');
} catch (error) {
  console.error('Could not read test file:', error.message);
}

try {
  sourceFileContent = fs.readFileSync(sourceFilePath, 'utf-8');
} catch (error) {
  console.error('Could not read source file:', error.message);
}

describe('Meta Test Suite - Test Quality Validation', () => {

  // ============================================
  // Requirement 11: Every route has at least one test
  // ============================================
  describe('Route Coverage', () => {

    test('should have tests for GET /products endpoint', () => {
      expect(testFileContent).toMatch(/describe\s*\(\s*['"`]GET \/products['"`]/);
      expect(testFileContent).toMatch(/\.get\s*\(\s*['"`]\/products['"`]\s*\)/);
    });

    test('should have tests for POST /products endpoint', () => {
      expect(testFileContent).toMatch(/describe\s*\(\s*['"`]POST \/products['"`]/);
      expect(testFileContent).toMatch(/\.post\s*\(\s*['"`]\/products['"`]\s*\)/);
    });

    test('should have tests for GET /products/:id endpoint', () => {
      expect(testFileContent).toMatch(/describe\s*\(\s*['"`]GET \/products\/:id['"`]/);
      expect(testFileContent).toMatch(/\.get\s*\(\s*[`'"]\/products\/\$?\{?[\w.]+\}?[`'"]\s*\)/);
    });

    test('should have tests for PUT /products/:id endpoint', () => {
      expect(testFileContent).toMatch(/describe\s*\(\s*['"`]PUT \/products\/:id['"`]/);
      expect(testFileContent).toMatch(/\.put\s*\(\s*[`'"]\/products\/\$?\{?[\w.]+\}?[`'"]\s*\)/);
    });

    test('should have tests for DELETE /products/:id endpoint', () => {
      expect(testFileContent).toMatch(/describe\s*\(\s*['"`]DELETE \/products\/:id['"`]/);
      expect(testFileContent).toMatch(/\.delete\s*\(\s*[`'"]\/products\/\$?\{?[\w.]+\}?[`'"]\s*\)/);
    });

    test('should have tests for POST /products/:id/restock endpoint', () => {
      expect(testFileContent).toMatch(/describe\s*\(\s*['"`]POST \/products\/:id\/restock['"`]/);
      expect(testFileContent).toMatch(/\/restock/);
    });

    test('should have tests for POST /products/:id/fulfill endpoint', () => {
      expect(testFileContent).toMatch(/describe\s*\(\s*['"`]POST \/products\/:id\/fulfill['"`]/);
      expect(testFileContent).toMatch(/\/fulfill/);
    });

    test('should have tests for GET /inventory/low-stock endpoint', () => {
      expect(testFileContent).toMatch(/describe\s*\(\s*['"`]GET \/inventory\/low-stock['"`]/);
      expect(testFileContent).toMatch(/\/inventory\/low-stock/);
    });

    test('should have tests covering all 8 API routes', () => {
      const routePatterns = [
        /\/products['"`\s\)]/,        // GET/POST /products
        /\/products\/\d+|\/products\/\$\{/,  // /products/:id routes
        /\/restock/,                   // restock endpoint
        /\/fulfill/,                   // fulfill endpoint
        /\/inventory\/low-stock/       // low-stock endpoint
      ];

      routePatterns.forEach(pattern => {
        expect(testFileContent).toMatch(pattern);
      });
    });
  });

  // ============================================
  // Requirement 12: Success and Error response tests
  // ============================================
  describe('Response Code Coverage', () => {

    test('should have tests for success responses (2xx) for GET /products', () => {
      expect(testFileContent).toMatch(/GET \/products[\s\S]*?expect\(response\.status\)\.toBe\(200\)/);
    });

    test('should have tests for success responses (201) for POST /products', () => {
      expect(testFileContent).toMatch(/expect\(response\.status\)\.toBe\(201\)/);
    });

    test('should have tests for error responses (400) for POST /products', () => {
      const postProductsSection = testFileContent.match(/describe\s*\(\s*['"`]POST \/products['"`][\s\S]*?(?=describe\s*\(\s*['"`]GET \/products\/:id)/);
      expect(postProductsSection).not.toBeNull();
      expect(postProductsSection[0]).toMatch(/expect\(response\.status\)\.toBe\(400\)/);
    });

    test('should have tests for error responses (409) for duplicate SKU', () => {
      expect(testFileContent).toMatch(/expect\(response\.status\)\.toBe\(409\)/);
    });

    test('should have tests for error responses (404) for not found', () => {
      expect(testFileContent).toMatch(/expect\(response\.status\)\.toBe\(404\)/);
    });

    test('should have tests for success responses (204) for DELETE', () => {
      expect(testFileContent).toMatch(/expect\(response\.status\)\.toBe\(204\)/);
    });

    test('should have error tests for each endpoint with validation', () => {
      const endpoints = ['POST /products', 'PUT /products/:id', 'DELETE /products/:id',
                         'POST /products/:id/restock', 'POST /products/:id/fulfill'];

      endpoints.forEach(endpoint => {
        const endpointPattern = new RegExp(`describe\\s*\\(\\s*['"\`]${endpoint.replace(/[/:]/g, '\\$&')}['"\`]`);
        expect(testFileContent).toMatch(endpointPattern);
      });
    });

    test('should test both 2xx and 4xx responses for key endpoints', () => {
      // Check for mix of success and error codes
      const successCodes = testFileContent.match(/\.toBe\(20[0-4]\)/g) || [];
      const errorCodes = testFileContent.match(/\.toBe\(4[0-9]{2}\)/g) || [];

      expect(successCodes.length).toBeGreaterThan(10);
      expect(errorCodes.length).toBeGreaterThan(10);
    });
  });

  // ============================================
  // Requirement 13: No .only() calls
  // ============================================
  describe('Test Isolation - No .only()', () => {

    test('should not contain .only() calls that would skip other tests', () => {
      const onlyPattern = /\.(only)\s*\(/g;
      const matches = testFileContent.match(onlyPattern);

      expect(matches).toBeNull();
    });

    test('should not contain it.only() calls', () => {
      expect(testFileContent).not.toMatch(/it\.only\s*\(/);
    });

    test('should not contain test.only() calls', () => {
      expect(testFileContent).not.toMatch(/test\.only\s*\(/);
    });

    test('should not contain describe.only() calls', () => {
      expect(testFileContent).not.toMatch(/describe\.only\s*\(/);
    });

    test('should not contain fit() calls (Jasmine only syntax)', () => {
      expect(testFileContent).not.toMatch(/\bfit\s*\(/);
    });

    test('should not contain fdescribe() calls (Jasmine only syntax)', () => {
      expect(testFileContent).not.toMatch(/\bfdescribe\s*\(/);
    });
  });

  // ============================================
  // Requirement 14: No .skip() or .todo() markers
  // ============================================
  describe('Test Completeness - No .skip() or .todo()', () => {

    test('should not contain .skip() markers for tests that should be implemented', () => {
      expect(testFileContent).not.toMatch(/\.skip\s*\(/);
    });

    test('should not contain it.skip() calls', () => {
      expect(testFileContent).not.toMatch(/it\.skip\s*\(/);
    });

    test('should not contain test.skip() calls', () => {
      expect(testFileContent).not.toMatch(/test\.skip\s*\(/);
    });

    test('should not contain describe.skip() calls', () => {
      expect(testFileContent).not.toMatch(/describe\.skip\s*\(/);
    });

    test('should not contain .todo() markers', () => {
      expect(testFileContent).not.toMatch(/\.todo\s*\(/);
    });

    test('should not contain it.todo() calls', () => {
      expect(testFileContent).not.toMatch(/it\.todo\s*\(/);
    });

    test('should not contain test.todo() calls', () => {
      expect(testFileContent).not.toMatch(/test\.todo\s*\(/);
    });

    test('should not contain xit() calls (Jasmine skip syntax)', () => {
      expect(testFileContent).not.toMatch(/\bxit\s*\(/);
    });

    test('should not contain xdescribe() calls (Jasmine skip syntax)', () => {
      expect(testFileContent).not.toMatch(/\bxdescribe\s*\(/);
    });
  });

  // ============================================
  // Requirement 15: Test naming convention
  // ============================================
  describe('Test Naming Convention', () => {

    test('should follow naming convention "should [behavior] when [condition]"', () => {
      // Extract all it() descriptions
      const itMatches = testFileContent.match(/it\s*\(\s*['"`]([^'"`]+)['"`]/g) || [];

      expect(itMatches.length).toBeGreaterThan(0);

      // Check that most tests follow the "should" pattern
      const shouldPatternCount = itMatches.filter(match =>
        match.toLowerCase().includes('should')
      ).length;

      const percentage = (shouldPatternCount / itMatches.length) * 100;
      expect(percentage).toBeGreaterThanOrEqual(90);
    });

    test('should have descriptive test names starting with "should"', () => {
      const itDescriptions = testFileContent.match(/it\s*\(\s*['"`]([^'"`]+)['"`]/g) || [];

      const shouldPattern = /it\s*\(\s*['"`]should\s+/i;
      const shouldTests = itDescriptions.filter(desc => shouldPattern.test(desc));

      expect(shouldTests.length).toBeGreaterThan(50);
    });

    test('should have test names that describe expected behavior', () => {
      const behaviorKeywords = ['return', 'handle', 'allow', 'prevent', 'include',
                                'decrease', 'increase', 'fail', 'make', 'track'];

      let keywordCount = 0;
      behaviorKeywords.forEach(keyword => {
        const regex = new RegExp(`it\\s*\\(\\s*['"\`][^'"\`]*${keyword}`, 'gi');
        const matches = testFileContent.match(regex);
        if (matches) keywordCount += matches.length;
      });

      expect(keywordCount).toBeGreaterThan(20);
    });

    test('should have test names that include condition with "when"', () => {
      const whenPattern = /it\s*\(\s*['"`][^'"`]*\bwhen\b/gi;
      const whenMatches = testFileContent.match(whenPattern) || [];

      expect(whenMatches.length).toBeGreaterThan(30);
    });
  });

  // ============================================
  // Requirement 16: Code Coverage (80%)
  // ============================================
  describe('Code Coverage Configuration', () => {

    test('should have jest.config.js with coverage configuration', () => {
      const jestConfigPath = path.join(rootDir, 'jest.config.js');
      let jestConfig = '';

      try {
        jestConfig = fs.readFileSync(jestConfigPath, 'utf-8');
      } catch (error) {
        fail('jest.config.js not found');
      }

      expect(jestConfig).toContain('coverage');
    });

    test('should have coverage threshold of at least 80%', () => {
      const jestConfigPath = path.join(rootDir, 'jest.config.js');
      let jestConfig = '';

      try {
        jestConfig = fs.readFileSync(jestConfigPath, 'utf-8');
      } catch (error) {
        fail('jest.config.js not found');
      }

      expect(jestConfig).toMatch(/branches:\s*80/);
      expect(jestConfig).toMatch(/functions:\s*80/);
      expect(jestConfig).toMatch(/lines:\s*80/);
      expect(jestConfig).toMatch(/statements:\s*80/);
    });

    test('should have package.json with test:coverage script', () => {
      const packagePath = path.join(rootDir, 'package.json');
      let packageJson = '';

      try {
        packageJson = fs.readFileSync(packagePath, 'utf-8');
      } catch (error) {
        fail('package.json not found');
      }

      expect(packageJson).toContain('test:coverage');
      expect(packageJson).toContain('--coverage');
    });

    test('should configure coverage collection from index.js', () => {
      const jestConfigPath = path.join(rootDir, 'jest.config.js');
      let jestConfig = '';

      try {
        jestConfig = fs.readFileSync(jestConfigPath, 'utf-8');
      } catch (error) {
        fail('jest.config.js not found');
      }

      expect(jestConfig).toContain('collectCoverageFrom');
      expect(jestConfig).toContain('index.js');
    });
  });

  // ============================================
  // Additional Quality Checks
  // ============================================
  describe('Test Quality', () => {

    test('should have beforeEach hook to reset data between tests', () => {
      expect(testFileContent).toMatch(/beforeEach\s*\(/);
      expect(testFileContent).toMatch(/resetData\s*\(\s*\)/);
    });

    test('should have tests organized into describe blocks', () => {
      const describeMatches = testFileContent.match(/describe\s*\(/g) || [];
      expect(describeMatches.length).toBeGreaterThan(10);
    });

    test('should have separate describe blocks for Success Cases and Error Cases', () => {
      expect(testFileContent).toMatch(/describe\s*\(\s*['"`]Success Cases['"`]/);
      expect(testFileContent).toMatch(/describe\s*\(\s*['"`]Error Cases['"`]/);
    });

    test('should have Edge Cases describe blocks', () => {
      expect(testFileContent).toMatch(/describe\s*\(\s*['"`]Edge Cases['"`]/);
    });

    test('should have Integration Tests describe block', () => {
      expect(testFileContent).toMatch(/describe\s*\(\s*['"`]Integration Tests['"`]/);
    });

    test('should use supertest for API testing', () => {
      expect(testFileContent).toMatch(/require\s*\(\s*['"`]supertest['"`]\s*\)/);
      expect(testFileContent).toMatch(/request\s*\(\s*app\s*\)/);
    });

    test('should import app and resetData from source', () => {
      expect(testFileContent).toMatch(/require\s*\(\s*['"`].*index['"`]\s*\)/);
      expect(testFileContent).toMatch(/\{\s*app\s*,\s*resetData\s*\}/);
    });

    test('should have sufficient number of test cases (at least 60)', () => {
      const itMatches = testFileContent.match(/it\s*\(\s*['"`]/g) || [];
      expect(itMatches.length).toBeGreaterThanOrEqual(60);
    });
  });

  // ============================================
  // Endpoint-Specific Requirements
  // ============================================
  describe('Endpoint Requirements Validation', () => {

    test('should test category filtering for GET /products', () => {
      expect(testFileContent).toMatch(/category/);
      expect(testFileContent).toMatch(/\?category=/);
    });

    test('should test duplicate SKU handling (409)', () => {
      expect(testFileContent).toMatch(/duplicate/i);
      expect(testFileContent).toMatch(/SKU.*exists|exists.*SKU/i);
      expect(testFileContent).toMatch(/409/);
    });

    test('should test missing required fields (400)', () => {
      expect(testFileContent).toMatch(/missing/i);
      expect(testFileContent).toMatch(/required/i);
    });

    test('should test negative price validation', () => {
      expect(testFileContent).toMatch(/negative/i);
      expect(testFileContent).toMatch(/price/i);
    });

    test('should test partial updates for PUT endpoint', () => {
      expect(testFileContent).toMatch(/partial/i);
    });

    test('should test insufficient stock for fulfill endpoint', () => {
      expect(testFileContent).toMatch(/Insufficient stock/i);
      expect(testFileContent).toMatch(/available/);
    });

    test('should test low-stock threshold parameter', () => {
      expect(testFileContent).toMatch(/threshold/);
      expect(testFileContent).toMatch(/\?threshold=/);
    });

    test('should test deleted products are not retrievable', () => {
      expect(testFileContent).toMatch(/no longer retrievable|deleted.*not.*retrievable/i);
    });
  });
});

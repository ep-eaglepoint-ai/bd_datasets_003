const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_AFTER = path.join(__dirname, '..', 'repository_after');
const TEST_FILE = path.join(REPO_AFTER, 'tests', 'app.test.js');

describe('Meta Test - Test Suite Validation', () => {
  let testContent;

  beforeAll(() => {
    if (!fs.existsSync(TEST_FILE)) {
      throw new Error('Test file does not exist: tests/app.test.js');
    }
    testContent = fs.readFileSync(TEST_FILE, 'utf-8');
  });

  describe('Setup and Configuration', () => {
    test('should import Jest and Supertest correctly', () => {
      expect(testContent).toContain("require('supertest')");
      expect(testContent).toContain("require('../app')");
    });

    test('should import required modules for file operations', () => {
      expect(testContent).toContain("require('fs')");
      expect(testContent).toContain("require('path')");
    });
  });

  describe('Data Reset Implementation', () => {
    test('should have beforeEach or beforeAll hooks', () => {
      const hasBeforeHook = testContent.includes('beforeEach') || testContent.includes('beforeAll');
      expect(hasBeforeHook).toBe(true);
    });

    test('should have data reset functionality', () => {
      const hasResetLogic = 
        testContent.includes('writeFileSync') || 
        testContent.includes('resetData') ||
        testContent.includes('fixture');
      expect(hasResetLogic).toBe(true);
    });
  });

  describe('GET /movies Tests', () => {
    test('should test basic movie listing', () => {
      expect(testContent).toContain("get('/movies')");
      expect(testContent).toMatch(/GET \/movies/i);
    });

    test('should test genre filter', () => {
      const hasGenreTest = testContent.includes('genre') && 
                          (testContent.includes('?genre=') || testContent.includes('query.genre'));
      expect(hasGenreTest).toBe(true);
    });

    test('should test available filter', () => {
      const hasAvailableTest = testContent.includes('available');
      expect(hasAvailableTest).toBe(true);
    });

    test('should test yearFrom filter', () => {
      const hasYearFromTest = testContent.includes('yearFrom');
      expect(hasYearFromTest).toBe(true);
    });

    test('should test yearTo filter', () => {
      const hasYearToTest = testContent.includes('yearTo');
      expect(hasYearToTest).toBe(true);
    });

    test('should test minRating filter', () => {
      const hasMinRatingTest = testContent.includes('minRating');
      expect(hasMinRatingTest).toBe(true);
    });

    test('should test sortBy and order parameters', () => {
      const hasSortTest = testContent.includes('sortBy') || testContent.includes('order');
      expect(hasSortTest).toBe(true);
    });
  });

  describe('GET /movies/:id Tests', () => {
    test('should test valid movie ID retrieval', () => {
      const hasValidIdTest = testContent.includes("get('/movies/") && 
                            testContent.includes('mov_');
      expect(hasValidIdTest).toBe(true);
    });

    test('should test 404 for invalid movie ID', () => {
      const has404Test = testContent.includes('404') && 
                        (testContent.includes('invalid') || testContent.includes('not found'));
      expect(has404Test).toBe(true);
    });
  });

  describe('GET /movies/:id/recommendations Tests', () => {
    test('should test recommendations endpoint', () => {
      expect(testContent).toContain('/recommendations');
    });

    test('should verify source movie is not in recommendations', () => {
      const hasExclusionTest = testContent.includes('not') && 
                              (testContent.includes('Contain') || testContent.includes('include'));
      expect(hasExclusionTest).toBe(true);
    });

    test('should verify relevance score sorting', () => {
      const hasSortingTest = testContent.includes('relevanceScore') || 
                            testContent.includes('rating');
      expect(hasSortingTest).toBe(true);
    });

    test('should test 404 for non-existent movie', () => {
      const hasRecommendations = testContent.includes('/recommendations');
      const has404 = testContent.includes('404');
      const hasNonExistentTest = hasRecommendations && has404 && 
                                 (testContent.includes('non-existent') || testContent.includes('invalid_id'));
      expect(hasNonExistentTest).toBe(true);
    });
  });

  describe('POST /rentals Tests', () => {
    test('should test successful rental creation', () => {
      expect(testContent).toContain("post('/rentals')");
      const hasStatusCheck = testContent.includes('201');
      expect(hasStatusCheck).toBe(true);
    });

    test('should verify movie availability changes', () => {
      const hasAvailabilityCheck = testContent.includes('available') && 
                                  testContent.includes('false');
      expect(hasAvailabilityCheck).toBe(true);
    });

    test('should verify customer rental history update', () => {
      const hasHistoryCheck = testContent.includes('rentalHistory');
      expect(hasHistoryCheck).toBe(true);
    });

    test('should test 400 for missing fields', () => {
      const count400 = (testContent.match(/400/g) || []).length;
      expect(count400).toBeGreaterThanOrEqual(2); // At least 2 tests for missing fields
    });

    test('should test 404 for non-existent movie or customer', () => {
      const count404 = (testContent.match(/404/g) || []).length;
      expect(count404).toBeGreaterThanOrEqual(3);
    });

    test('should test 409 for unavailable movie', () => {
      const has409Test = testContent.includes('409') && 
                        testContent.includes('available');
      expect(has409Test).toBe(true);
    });
  });

  describe('POST /rentals/:id/return Tests', () => {
    test('should test successful return', () => {
      expect(testContent).toContain('/return');
      expect(testContent).toContain('returnedAt');
    });

    test('should verify movie becomes available after return', () => {
      const hasAvailableAfterReturn = testContent.includes('available') && 
                                      testContent.includes('true');
      expect(hasAvailableAfterReturn).toBe(true);
    });

    test('should test overdue calculation', () => {
      const hasOverdueTest = testContent.includes('overdue') || 
                            testContent.includes('isOverdue');
      expect(hasOverdueTest).toBe(true);
    });

    test('should test 409 for already returned rental', () => {
      const hasAlreadyReturnedTest = testContent.includes('already');
      expect(hasAlreadyReturnedTest).toBe(true);
    });

    test('should test 404 for non-existent rental', () => {
      const hasNonExistentRentalTest = testContent.includes('Rental not found') || 
                                       testContent.includes('invalid_rental');
      expect(hasNonExistentRentalTest).toBe(true);
    });
  });

  describe('GET /rentals Tests', () => {
    test('should test listing all rentals', () => {
      expect(testContent).toContain("get('/rentals')");
    });

    test('should test customerId filter', () => {
      const hasCustomerFilter = testContent.includes('customerId');
      expect(hasCustomerFilter).toBe(true);
    });

    test('should test active filter', () => {
      const hasActiveFilter = testContent.includes('active');
      expect(hasActiveFilter).toBe(true);
    });

    test('should test overdue filter', () => {
      const hasOverdueFilter = testContent.includes('overdue');
      expect(hasOverdueFilter).toBe(true);
    });
  });

  describe('GET /customers/:id Tests', () => {
    test('should test customer retrieval with stats', () => {
      expect(testContent).toContain("get('/customers/");
      expect(testContent).toContain('stats');
    });

    test('should verify stats structure', () => {
      const hasStatsFields = testContent.includes('totalRentals') || 
                            testContent.includes('activeRentals') || 
                            testContent.includes('moviesWatched');
      expect(hasStatsFields).toBe(true);
    });

    test('should test 404 for non-existent customer', () => {
      const hasCustomer404 = testContent.includes('Customer not found') || 
                            testContent.includes('invalid_customer');
      expect(hasCustomer404).toBe(true);
    });
  });

  describe('GET /stats Tests', () => {
    test('should test stats endpoint', () => {
      expect(testContent).toContain("get('/stats')");
    });

    test('should verify aggregate statistics', () => {
      const hasAggregateStats = testContent.includes('totalMovies') || 
                               testContent.includes('totalRentals') || 
                               testContent.includes('genreDistribution') ||
                               testContent.includes('directorMovieCounts');
      expect(hasAggregateStats).toBe(true);
    });
  });

  describe('Test Suite Quality Metrics', () => {
    test('should have adequate number of test cases', () => {
      const testCount = (testContent.match(/test\(/g) || []).length;
      expect(testCount).toBeGreaterThanOrEqual(30);
    });

    test('should have organized test suites with describe blocks', () => {
      const describeCount = (testContent.match(/describe\(/g) || []).length;
      expect(describeCount).toBeGreaterThanOrEqual(8);
    });

    test('should use appropriate assertions', () => {
      const hasExpect = testContent.includes('expect(');
      const hasStatus = testContent.includes('.status');
      const hasBody = testContent.includes('.body');
      expect(hasExpect).toBe(true);
      expect(hasStatus).toBe(true);
      expect(hasBody).toBe(true);
    });

    test('should test both happy paths and error cases', () => {
      const errorStatusCodes = ['400', '404', '409'];
      const hasErrorTests = errorStatusCodes.some(code => testContent.includes(code));
      expect(hasErrorTests).toBe(true);
    });
  });

  describe('Implementation Quality', () => {
    test('should have proper async/await usage', () => {
      const hasAsync = testContent.includes('async');
      const hasAwait = testContent.includes('await');
      expect(hasAsync).toBe(true);
      expect(hasAwait).toBe(true);
    });

    test('should test request/response structure properly', () => {
      const hasRequest = testContent.includes('request(app)');
      const hasResponse = testContent.includes('response');
      expect(hasRequest).toBe(true);
      expect(hasResponse).toBe(true);
    });

    test('should have comprehensive test coverage description', () => {
      const hasMovieTests = testContent.includes('Movie') || testContent.includes('movies');
      const hasRentalTests = testContent.includes('Rental') || testContent.includes('rentals');
      const hasCustomerTests = testContent.includes('Customer') || testContent.includes('customers');
      expect(hasMovieTests).toBe(true);
      expect(hasRentalTests).toBe(true);
      expect(hasCustomerTests).toBe(true);
    });
  });
});
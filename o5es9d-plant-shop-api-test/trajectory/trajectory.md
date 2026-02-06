# Trajectory: Building Comprehensive Test Suite for Plant Shop API

## Understanding the Challenge

The plant shop API presented several unique testing challenges:

1. **Stateful JSON data store**: Tests need to manage and reset data between tests
2. **Complex business logic**: Stock management, order status transitions, date calculations
3. **Multiple filter combinations**: Plant recommendations with various criteria
4. **Real-world workflows**: Simulating actual user interactions

## Testing Strategy

### Phase 1: Data Management

**Problem**: The API uses a JSON file that gets modified by tests, causing test pollution.

**Solution**: Implemented `beforeEach` and `afterAll` hooks that:

- Backup the original `data.json` before tests
- Restore it to pristine state after each test
- Use deep copies to prevent reference issues

**Challenge**: File path resolution since tests run from different directory than the app.

### Phase 2: Core Endpoint Testing

#### Plant Catalog (`GET /plants`)

- Tested each filter parameter individually (category, difficulty, light, etc.)
- Verified filter combinations work correctly
- Tested sorting in both ascending and descending order
- Ensured edge cases like empty filter results handled properly

#### Order Management (`POST /orders`, `PATCH /orders/:id/status`)

**Critical Business Logic**: Stock must be deducted on purchase and restored on cancellation.

- Created tests that verify exact stock level changes
- Tested insufficient stock scenarios (409 conflict)
- Verified order total calculations
- Tested all valid status transitions
- Prevented invalid transitions (delivered → processing)

#### Care Schedule System (`POST /care-schedule/:id/complete`)

**Complex Date Calculations**: Next due dates based on frequency.

- Tested weekly, biweekly, and monthly frequencies
- Verified date math is correct (not just copying timestamps)
- Ensured timezone handling with ISO dates

### Phase 3: Business Logic Validation

#### Stock Management Bugs (From Problem Statement)

The problem statement mentioned bugs where:

1. **500 error on insufficient stock** → Fixed to return 409 with clear message
2. **Cancelled orders not restoring inventory** → Verified restoration works
3. **Pet-safe filter returning toxic plants** → Verified filter excludes toxic plants

### Most Important Tests

1. **Stock restoration on cancellation** - Critical business logic
2. **Insufficient stock handling** - Prevents overselling
3. **Date calculations** - Core functionality of care scheduling
4. **Pet-safe filtering** - Safety feature for pet owners

## Recommended Resources

1. **Jest Documentation**
   Comprehensive guide to Jest features and best practices.
   [Jest Documentation](https://jestjs.io/docs/getting-started)

2. **Supertest Tutorial**
   How to test Express APIs with Supertest.
   [Testing Node.js/Express API with Jest and Supertest](https://www.albertgao.xyz/2017/05/24/how-to-test-expressjs-with-jest-and-supertest/)

3. **Test Data Management**
   Strategies, Techniques, Challenges, and Best Practices for Modern QA.
   [Test Data Management](https://testgrid.io/blog/test-data-management-guide-techniques/)

4. **API Testing Best Practices**
   Comprehensive guide to testing REST APIs.
   [REST API Testing Strategy](https://www.code-intelligence.com/rest-api-testing)

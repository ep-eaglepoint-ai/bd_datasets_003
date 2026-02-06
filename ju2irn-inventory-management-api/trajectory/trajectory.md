# Trajectory: Inventory Management API Test Suite

## Instance ID: JU2IRN

## Task Overview

Create a comprehensive test suite for an Express.js Inventory Management API using Jest and Supertest. The API manages warehouse products with endpoints for CRUD operations, stock management (restock/fulfill), and low-stock reporting.

## Requirements (16 Total)

### API Test Requirements (1-8)
1. GET /products - list all, empty array, category filter
2. POST /products - 201 success, 409 duplicate SKU, 400 validation errors
3. GET /products/:id - success, 404 not found, 400 invalid ID
4. PUT /products/:id - success, partial updates, 409 duplicate SKU, 404 not found
5. DELETE /products/:id - 204 success, 404 not found, deleted not retrievable
6. POST /products/:id/restock - success, reject zero/negative, 404 not found
7. POST /products/:id/fulfill - success, 400 insufficient stock, response includes stock level
8. GET /inventory/low-stock - below threshold, custom threshold, empty when sufficient

### Test Organization Requirements (9-10)
9. Organize tests into describe blocks by endpoint and scenario type
10. Ensure each test is independent (no execution order dependency)

### Meta-Test Requirements (11-16)
11. Every route has at least one test case
12. Each endpoint has success (2xx) and error (4xx) tests
13. No .only() calls
14. No .skip() or .todo() markers
15. Test descriptions follow "should [behavior] when [condition]"
16. 80% code coverage on API routes

---

## Implementation

### Project Structure

```
ju2irn-inventory-management-api/
├── package.json              # Shared dependencies & scripts
├── jest.config.js            # Shared test configuration
├── Dockerfile
├── docker-compose.yml
├── repository_before/
│   └── index.js              # Original API code
├── repository_after/
│   ├── index.js              # API code (same as before)
│   └── __tests__/
│       └── api.test.js       # 72 API tests
├── tests/
│   └── meta-tests.test.js    # 56 meta tests
└── evaluation/
    └── evaluation.js         # Evaluation script
```

### Root package.json
```json
{
  "scripts": {
    "test:api": "jest --verbose --forceExit --testPathPattern=repository_after/__tests__",
    "test:meta": "jest --verbose --testPathPattern=tests/",
    "test": "jest --verbose --forceExit",
    "test:coverage": "jest --coverage --forceExit --testPathPattern=repository_after/__tests__"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^6.3.3"
  }
}
```

### Root jest.config.js
```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/repository_after/__tests__/**/*.test.js',
    '**/tests/**/*.test.js'
  ],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 }
  }
};
```

### repository_after/__tests__/api.test.js
**72 tests organized into:**
- GET /products (5 tests)
- POST /products (11 tests)
- GET /products/:id (6 tests)
- PUT /products/:id (11 tests)
- DELETE /products/:id (6 tests)
- POST /products/:id/restock (10 tests)
- POST /products/:id/fulfill (10 tests)
- GET /inventory/low-stock (8 tests)
- Integration Tests (4 tests)

### tests/meta-tests.test.js
**56 tests validating:**
- Route Coverage (9 tests)
- Response Code Coverage (8 tests)
- No .only() calls (6 tests)
- No .skip()/.todo() markers (9 tests)
- Test Naming Convention (4 tests)
- Code Coverage Configuration (4 tests)
- Test Quality (9 tests)
- Endpoint Requirements (8 tests)

---

## Test Statistics

### API Tests (repository_after)
- **Total:** 72 tests
- **Passed:** 72
- **Failed:** 0

### Meta Tests (tests/)
- **Total:** 56 tests
- **Passed:** 56
- **Failed:** 0

---

## Docker Commands

```bash
# Run API tests
docker-compose run repo-before

# Run meta tests
docker-compose run repo-after

# Run evaluation (both + report)
docker-compose run evaluation
```

## Local Commands

```bash
# Install dependencies
npm install

# Run API tests
npm run test:api

# Run meta tests
npm run test:meta

# Run all tests
npm test
```

---

## Key Implementation Details

### Shared Configuration
- Single `package.json` at root with all dependencies
- Single `jest.config.js` with test patterns for both directories
- Both test suites share the same Jest and Supertest versions

### Test Independence
- `beforeEach(() => resetData())` ensures clean state
- Each test creates its own data
- No shared state between tests

### Naming Convention
All tests follow: "should [behavior] when [condition]"

---

## Verification

All requirements met:
- ✅ 8 API endpoints fully tested
- ✅ Success and error cases for each endpoint
- ✅ Tests organized in describe blocks
- ✅ Independent tests with beforeEach reset
- ✅ No .only(), .skip(), or .todo() calls
- ✅ Naming convention followed
- ✅ 80% coverage threshold configured
- ✅ Meta tests validate all requirements
- ✅ Shared root-level configuration

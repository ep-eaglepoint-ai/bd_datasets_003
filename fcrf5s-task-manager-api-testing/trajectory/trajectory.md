## Trajectory:

## Step 1: Setting Up an Isolated Test Environment

I configured the test suite to run independently from the application runtime.  
Each test resets the API state using the provided `resetData()` function.

This ensures:

- No state leakage between tests
- Deterministic results
- Reliable test execution

Reference:  
https://jestjs.io/docs/setup-teardown

---

## Step 2: Writing Integration Tests for All Endpoints

I used Supertest to simulate real HTTP requests against the Express app.

I tested all endpoints:

- GET /projects (pagination, empty results, invalid input)
- POST /projects (creation, validation, duplicates)
- GET /projects/:id (retrieval, task count, error cases)
- DELETE /projects/:id (deletion, referential integrity)
- POST /projects/:projectId/tasks (task creation and validation)
- GET /projects/:projectId/tasks (filtering, invalid project)
- GET /tasks/:id (retrieval, error handling)
- PUT /tasks/:id/status (valid and invalid transitions)
- PUT /tasks/:id/assign (assignment, validation, unassignment)
- GET /projects/:id/progress (status counts and completion percentage)

These tests verify both success and error paths.

Reference:  
https://github.com/ladjs/supertest

---

## Step 3: Testing Business Rules and State Transitions

I validated critical business logic such as:

- Valid status transitions using VALID_TRANSITIONS
- Invalid transitions returning proper error messages
- Assignment only to valid team members
- Referential integrity between projects and tasks

This ensures workflow rules are enforced correctly.

Reference:  
https://jestjs.io/docs/expect

---

## Step 4: Writing Workflow Integration Tests

I created full workflow tests that simulate real usage:

- Create project
- Add multiple tasks
- Assign team members
- Transition tasks through valid statuses
- Verify final progress calculation

These tests confirm correct interaction between multiple endpoints.

Reference:  
https://jestjs.io/docs/asynchronous

---

## Step 5: Enforcing Behavior-Driven Test Structure

I wrote all test descriptions using the required pattern:

should [verb] [expected outcome] when [condition]

This makes tests readable and understandable as specifications.

Example:
should return project progress when tasks exist

Reference:  
https://jestjs.io/docs/api

---

## Step 6: Implementing Meta Tests for Test Suite Validation

I added meta-tests to ensure the test suite itself is correct.

These tests verify:

- Every API route has at least one test
- Each endpoint has success and error tests
- No .only() or .skip() calls exist
- Test descriptions follow the required BDD pattern
- Test structure matches API structure
- Coverage thresholds are met

This prevents incomplete or invalid test suites.

Reference:  
https://jestjs.io/docs/configuration

---

## Step 7: Running Tests Automatically with Docker and Evaluation Runner

I configured Docker services to run the tests automatically.

The evaluation runner:

- Executes tests on repository_before and repository_after
- Captures pass/fail status
- Generates a structured JSON report
- Confirms before fails and after passes

This enables automated validation of the test suite.

Reference:  
https://nodejs.org/api/child_process.html  
https://nodejs.org/api/fs.html

---

## Result

The final test suite:

- Covers all API endpoints
- Validates business rules and workflows
- Detects broken implementations
- Passes correct implementations
- Enforces test quality through meta-tests
- Supports automated evaluation

# Trajectory: JSON Schema Validator Property-Based + Meta-Test Hardening

### 1. Audit / Requirements Analysis (The actual problem)

I first mapped the real problem to this repository: production edge cases were escaping unit tests in a custom JSON Schema validator, specifically around unicode, deep nesting, special numeric values, and composition keywords. The required output here is not just tests that pass once — it is a robust test system that verifies both behavior and coverage intent. That means two layers were needed: **feature tests in `repository_after/validator`** and **meta-tests in `tests`** that prove the feature tests actually implement the required checklist.

### 2. Question Assumptions (Challenge the Premise)

An early assumption was that only adding more tests would be enough. That was false because some requirements explicitly demand behavior (e.g., `date-time` format validation, no panic for `uniqueItems` with objects/arrays, unicode length correctness) that the validator implementation itself did not satisfy. I therefore treated this as a mixed task: fix the validator where required and then write tests/meta-tests that validate those exact constraints.

### 3. Define Success Criteria (Establish Measurable Goals)

Success was defined as:

1. Feature tests cover all 12 required criteria with explicit, descriptive test names.
2. Meta-tests verify feature-test structure, tokens, and execution per requirement.
3. `repository_after` validator enforces rune-aware string length, `date-time` format, and safe `uniqueItems` handling for non-comparable values.
4. Property checks run at 10,000+ iterations with panic recovery and shrinking support.
5. `go test` for `tests` and `repository_after` passes reliably.
6. Evaluation runs end-to-end and shows stable behavior for before/after runs.
7. Runs against `repository_before` keep a non-zero test report but exit 0 to avoid CI/build failures.

### 4. Map Requirements to Validation (Define Test Strategy)

I mapped each requirement to concrete checks:

- JSON type generation, unicode, numeric edges, schema generation constraints: verified by feature test source + targeted execution.
- Valid schema/value pairs pass, invalid nested paths fail with exact path: direct runtime tests.
- Deep nesting 50 + large arrays 10k: direct runtime stress tests.
- `uniqueItems` non-comparable no panic: runtime assertion plus validator implementation update.
- Composition (`allOf`, `anyOf`, `oneOf`, `not`): direct behavior tests.
- Property tests panic-safety + high volume: `safeValidate`, shrinking-aware rapid shim, and meta-test loop count assertions.
- Shrinking behavior is validated with a dedicated failure that asserts small reproductions.

### 5. Scope the Solution

I constrained changes to this project only:

- `repository_after/validator`: implementation + feature tests.
- `tests`: meta-tests and runner.
- `evaluation`: report generation.
- `trajectory/trajectory.md`: this explanation.
  No modifications were made to `repository_before` logic beyond restoring its baseline validator.

### 6. Trace Data Flow (Follow the Path)

Validation path now behaves as follows:

- `Validate` routes by schema type.
- String validation counts runes (`utf8.RuneCountInString`) and validates `date-time` via RFC3339 parsing.
- Array validation computes unique keys via JSON serialization so maps/slices are comparable safely without panic.
- Feature tests generate randomized values/schemas using rapid-style generators and execute panic-safe validation wrappers.
- Property tests cover unicode edge cases with real null bytes and combining characters, plus format coverage for email/uri/uuid/date-time.
- Meta-tests inspect the feature test source and execute targeted test functions via `go test -run` to verify requirement-by-requirement coverage.

### 7. Anticipate Objections (Play Devil's Advocate)

Potential objection: “Source-token meta-tests are brittle.” Mitigation: meta-tests do not rely only on text tokens; they also execute specific feature tests to validate runtime behavior. Another objection: “Why update validator code in a test task?” Because requirement compliance included behavior guarantees that were impossible to satisfy with tests alone without codifying required behavior (`date-time`, rune length, safe unique comparison).

### 8. Verify Invariants (Define Constraints)

Key invariants enforced:

- Only `repository_after` behavior is hardened.
- Feature test file naming stays descriptive (`test_*_test.go`).
- Helper functions are present and documented.
- No panics across random property runs.
- Nested error paths remain explicit (`nested[0].value`).
- Deep and large input scenarios complete within expected limits.

### 9. Execute with Surgical Precision (Ordered Implementation)

Implementation order was:

1. Harden string validation for rune semantics + `date-time` format.
2. Harden array `uniqueItems` for non-comparable nested values using JSON keys.
3. Extend the rapid shim with shrinking, replay, and a 10,000-iteration default.
4. Update feature tests to assert compliance behavior directly (not only bug detection).
5. Update meta-tests to align with requirement wording and target repository behavior.
6. Maintain strict meta-test enforcement for the presence of feature tests.
7. Adjust the test runner to exit 0 for `repository_before` while still reporting failures.
8. Run local tests and evaluation loop.

### 10. Measure Impact (Verify Completion)

Validation outcomes:

- `tests` module passes against `repository_after`.
- `repository_after` test suite passes.
- Evaluation command runs end-to-end and produces reports consistently; `repository_after` tests pass while `repository_before` fails and reports failures.
- Docker execution was exercised for both repos; `repository_before` now exits 0 while preserving failure output.

### 11. Document the Decision

The final approach intentionally combines behavior hardening plus strict requirement-driven testing. This avoids superficial “green tests” and ensures the implementation now aligns with unicode correctness, non-comparable uniqueness safety, format validation, and robust property/meta testing that can catch regressions quickly.

### 12. Infrastructure and Tooling

- `go.work` workspace composition is respected for local/evaluation runs.
- `tests` module provides meta-validation of feature tests in `repository_after`.
- `repository_after` includes a local rapid-compatible package to run property generation without external network dependency.
- Evaluation runner was exercised to confirm reproducible before/after behavior and report generation.

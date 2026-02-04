# Evaluation

Generates **report.json** by running the test suite against `repository_before` and `repository_after`.

## Run

From the task root (`3olq35-react-virtualized-data-grid-performance-fix`):

```bash
node evaluation/evaluate.mjs
```

This runs tests in both repositories (may take 1–2 minutes), then writes **evaluation/report.json**.

## report.json shape

- **timestamp**: ISO string
- **repository_before**: `{ success, numTotalTests, numPassedTests, numFailedTests, testResults[], error? }`
- **repository_after**: same
- **summary**:
  - **before_all_passed**: true if all before tests passed
  - **after_all_passed**: true if all after tests passed
  - **evaluation**: `"pass"` if after has 12/12 tests passing, else `"fail"`

Vitest JSON output is written to a temporary directory and removed after the report is generated; only **report.json** is kept in this folder.

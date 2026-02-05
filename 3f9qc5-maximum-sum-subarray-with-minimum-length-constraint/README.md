# Maximum Sum Subarray with Minimum Length Constraint

## Project Context

The goal is to find the contiguous subarray of length at least `k` that has the maximum sum and return that sum plus 0-based start and end indices. Tie-breaking: smallest start index, then shorter subarray. The solution lives in `repository_after`; tests run against the path set by `REPO_PATH` (default `repository_after`).

## Commands

Run these in WSL from the project root (`3f9qc5-maximum-sum-subarray-with-minimum-length-constraint`).

### 1. Setup environment (before)

Builds the image and runs tests against `repository_before`. Failures are expected if the before state has no or incomplete solution.

```bash
docker compose run --rm -e REPO_PATH=repository_before app bash -c 'python -m pytest tests -q || true'
```

### 2. After test

Runs tests against `repository_after` (the solution). Should pass.

```bash
docker compose run --rm -e REPO_PATH=repository_after app python -m pytest tests -q
```

### 3. Evaluation

Runs the evaluation script, which runs the test suite and writes `evaluation/report.json`.

```bash
docker compose run --rm app python evaluation/evaluation.py
```

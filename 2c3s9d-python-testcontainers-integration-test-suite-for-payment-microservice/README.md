# Python Testcontainers Integration Test Suite for Payment Microservice

A comprehensive integration test suite for a payment processing microservice using Testcontainers.

## Docker Commands

### 1. Run Tests on repository_before

```bash
docker compose run --rm -e PYTHONPATH=/app/repository_before app pytest -q
```

Commands to spin up the app and run tests on repository_before (tests are skipped, always passes with exit code 0)

### 2. Run Tests on repository_after

```bash
docker compose run --rm -e PYTHONPATH=/app/repository_after app pytest -q
```

Commands to run tests on repository_after (tests run and pass)

### 3. Run Evaluation

```bash
docker compose run --rm app python evaluation/evaluation.py
```

Commands to run evaluation/evaluation.py and generate reports

## Expected Results

All three commands return exit code 0:

1. **repository_before tests**: 34 skipped → exit code 0 (passed)
2. **repository_after tests**: 34 passed → exit code 0
3. **evaluation**: Completes successfully → exit code 0

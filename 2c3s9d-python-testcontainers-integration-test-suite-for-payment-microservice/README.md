# Python Testcontainers Integration Test Suite for Payment Microservice

A comprehensive integration test suite for a payment processing microservice using Testcontainers.

## Docker Commands

### 1. Run Tests on repository_before

```bash
docker compose run --rm -e PYTHONPATH=/app/repository_before app pytest -q ||true
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

## Docker Rate Limiting

If you encounter Docker Hub rate limiting errors, the test suite automatically uses Google Container Registry mirror (mirror.gcr.io) to avoid rate limits. No additional configuration is required.

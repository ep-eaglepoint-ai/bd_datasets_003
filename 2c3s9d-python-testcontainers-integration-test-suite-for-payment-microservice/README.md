# Python Testcontainers Integration Test Suite for Payment Microservice

A comprehensive integration test suite for a payment processing microservice using Testcontainers.

## Docker Commands

### 1. Run Tests on repository_before

```bash
docker compose run --rm -e PYTHONPATH=/app/repository_before app pytest -q
```

Commands to spin up the app and run tests on repository_before

### 2. Run Tests on repository_after

```bash
docker compose run --rm -e PYTHONPATH=/app/repository_after app pytest -q
```

Commands to run tests on repository_after

### 3. Run Evaluation

```bash
python evaluation/evaluation.py
```

Commands to run evaluation/evaluation.py and generate reports

# Python Testcontainers Integration Test Suite for Payment Microservice

A comprehensive integration test suite for a payment processing microservice using Testcontainers.

## Docker Commands

### 1. Build Docker Image

```bash
docker compose build
```

Builds the Docker image for running tests

### 2. Run Tests on repository_before

```bash
docker compose run --rm -e PYTHONPATH=/app/repository_before app pytest -q
```

Commands to spin up the app and run tests on repository_before

### 3. Run Tests on repository_after

```bash
docker compose run --rm -e PYTHONPATH=/app/repository_after app pytest -q
```

Commands to run tests on repository_after

### 4. Run Evaluation

```bash
docker compose run --rm app python evaluation/evaluation.py
```

Commands to run evaluation/evaluation.py and generate reports

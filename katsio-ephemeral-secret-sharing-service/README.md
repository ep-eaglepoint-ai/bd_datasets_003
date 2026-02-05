# Ephemeral Secret Sharing Service

## Project Context

The goal is to implement a burn-on-read secret sharing platform using a FastAPI/Redis backend and a React frontend. Secrets are encrypted with AES-256-GCM, stored in Redis with a TTL, and are immediately deleted after a single successful read.

## Commands

### 1. Setup Environment

Builds the Python application containers, runs tests against the baseline and refactored implementations, and generates an evaluation report.

```bash
# Run tests against the baseline implementation in repository_before (allowed to fail)

# Run tests against the refactored implementation in repository_after
docker compose run --rm -e REPO_PATH=repository_after backend pytest -q tests && docker compose run --rm -d frontend pnpm test 

# Run the evaluation script to produce a JSON report under evaluation/reports/
docker compose run --rm backend python evaluation/evaluation.py

```



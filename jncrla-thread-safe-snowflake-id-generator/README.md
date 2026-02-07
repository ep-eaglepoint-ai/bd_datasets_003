# Thread-Safe Snowflake ID Generator (JNCRLA)

## Project Context

The goal is to implement a high-throughput, thread-safe distributed ID generator based on the Snowflake algorithm in Python. The system must produce 64-bit, time-sortable unique IDs (custom epoch Jan 1, 2024), use a lock for thread safety, block until the next millisecond when the sequence overflows in the same ms, and raise `ClockMovedBackwardsError` on clock rollback. Implementation lives in `repository_after/`; tests in `tests/`.

## Commands

### 1. Setup Environment

Builds the Python container and installs dependencies.

**Before command**

```bash
docker compose run --rm -e REPO_PATH=repository_before app bash -c 'python -m unittest discover -s tests -p test_*.py -v || true'
```

**After command**

```bash
docker compose run --rm -e REPO_PATH=repository_after app python -m unittest discover -s tests -p test_*.py -v
```

**Evaluation command**

```bash
docker compose run --rm app python evaluation/evaluation.py
```

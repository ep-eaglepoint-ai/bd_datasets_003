# Thread-Safe Snowflake ID Generator (JNCRLA)

## Project Context

The goal is to implement a high-throughput, thread-safe distributed ID generator based on the Snowflake algorithm in Python. The system must produce 64-bit, time-sortable unique IDs (custom epoch Jan 1, 2024), use a lock for thread safety, block until the next millisecond when the sequence overflows in the same ms, and raise `ClockMovedBackwardsError` on clock rollback. Implementation lives in `repository_after/`; tests in `tests/`.

## Commands

### 1. Setup Environment

Build the Python container and install dependencies.

```bash
docker compose build
```

### 2. Before Test (base state; expected to fail)

Runs the test suite against `repository_before/` (no implementation). Failures are expected.

```bash
docker compose run --rm -e REPO_PATH=repository_before app bash -c 'python -m unittest discover -s tests -p "test_*.py" -v || true'
```

### 3. After Test (with solution)

Runs the test suite against `repository_after/` (implemented Snowflake generator).

```bash
docker compose run --rm -e REPO_PATH=repository_after app python -m unittest discover -s tests -p "test_*.py" -v
```

### 4. Evaluation

Runs the evaluation script and writes `evaluation/report.json`.

```bash
docker compose run --rm app python evaluation/evaluation.py
```

### 5. Generate diff.patch

Creates a unified diff (added as `+`, removed as `-`) between `repository_before/` and `repository_after/`. Run from the project root.

```bash
git diff --no-index repository_before/ repository_after/ > patches/diff.patch
```

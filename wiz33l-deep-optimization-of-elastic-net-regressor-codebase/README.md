## Commands

### 1. Test BEFORE (Baseline)
```bash
docker compose run --rm -e TEST_VERSION=before evaluation pytest -v tests/test_optimization.py || true
```

### 2. Test AFTER (Optimized)
```bash
docker compose run --rm -e TEST_VERSION=after evaluation pytest -v tests/test_optimization.py
```

### 3. Run Evaluation (Standard Report)
```bash
docker compose run --rm evaluation
```



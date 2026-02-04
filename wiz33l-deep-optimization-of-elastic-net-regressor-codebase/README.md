## Commands

### 1. Test BEFORE (Unoptimized Version)
```bash
docker compose run --rm -e TEST_VERSION=before evaluation pytest -v tests/test_optimization.py
```

### 2. Test AFTER (Optimized Version)
```bash
docker compose run --rm -e TEST_VERSION=after evaluation pytest -v tests/test_optimization.py
```

### 3. Run Evaluation (Generate JSON Report)
```bash
docker compose run --rm evaluation
```

---


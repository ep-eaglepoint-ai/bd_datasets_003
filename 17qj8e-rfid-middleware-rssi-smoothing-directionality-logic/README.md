# 17QJ8E - RFID Middleware: RSSI Smoothing & Directionality Logic

## Setup Environment

Build and run your solution tests:

### For Local Testing (Detailed Output):

```bash
docker compose run --rm -e REPO_PATH=repository_before app bash -c "echo '=== Testing repository_before ===' && python -m unittest discover -s tests -p test_*.py -v && echo '[PASS] TESTS PASSED' || (echo '[FAIL] TESTS FAILED (expected for baseline)' && exit 0)"

docker compose run --rm -e REPO_PATH=repository_after app bash -c "echo '=== Testing repository_after ===' && python -m unittest discover -s tests -p test_*.py -v && echo '[PASS] TESTS PASSED' || (echo '[FAIL] TESTS FAILED' && exit 1)"

docker compose run --rm app bash -c "echo '=== Running Evaluation ===' && python evaluation/evaluate.py && echo '[PASS] EVALUATION COMPLETE' || (echo '[FAIL] EVALUATION FAILED' && exit 1)"
```

### For Evaluation Interface (Simplified Commands):

**Command 1** - Test repository_before:
```bash
docker compose run --rm -e REPO_PATH=repository_before app bash -c "python -m unittest discover -s tests -p test_*.py -v"
```

**Command 2** - Test repository_after:
```bash
docker compose run --rm -e REPO_PATH=repository_after app bash -c "python -m unittest discover -s tests -p test_*.py -v"
```

**Command 3** - Run evaluation:
```bash
docker compose run --rm app bash -c "python evaluation/evaluate.py"
```

**Note:** The evaluation interface requires these exact commands. Use `REPO_PATH` (not `PYTHONPATH`) and `unittest` (not `pytest`). The evaluation script is `evaluate.py` (not `evaluation.py`).


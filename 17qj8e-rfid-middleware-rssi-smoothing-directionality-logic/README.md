# 17QJ8E - RFID Middleware: RSSI Smoothing & Directionality Logic

## Setup Environment

Build and run your solution tests:

```bash
docker compose run --rm -e REPO_PATH=repository_before app bash -c "echo '=== Testing repository_before ===' && python -m unittest discover -s tests -p test_*.py -v && echo '[PASS] TESTS PASSED' || (echo '[FAIL] TESTS FAILED (expected for baseline)' && exit 0)"

docker compose run --rm -e REPO_PATH=repository_after app bash -c "echo '=== Testing repository_after ===' && python -m unittest discover -s tests -p test_*.py -v && echo '[PASS] TESTS PASSED' || (echo '[FAIL] TESTS FAILED' && exit 1)"

docker compose run --rm app bash -c "echo '=== Running Evaluation ===' && python evaluation/evaluate.py && echo '[PASS] EVALUATION COMPLETE' || (echo '[FAIL] EVALUATION FAILED' && exit 1)"
```


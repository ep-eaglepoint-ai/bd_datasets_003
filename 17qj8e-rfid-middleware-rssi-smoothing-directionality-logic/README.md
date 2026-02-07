# 17QJ8E - RFID Middleware: RSSI Smoothing & Directionality Logic

## Setup Environment

Build and run your solution tests:

### For Evaluation Interface (CodeBuild/Docker Commands):

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

**Important Notes:**
- Use `REPO_PATH` (not `PYTHONPATH`) environment variable
- Use `unittest` (not `pytest`) - tests are written with unittest
- Evaluation script is `evaluate.py` (not `evaluation.py`)
- Report will be generated at `evaluation/reports/report.json`

### For Local Testing (Detailed Output):

```bash
docker compose run --rm -e REPO_PATH=repository_before app bash -c "python -m unittest discover -s tests -p test_*.py -v"

docker compose run --rm -e REPO_PATH=repository_after app bash -c "python -m unittest discover -s tests -p test_*.py -v"

docker compose run --rm app bash -c "python evaluation/evaluate.py"
```


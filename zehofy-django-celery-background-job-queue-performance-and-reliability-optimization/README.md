# ZEHOFY - Django Celery Background Job Queue Performance and Reliability Optimization

## Docker Commands

### Before Test

```bash
docker compose run --rm -e PYTHONPATH=/app/repository_before app pytest -q || true
```

Commands to spin up the app and run tests on repository_before (unoptimized - will fail, `|| true` ensures exit code 0)

### After Test

```bash
docker compose run --rm -e PYTHONPATH=/app/repository_after app pytest -q
```

Commands to run tests on repository_after (optimized - all tests should pass)

### Evaluation

```bash
docker compose run --rm app python evaluation/evaluate.py
```

Commands to run evaluation/evaluate.py and generate reports

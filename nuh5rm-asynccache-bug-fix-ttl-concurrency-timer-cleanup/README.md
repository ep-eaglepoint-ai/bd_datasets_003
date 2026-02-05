# NUH5RM - AsyncCache Bug Fix: TTL, Concurrency & Timer Cleanup

## Docker Commands for Evaluation

### Run Full Evaluation (Before and After)

```bash
docker compose run --rm app python3 evaluation/evaluation.py
```

### Test repository_before (Original)

```bash
docker compose run --rm app node tests/test_runner.js repository_before/AysncCache.js
```

### Test repository_after (Fixed)

```bash
docker compose run --rm app node tests/test_runner.js repository_after/AsyncCache.js
```

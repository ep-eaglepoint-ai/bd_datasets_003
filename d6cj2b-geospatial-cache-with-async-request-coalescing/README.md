# D6CJ2B - Geospatial Cache with Async Request Coalescing

## Commands

### 1. Run Tests on repository_before
```bash
docker compose run --rm app bash -c 'cd repository_before && python -m pytest >/dev/null 2>&1 || echo "No implementation in repository_before"'
```

### 2. Run Tests on repository_after
```bash
docker compose run --rm app bash -c 'cd repository_after && python -m pytest ../tests/test_weather_cache.py -q --tb=no --no-header -r no'
```

### 3. Run Evaluation
```bash
docker compose run --rm app python evaluation/evaluation.py
```
    
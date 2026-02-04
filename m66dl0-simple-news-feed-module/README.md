# M66DL0 - Simple News Feed Module

## Commands

### 1. Setup
```bash
docker compose build
```

### 2. Run Tests on repository_before
```bash
docker compose run --rm app bash -c 'cd repository_before && python -m pytest || true'
```

### 3. Run Tests on repository_after
```bash
docker compose run --rm app bash -c 'cd repository_after && python -m pytest ../tests/test_news_feed.py -q --tb=no --no-header -r no'
```

### 4. Run Evaluation
```bash
docker compose run --rm app python evaluation/evaluation.py
```
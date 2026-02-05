
## Commands

### 1. before Tests
```bash
docker compose run --rm app python -m pytest tests/test_main.py
```


### 2. after Tests
```bash
docker compose run --rm app python -m pytest tests/test_main.py
```

### 2. Evaluation
```bash
docker compose run --rm app python evaluation/evaluation.py
```
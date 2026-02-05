# WSI1TK - Minimum Slot Schedule

## Before Test Docker Command
```bash
docker compose run --rm -e REPO_PATH=repository_before app bash -c 'pytest -q tests || true'
```

## After Test Docker Command
```bash
docker compose run --rm -e REPO_PATH=repository_after app pytest -q tests
```

## Evaluation Docker Command
```bash
docker compose run --rm app python evaluation/evaluate.py
```

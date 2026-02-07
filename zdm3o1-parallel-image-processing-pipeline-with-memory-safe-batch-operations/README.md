# ZDM3O1 - Parallel Image Processing Pipeline with Memory Safe Batch Operations

## Before Test

```bash
docker compose run --rm -e PYTHONPATH=/app/repository_before app pytest -q || true
```

## After Test

```bash
docker compose run --rm -e PYTHONPATH=/app/repository_after app pytest -q
```

## Evaluation

```bash
docker compose run --rm app python evaluation/evaluate.py
```

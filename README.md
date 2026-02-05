# MQ6758 - Adversarial-Testing-of-Fiscal-Precision-Engine

## Before Test Docker Command
```bash
docker compose run --rm -w /app/repository_before app python -m pytest || true
```

## After Test Docker Command
```bash
docker compose run --rm -w /app/repository_after app python -m pytest -v
```

## Evaluation Docker Command
```bash
docker compose run --rm -w /app app python evaluation/evaluate.py
```

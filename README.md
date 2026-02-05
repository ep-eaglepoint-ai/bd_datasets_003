# MQ6758 - Adversarial-Testing-of-Fiscal-Precision-Engine

## Before Test Docker Command
```bash
docker compose run --rm -w /app/repository_before app bash -c 'pytest test_*.py || true'
```

## After Test Docker Command
```bash
docker compose run --rm -w /app/repository_after app pytest -v
```

## Evaluation Docker Command
```bash
docker compose run --rm app python evaluation/evaluate.py
```

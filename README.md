# MQ6758 - Adversarial-Testing-of-Fiscal-Precision-Engine

## Before Test Docker Command
```bash
docker compose run --rm -w /app/repository_before app pytest test_*.py || true
```

## After Test Docker Command
```bash
docker compose run --rm -w /app/repository_after app pytest test_*.py -v
```

## Evaluation Docker Command
```bash
docker compose run --rm -w /app app python evaluation/evaluate.py
```

<<<<<<< HEAD
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
=======
# bd_datasets_003
>>>>>>> 4bc5eb3c605b107b75c57589640a15d45f4bed3f

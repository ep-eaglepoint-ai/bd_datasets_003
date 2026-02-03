# UYWBML - Refactoring Password Generator

## Before Test Docker Command
```bash
docker compose run app pytest tests --repo before; exit 0
```

## After Test Docker Command
```bash
docker compose run app pytest tests --repo after
```

### Evaluation Docker Command
```bash
docker compose run app python evaluation/evaluation.py
```
# PC8PAR - Optimize Go Implementation of Weight-Standardized Convolution with Group Normalization

## Before Test Docker Command

```bash
docker compose run --rm -e REPO_PATH=/app/repository_before app go run ./tests/runner.go
```

## After Test Docker Command

```bash
docker compose run --rm -e REPO_PATH=/app/repository_after app go run ./tests/runner.go
```

## Evaluation Docker Command

```bash
docker compose run --rm app go run ./evaluation/evaluation.go
```

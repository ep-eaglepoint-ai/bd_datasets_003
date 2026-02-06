# Offline-First Sync Engine (Event Sourcing + Idempotency)

### Run tests for repository_after

```bash
docker compose run --rm app go run -tags tools tests/runner.go
```

### Run evaluation (generate report.json)

```bash
docker compose run --rm app go run evaluation/evaluation.go
```

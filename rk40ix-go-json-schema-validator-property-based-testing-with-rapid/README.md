# JSON Schema Validator - Property Tests + Meta Tests

### Run meta-tests against `repository_before` (expected: fail):

```bash
docker compose run --rm -e REPO_PATH=/app/repository_before app go run -tags tools tests/runner.go
```

### Run meta-tests against `repository_after` (expected: pass):

```bash
docker compose run --rm -e REPO_PATH=/app/repository_after app go run -tags tools tests/runner.go
```

### Run evaluation report generation:

```bash
docker compose run --rm app go run ./evaluation/evaluation.go
```

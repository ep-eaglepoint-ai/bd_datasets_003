# JSON Schema Validator - Property Tests + Meta Tests

### Run meta-tests against `repository_after` (expected: pass):

```bash
docker compose run --rm app go run -tags tools tests/runner.go
```

### Run evaluation report generation:

```bash
docker compose run --rm app go run ./evaluation/evaluation.go
```

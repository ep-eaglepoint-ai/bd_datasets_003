# AXMTPZ - PROXY Protocol v2 Binary Parser with Connection Wrapping

### Run tests

```bash
docker compose run --rm app go test -timeout 10s -v ./tests
```

### Run evaluation (generate report.json)

```bash
docker compose run --rm app go run ./evaluation/evaluation.go
```

# AXMTPZ - PROXY Protocol v2 Binary Parser with Connection Wrapping

Tests and evaluation run only against `repository_after`. Uses go.work at project root so tests run from /app (avoids -w path issues on Windows/Git Bash). `REPO_PATH` is set in the container.

### Run tests

```bash
docker compose run --rm app go test -timeout 10s -v ./tests
```

### Run evaluation (generate report.json)

```bash
docker compose run --rm app go run ./evaluation/evaluation.go
```

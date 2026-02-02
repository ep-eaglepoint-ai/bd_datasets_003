# In-Memory Graph Transaction Engine with Deterministic Locking


## Run tests (against repository_after only)
Uses go.work at project root so tests run from /app (avoids -w path issues on Windows/Git Bash):
```bash
docker compose run --rm app go test -v ./tests
```

## Run evaluation and generate report

```bash
docker compose run --rm app go run ./evaluation/evaluation.go
```


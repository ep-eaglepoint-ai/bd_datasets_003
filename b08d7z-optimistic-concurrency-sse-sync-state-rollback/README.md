# BO8D7Z - Optimistic Cocurrency SSE Sync Rollback

### Run tests (only repository_after)

```bash
docker compose run --build --rm -e REPO_PATH=repository_after app go run tests/runner.go
```

### Generate reports

```bash
docker compose run --build --rm app go run ./evaluation/evaluation.go
```

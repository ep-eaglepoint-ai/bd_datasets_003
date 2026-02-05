# High-Concurrency Seat Reservation System

## Run tests in Docker

```bash
docker compose run --build --rm -e REPO_PATH=repository_after app go run tests/runner.go
```

## Generate evaluation report in Docker

```bash
docker compose run --build --rm app go run ./evaluation/evaluation.go
```

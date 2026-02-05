# High-Concurrency Seat Reservation System

## Run tests in Docker

```bash
docker compose build app
docker compose run --rm -e REPO_PATH=repository_after app go run tests/runner.go
```

## Generate evaluation report in Docker

```bash
docker compose build app
docker compose run --rm app go run ./evaluation/evaluation.go
```

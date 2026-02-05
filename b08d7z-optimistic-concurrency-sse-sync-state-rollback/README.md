# High-Concurrency Seat Reservation System

## Run tests in Docker

```bash
<<<<<<< HEAD
docker compose run --build --rm -e REPO_PATH=repository_after app go run tests/runner.go
=======
docker compose build app
docker compose run --rm -e REPO_PATH=repository_after app go run tests/runner.go
>>>>>>> b08d7z-optimistic-concurrency-sse-sync-state-rollback
```

## Generate evaluation report in Docker

```bash
<<<<<<< HEAD
docker compose run --build --rm app go run ./evaluation/evaluation.go
=======
docker compose build app
docker compose run --rm app go run ./evaluation/evaluation.go
>>>>>>> b08d7z-optimistic-concurrency-sse-sync-state-rollback
```

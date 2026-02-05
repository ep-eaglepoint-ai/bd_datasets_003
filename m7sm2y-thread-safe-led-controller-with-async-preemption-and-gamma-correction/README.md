# M7SM2Y - Thread-Safe LED Controller with Async Preemption and Gamma Correction

### Run tests with race detector(as specified in the requirements)

```bash
docker compose run --rm app go test -race -timeout 50s -v ./tests
```

### Run evaluation (generate report.json)

```bash
docker compose run --rm app go run ./evaluation/evaluation.go
```

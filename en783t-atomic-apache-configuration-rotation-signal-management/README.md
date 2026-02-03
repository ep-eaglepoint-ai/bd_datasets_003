# EN783T - Atomic Apache Configuration Rotation & Signal Management


## Run tests on repository_after

```bash
docker compose run --rm app go test -timeout 60s -v ./tests
```

## Run evaluation (generate report)

```bash
docker compose run --rm app go run ./evaluation/evaluation.go
```

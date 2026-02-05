# AdaIN Optimization - Go Implementation



### 1. Run tests against `repository_before` 

```bash
docker compose run --rm -e REPO_PATH=repository_before app go run tests/runner.go
```

### 2. Run tests against `repository_after`

```bash
docker compose run --rm app go run tests/runner.go
```


### Run Evaluation (Optional)
```bash
docker compose run --rm app go run ./evaluation/evaluation.go
```

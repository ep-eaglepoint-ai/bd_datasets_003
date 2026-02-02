# AXMTPZ - PROXY Protocol v2 Binary Parser with Connection Wrapping

Tests and evaluation run only against `repository_after`.

Default working dir is `/app`; `REPO_PATH` is set in the container. No `-w` or quotes needed.

### Run tests

```bash
docker compose run --rm app go test -v ./tests
```

### Run evaluation (generate report.json)

```bash
docker compose run --rm app go run ./evaluation/evaluation.go
```

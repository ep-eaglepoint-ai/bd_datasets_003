# 359JAF - GC Optimization via sync.Pool and Buffer Reuse

## Before Test Docker Command
docker compose run --rm app sh -c 'go test -v -tags=before -race ./tests/... || true'

## After Test Docker Command
docker compose run --rm app go test -v -tags=after -race ./tests/...

## Evaluation Docker Command
docker compose run --rm app go run evaluation/evaluation.go

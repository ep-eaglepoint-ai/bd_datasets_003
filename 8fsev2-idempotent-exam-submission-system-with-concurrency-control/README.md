## After Test: Run Concurrency Suite
docker compose run --rm test-runner go test -v ./tests/... -race

## evaluation
docker compose run --rm test-runner go run evaluation/evaluation.go
# D1N2OJ - Real-Time-Multi-Tenant-CDN-Analytics-Engine

## Before Test Docker Command
```bash
docker compose run --rm --no-deps app sh -c "echo 'No implementation in repository_before' && exit 1"
```

## After Test Docker Command
```bash
docker compose run --rm --no-deps app sh -c "go test ./tests/... -v -count=1"
```

## Evaluation Docker Command
```bash
docker compose run --rm --no-deps app sh -c "go run ./evaluation/"
```
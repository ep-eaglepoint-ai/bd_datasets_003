# X7YX6P - Industrial Weighbridge: Auto-Zeroing and Stability Detection

## Before Test Docker Command

```bash
docker compose run --rm -e REPO_PATH=repository_before app bash -c 'cd tests && cp ../repository_before/main.go . 2>/dev/null || echo "No main.go in repository_before" && go test -v . || true'
```

## After Test Docker Command

```bash
docker compose run --rm -e REPO_PATH=repository_after app bash -c 'cd tests && cp ../repository_after/main.go . && go test -v .'
```

## Evaluation Docker Command

```bash
docker compose run --rm app bash -c 'cd evaluation && go mod tidy && go run evaluate.go'
```
    
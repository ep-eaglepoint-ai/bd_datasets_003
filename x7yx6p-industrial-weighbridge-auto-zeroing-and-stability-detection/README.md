# X7YX6P - Industrial Weighbridge: Auto-Zeroing and Stability Detection



## After Test Docker Command

```bash
docker compose run --rm -e REPO_PATH=repository_after app bash -c 'cd tests && cp ../repository_after/main.go . && go test -v .'
```

## Evaluation Docker Command

```bash
docker compose run --rm app bash -c 'cd evaluation && go mod tidy && go run evaluate.go'
```
    

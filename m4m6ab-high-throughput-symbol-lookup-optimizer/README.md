# M4M6AB - high-throughput-symbol-lookup-optimizer

## Commands

test repository_before
```bash
docker compose run app mvn test -Drepo=before; exit 0
```

test repository_after
```bash
docker compose run app mvn test -Drepo=after
```

run evaluation
```bash
docker compose run evaluation
```
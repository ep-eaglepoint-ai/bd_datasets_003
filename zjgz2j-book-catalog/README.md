# ZJGZ2J - Book Catalog

## Before Test Docker Command

```bash
SRC_DIR=repository_before docker compose run --rm app sh -c 'make clean && make all && make test'
```

## After Test Docker Command

```bash
SRC_DIR=repository_after docker compose run --rm app sh -c 'make clean && make all && make test'
```

## Evaluation Docker Command

```bash
make eval && ./evaluation/evaluate
```

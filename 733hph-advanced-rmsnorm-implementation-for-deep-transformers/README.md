# RMSNorm Implementation

## Docker Commands

```bash
docker compose run --rm -e REPO_PATH=repository_before app bash -c 'pytest tests/test_rmsnorm.py -v || true'

docker compose run --rm -e REPO_PATH=repository_after app pytest tests/test_rmsnorm.py -v

docker compose run --rm app python evaluation/evaluate.py
```


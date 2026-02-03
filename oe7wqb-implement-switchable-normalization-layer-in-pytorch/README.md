# OE7WQB - Implement Switchable Normalization Layer in PyTorch

```bash
### Before Test Docker Command
docker compose run --rm -e REPO_PATH=repository_before app bash -c 'pytest -q tests || true'

### After Test Docker Command
docker compose run --rm -e REPO_PATH=repository_after app pytest -q tests

### Evaluation Docker Command
docker compose run --rm app python evaluation/evaluation.py

```

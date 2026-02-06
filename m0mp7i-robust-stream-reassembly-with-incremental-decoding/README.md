# M0MP7I - Robust Stream Reassembly with Incremental Decoding

## Docker Commands (Aqila Evaluation)

```bash
# 1. Run Tests on repository_before
docker compose run --rm -e PYTHONPATH=/app/repository_before app pytest -q

# 2. Run Tests on repository_after
docker compose run --rm -e PYTHONPATH=/app/repository_after app pytest -q

# 3. Run Evaluation
docker compose run --rm app python evaluation/evaluation.py
```

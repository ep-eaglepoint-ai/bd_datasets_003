- 
Before command
```bash
docker compose run --rm app env TARGET_REPO=before pytest -q -vv tests
```

After command
```bash
docker compose run --rm app env TARGET_REPO=after pytest -q -vv tests
```
Evaluation Script
```bash
docker compose run --rm app python evaluation/evaluation.py
```
# React Virtualized Data Grid Performance Fix

**Run tests (repository_before):**
```bash
docker compose run --rm -e REPO_PATH=repository_before app
```

**Run tests (repository_after):**
```bash
docker compose run --rm -e REPO_PATH=repository_after app
```

**Generate report.json:**
```bash
docker compose run --rm app node evaluation/evaluate.mjs
```

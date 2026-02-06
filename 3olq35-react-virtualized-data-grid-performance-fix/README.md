# React Virtualized Data Grid Performance Fix

**Note:** npm workspaces require unique `"name"` in each workspace. Use `trading-dashboard-before` in `repository_before/package.json` and `trading-dashboard-after` in `repository_after/package.json`. Do not use the same name for both.

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

# React Virtualized Data Grid Performance Fix

**Note:** npm workspaces require unique `"name"` in each workspace. Use `trading-dashboard-before` in `repository_before/package.json` and `trading-dashboard-after` in `repository_after/package.json`. Do not use the same name for both.

**1. Install deps from WSL only** (so Rollup gets the Linux binary). If you see `Cannot find module @rollup/rollup-linux-x64-gnu`, run this in WSL then build again:
```bash
rm -rf node_modules repository_before/node_modules repository_after/node_modules
rm -f package-lock.json repository_before/package-lock.json repository_after/package-lock.json
npm install
```
**2. Build the image** (~30–60 s):
```bash
docker compose build
```

**Run tests** (use `-T` so test output is visible in WSL):
```bash
docker compose run --rm -T -e REPO_PATH=repository_before app
docker compose run --rm -T -e REPO_PATH=repository_after app
```

**Generate report.json** (no REPO_PATH = run evaluation):
```bash
docker compose run --rm -T app
```

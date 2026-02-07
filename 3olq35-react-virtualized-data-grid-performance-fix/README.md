# React Virtualized Data Grid Performance Fix

**Note:** npm workspaces require unique `"name"` in each workspace. Use `trading-dashboard-before` in `repository_before/package.json` and `trading-dashboard-after` in `repository_after/package.json`. Do not use the same name for both.

**1. Install deps from WSL only** (so Rollup gets the Linux binary). If you see `Cannot find module @rollup/rollup-linux-x64-gnu`, run this in WSL then build again:
```bash
rm -rf node_modules repository_before/node_modules repository_after/node_modules
rm -f package-lock.json repository_before/package-lock.json repository_after/package-lock.json
npm install
```
**2. Build the image** (~1–3 min; most time is `npm install`). To see live output use:
```bash
docker compose --progress=plain build
```

**If Docker keeps failing**
- **"cannot connect to Docker API" / "pipe not found"** → Start **Docker Desktop** and wait until it’s fully running (whale icon steady), then try again.
- **Build seems stuck** → Wait 2–3 min (npm install is slow). Use `docker compose --progress=plain build` to see logs.
- **npm install / npm ci fails in build** → In the project folder run `npm install` once (to create/update `package-lock.json`), then rebuild. Check network/VPN.
- **Out of memory** → Docker Desktop → Settings → Resources → set Memory to 4 GB or more.
- **No build output at all** → Disable BuildKit: `$env:DOCKER_BUILDKIT=0; docker compose build`
- **Paste the exact error** (last 20–30 lines of the build log) so we can target the fix.

**Run tests** (use `-T` so test output is visible):
```bash
docker compose run --rm -T -e REPO_PATH=repository_before app
docker compose run --rm -T -e REPO_PATH=repository_after app
```

**Generate report.json** (no REPO_PATH = runs evaluation):
```bash
docker compose run --rm -T app
```

**Run evaluation locally** (from project root after `npm install`):
```bash
npm run evaluate
```
Or: `node evaluation/evaluation.js` (must be run from project root, and `node_modules` must exist).

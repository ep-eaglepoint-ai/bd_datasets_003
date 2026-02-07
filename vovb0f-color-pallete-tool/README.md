# VOVB0F - Color palette tool

Build and run tests or evaluation in Docker from this folder (`vovb0f-color-pallete-tool`). Commands below are for **WSL** only. The app runs from the image (no volume mount) so Rollup/vitest optional deps match the container; rebuild after code changes: `docker compose build`.

**Go to project in WSL:**

```bash
cd "/mnt/c/Users/teshi/Desktop/Projects/Eaglepoint AI/day one/bd_datasets_003/vovb0f-color-pallete-tool"
```

---

## 1. Repository Before (Docker Compose)



```bash
docker compose run --rm -e REPO_PATH=repository_before app sh -c 'npm test || true'
```

---

## 2. Repository After (Docker Compose)



```bash
docker compose run --rm -e REPO_PATH=repository_after app npm test
```

---

## 3. Evaluation (Docker Compose)



```bash
docker compose run --rm app node evaluation/evaluate.js
```




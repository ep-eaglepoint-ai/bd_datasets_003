# 8L09G3 - GitHub Trending Repositories

## Docker Commands

### 1. Before Test (runs tests on the 'before' repository)
```bash
docker build -t github-trending . && docker run --rm --entrypoint python github-trending tests/test.py repository_before || true
```

### 2. After Test (runs tests on the 'after' repository)
```bash
docker build -t github-trending . && docker run --rm --entrypoint python github-trending tests/test.py
```

### 3. Evaluation (Safe Mode)
Runs the full evaluation script and ensures generated reports are owned by your user.
```bash
docker build -t github-trending . && docker run --rm -u $(id -u):$(id -g) -v $(pwd):/app --entrypoint python github-trending evaluation/evaluation.py
```

> [!TIP]
> The evaluation command uses `-u $(id -u):$(id -g)` to prevent permission denied errors on the generated reports.
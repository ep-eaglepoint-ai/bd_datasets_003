## Commands

```bash
# Before Test (Expected to fail performance checks)
docker build -t sum-optimizer . && \
docker run -e TARGET=before sum-optimizer node tests/test.js || true

# After Test
docker run -e TARGET=after sum-optimizer node tests/test.js

# Evaluation
docker run --rm \
  -u $(id -u):$(id -g) \
  -v $(pwd):/app \
  sum-optimizer node evaluation/evaluation.js
```

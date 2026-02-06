FROM node:20-slim
WORKDIR /app
COPY . /app
# Clean install: remove lock files and node_modules to fix platform-specific optional deps
# (e.g. @rollup/rollup-linux-x64-gnu) when host is Windows but container is Linux
# Increase Node heap to 4GB to avoid OOM during tests/evaluation
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENTRYPOINT ["/bin/sh", "-c", "set -e; rm -rf node_modules repository_before/node_modules repository_after/node_modules package-lock.json repository_before/package-lock.json repository_after/package-lock.json; npm install; if [ \"$REPO_PATH\" = 'repository_before' ]; then npm run test -w repository_before || true; elif [ \"$REPO_PATH\" = 'repository_after' ]; then npm run test -w repository_after; else node evaluation/evaluate.mjs; fi"]
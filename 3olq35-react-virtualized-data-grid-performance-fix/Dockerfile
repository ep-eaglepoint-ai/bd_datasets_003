FROM node:20-slim
WORKDIR /app
COPY . /app
ENTRYPOINT ["/bin/sh", "-c", "set -e; npm install; if [ \"$REPO_PATH\" = 'repository_before' ]; then npm run test -w repository_before || true; elif [ \"$REPO_PATH\" = 'repository_after' ]; then npm run test -w repository_after; else node evaluation/evaluate.mjs; fi"]
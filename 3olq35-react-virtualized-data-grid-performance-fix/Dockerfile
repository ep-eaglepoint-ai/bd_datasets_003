FROM node:20-slim
WORKDIR /app
COPY . /app
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm config set fetch-timeout 600000 && npm config set fetch-retries 5 && npm install
ENTRYPOINT ["/bin/sh", "-c", "set -e; if [ \"$REPO_PATH\" = 'repository_before' ]; then npm run test -w repository_before || true; elif [ \"$REPO_PATH\" = 'repository_after' ]; then npm run test -w repository_after; else node evaluation/evaluate.mjs; fi"]
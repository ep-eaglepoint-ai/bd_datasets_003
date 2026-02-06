FROM node:20-slim
WORKDIR /app
COPY . /app
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENTRYPOINT ["/bin/sh", "-c", "set -e; if [ ! -f /app/node_modules/@rollup/rollup-linux-x64-gnu/rollup.linux-x64-gnu.node ]; then echo 'Installing deps in container (first run only)...'; rm -rf /app/node_modules /app/repository_before/node_modules /app/repository_after/node_modules /app/package-lock.json /app/repository_before/package-lock.json /app/repository_after/package-lock.json 2>/dev/null; npm install; echo 'Done installing.'; fi; echo 'Running tests...'; if [ \"$REPO_PATH\" = 'repository_before' ]; then npm run test -w repository_before || true; elif [ \"$REPO_PATH\" = 'repository_after' ]; then npm run test -w repository_after; else node evaluation/evaluate.mjs; fi"]
FROM node:20-slim
WORKDIR /app
RUN echo "[Docker] Build started."
COPY . /app
RUN echo "[Docker] COPY done."
# Normalize line endings (CRLF -> LF) so shebangs work in Linux container
RUN sed -i 's/\r$//' /app/evaluation/evaluation.js 2>/dev/null || true
RUN echo "[Docker] Line endings normalized."
ENV NODE_OPTIONS="--max-old-space-size=4096"
# Install deps (1–3 min). Use npm ci when lockfile exists (faster); else npm install.
RUN echo ">>> Installing dependencies (1–3 min)..." \
  && test -f /app/package.json || (echo "ERROR: /app/package.json missing" && exit 1) \
  && npm config set fetch-timeout 600000 \
  && npm config set fetch-retries 5 \
  && (test -f /app/package-lock.json && npm ci --no-audit --no-fund || npm install --no-audit --no-fund --loglevel=info) \
  && echo ">>> Dependencies installed."
# If CMD is passed as one string (e.g. "node process_repo.mjs"), split it so exec gets separate args
ENTRYPOINT ["/bin/sh", "-c", "if [ $# -gt 0 ]; then [ $# -eq 1 ] && set -- $1; exec \"$@\"; fi; set -e; if [ \"$REPO_PATH\" = 'repository_before' ]; then npm run test -w repository_before || true; elif [ \"$REPO_PATH\" = 'repository_after' ]; then npm run test -w repository_after; else node evaluation/evaluation.js; fi"]
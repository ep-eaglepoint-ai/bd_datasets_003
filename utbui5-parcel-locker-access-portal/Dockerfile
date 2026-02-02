FROM node:22-bookworm-slim

WORKDIR /app

# System deps that Prisma/Node tooling may require on Debian slim
RUN apt-get update && apt-get install -y --no-install-recommends \
  openssl \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---- Root deps (test harness + evaluation) ----
COPY package.json ./
COPY jest.config.js jest.setup.js tsconfig.json ./
COPY scripts ./scripts
COPY evaluation ./evaluation
COPY tests ./tests
COPY instances ./instances
COPY trajectory ./trajectory

RUN npm install --no-audit --no-fund

# ---- repository_after deps (Prisma + Next app code used by tests) ----
COPY repository_after/package.json ./repository_after/package.json
COPY repository_after/prisma ./repository_after/prisma

WORKDIR /app/repository_after
RUN npm install --no-audit --no-fund

# Return to root and copy the rest of source (kept after installs for caching)
WORKDIR /app
COPY repository_after ./repository_after

# Default: no long-running command; docker-compose sets commands explicitly
CMD ["node", "-e", "console.log('Image built. Use: docker compose run --rm test-after  OR  docker compose run --rm evaluation')"]

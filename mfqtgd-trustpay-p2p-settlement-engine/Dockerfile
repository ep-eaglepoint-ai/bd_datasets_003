FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  openssl \
  && rm -rf /var/lib/apt/lists/*

# Root wrapper scripts (no dependencies needed)
COPY package.json ./
COPY evaluation ./evaluation
COPY instances ./instances
COPY trajectory ./trajectory
COPY tests ./tests

# Backend deps + source (tests rely on backend/node_modules)
COPY repository_after/backend/package.json ./repository_after/backend/package.json
COPY repository_after/backend/package-lock.json ./repository_after/backend/package-lock.json
WORKDIR /app/repository_after/backend
# Backend has postinstall: prisma generate, but schema.prisma isn't copied yet.
# Install deps without running lifecycle scripts, then generate after copying schema.
RUN npm ci --no-audit --no-fund --ignore-scripts

WORKDIR /app
COPY repository_after/backend ./repository_after/backend
WORKDIR /app/repository_after/backend
RUN npx prisma generate --schema=./prisma/schema.prisma

# Frontend deps + source (frontend tests run via `npm --prefix repository_after/frontend test`)
COPY repository_after/frontend/package.json ./repository_after/frontend/package.json
COPY repository_after/frontend/package-lock.json ./repository_after/frontend/package-lock.json
WORKDIR /app/repository_after/frontend
# Some CI/build environments can end up without a usable lockfile in the build context.
# Prefer deterministic `npm ci`, but fall back to `npm install` if needed.
RUN npm ci --no-audit --no-fund --include=dev || npm install --no-audit --no-fund --include=dev

WORKDIR /app
COPY repository_after/frontend ./repository_after/frontend

# Default is non-long-running; compose provides the command.
CMD ["node", "-e", "console.log('Use: docker compose run --rm test-after OR docker compose run --rm evaluation')"]
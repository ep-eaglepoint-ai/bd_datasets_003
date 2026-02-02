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
RUN npm ci --no-audit --no-fund

WORKDIR /app
COPY repository_after/backend ./repository_after/backend

# Frontend deps + source (frontend tests run via `npm --prefix repository_after/frontend test`)
COPY repository_after/frontend/package.json ./repository_after/frontend/package.json
COPY repository_after/frontend/package-lock.json ./repository_after/frontend/package-lock.json
WORKDIR /app/repository_after/frontend
RUN npm ci --no-audit --no-fund

WORKDIR /app
COPY repository_after/frontend ./repository_after/frontend

# Default is non-long-running; compose provides the command.
CMD ["node", "-e", "console.log('Use: docker compose run --rm test-after OR docker compose run --rm evaluation')"]
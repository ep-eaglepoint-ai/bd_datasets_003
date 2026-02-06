# Multi-stage Dockerfile for Circuit Breaker Demo

# Base image with Node.js
FROM node:20-alpine AS base
WORKDIR /app

# ============================================
# Stage: app-builder - Build the Nuxt application
# ============================================
FROM base AS app-builder
COPY repository_after/package*.json ./
RUN npm install
COPY repository_after/ .
RUN npm run build

# ============================================
# Stage: app - Production application
# ============================================
FROM base AS app
COPY --from=app-builder /app/.output ./.output
COPY --from=app-builder /app/package.json ./
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

# ============================================
# Stage: test-runner - Run tests
# ============================================
FROM base AS test-runner
COPY package*.json ./
RUN npm install
COPY tests/ ./tests/
COPY evaluation/ ./evaluation/
CMD ["npx", "tsx", "tests/test-runner.ts"]

# ============================================
# Stage: evaluation - Run evaluation
# ============================================
FROM base AS evaluation
COPY package*.json ./
RUN npm install
COPY tests/ ./tests/
COPY evaluation/ ./evaluation/
CMD ["npx", "tsx", "evaluation/evaluate.ts"]

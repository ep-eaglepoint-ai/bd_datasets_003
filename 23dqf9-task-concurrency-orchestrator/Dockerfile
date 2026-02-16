# syntax=docker/dockerfile:1
FROM node:20-slim


WORKDIR /app


COPY repository_after/package*.json ./


RUN npm ci --include=dev


COPY repository_after/ ./repository_after/
COPY tests/ ./tests/


ENV NODE_ENV=test


CMD ["npm", "test"]


LABEL maintainer="your-name-or-team"
LABEL description="Node + Vitest environment for QueueManager testing"
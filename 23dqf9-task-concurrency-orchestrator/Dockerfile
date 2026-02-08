# syntax=docker/dockerfile:1
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files first → better layer caching
COPY repository_after/package*.json ./

# Install dependencies (including devDependencies for vitest)
RUN npm ci --include=dev

# Copy the rest of the source code
COPY repository_after/ ./repository_after/
COPY tests/ ./tests/

# Make sure vitest can find the tests
ENV NODE_ENV=test

# Expose nothing – this is for running tests / dev, not serving
# Default command – can be overridden
CMD ["npm", "test"]

# Optional labels
LABEL maintainer="your-name-or-team"
LABEL description="Node + Vitest environment for QueueManager testing"
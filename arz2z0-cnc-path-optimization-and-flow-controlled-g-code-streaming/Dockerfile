# Stage 1: Build Frontend
FROM node:20-slim as frontend-build
WORKDIR /build
# Copy frontend files
COPY repository_after/frontend/package.json repository_after/frontend/package-lock.json* ./
RUN npm install
COPY repository_after/frontend ./
RUN npm run build

# Stage 2: Install frontend test dependencies
FROM node:20-slim as frontend-tests-deps
WORKDIR /tests
COPY tests/frontend/package.json tests/frontend/package-lock.json* ./
RUN npm install

# Stage 3: Runtime & Test Environment
FROM python:3.10-slim
WORKDIR /app

# Install git and Node.js (needed for evaluation and frontend tests)
RUN apt-get update && apt-get install -y git curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy content
COPY repository_after /app/repository_after
COPY tests /app/tests
COPY evaluation /app/evaluation

# Copy built frontend to backend static folder
RUN mkdir -p /app/repository_after/backend/static
COPY --from=frontend-build /build/dist /app/repository_after/backend/static

# Copy pre-installed frontend test node_modules
COPY --from=frontend-tests-deps /tests/node_modules /app/tests/frontend/node_modules

# Set PYTHONPATH
ENV PYTHONPATH=/app/repository_after

# Default command
CMD ["python", "evaluation/evaluation.py"]

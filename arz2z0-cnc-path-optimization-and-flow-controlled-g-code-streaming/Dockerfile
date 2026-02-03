# Stage 1: Build Frontend
FROM node:20-slim as frontend-build
WORKDIR /build
# Copy frontend files
COPY repository_after/frontend/package.json repository_after/frontend/package-lock.json* ./
RUN npm install
COPY repository_after/frontend ./
RUN npm run build

# Stage 2: Runtime & Test Environment
FROM python:3.10-slim
WORKDIR /app

# Install git (often needed for evaluation logic fetching git info)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy content
# Note: We copy repository_after content.
# We place it so that 'backend' is importable.
# The structure in repo is repository_after/backend.
# So if we copy repository_after to /app/repository_after, 
# we need to set PYTHONPATH to /app/repository_after.
COPY repository_after /app/repository_after
COPY tests /app/tests
COPY evaluation /app/evaluation

# Copy built frontend to backend static folder
# Ensuring backend/static exists
RUN mkdir -p /app/repository_after/backend/static
COPY --from=frontend-build /build/dist /app/repository_after/backend/static

# Set PYTHONPATH
ENV PYTHONPATH=/app/repository_after

# Default command
CMD ["python", "evaluation/evaluation.py"]

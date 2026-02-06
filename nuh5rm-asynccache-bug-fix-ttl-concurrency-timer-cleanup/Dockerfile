# Dockerfile for AsyncCache Evaluation
# Supports both Python pytest and Node.js tests

FROM node:20-slim

WORKDIR /repo

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install npm dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Install Python for evaluation scripts
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Default command runs the full evaluation
CMD ["python3", "evaluation/evaluation.py"]

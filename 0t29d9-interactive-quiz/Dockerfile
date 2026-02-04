FROM node:20-slim

# Install Python 3 for evaluation script
RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json and lock file to install dependencies first (caching)
COPY repository_after/package*.json ./repository_after/

# Install dependencies
WORKDIR /app/repository_after
RUN npm install

# Copy the rest of the application
WORKDIR /app
COPY . .

# Install tsx globally for evaluation script
RUN npm install -g tsx

# Create tests-after command
RUN echo '#!/bin/sh\ncd /app/repository_after\nnpm test' > /usr/local/bin/tests-after && \
    chmod +x /usr/local/bin/tests-after

# Create evaluation command
RUN echo '#!/bin/sh\ncd /app\ntsx /app/evaluation/evaluation.ts' > /usr/local/bin/evaluation && \
    chmod +x /usr/local/bin/evaluation

# Ensure evaluation script is executable
RUN chmod +x /app/evaluation/evaluation.ts

# Set permissions if needed (usually root is fine in docker)
# Default command
CMD ["evaluation"]

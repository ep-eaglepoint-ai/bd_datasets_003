FROM node:20-slim

WORKDIR /app

# Install system dependencies and Docker CLI
RUN apt-get update && apt-get install -y \
    openssl \
    curl \
    && curl -fsSL https://get.docker.com | sh \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
# These are expected to be in the build context
COPY package*.json ./
RUN npm install

# Copy project files
COPY . .

# Exposure (optional for tests)
EXPOSE 5173

# Default behavior: run tests
CMD ["npm", "test"]

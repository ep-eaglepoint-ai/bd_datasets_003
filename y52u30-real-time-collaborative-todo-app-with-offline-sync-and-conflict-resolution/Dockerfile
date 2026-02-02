# Dockerfile for Collaborative Todo App with Offline Sync
# Node.js + TypeScript environment

FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Default command runs tests
CMD ["npm", "test"]

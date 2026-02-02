FROM node:20-slim

WORKDIR /app

# Copy package files
COPY repository_after/package*.json ./repository_after/

# Install dependencies
WORKDIR /app/repository_after
RUN npm install

# Copy all source files
WORKDIR /app
COPY . .

# Set working directory for commands
WORKDIR /app/repository_after

# Default command runs tests
CMD ["npm", "test"]

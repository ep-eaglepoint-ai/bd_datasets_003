FROM node:20-slim

WORKDIR /app

# Copy root package.json for test dependencies
COPY package.json ./
COPY jest.config.js ./
COPY jest.setup.js ./

# Install test dependencies
RUN npm install

# Copy repository_after package.json first
COPY repository_after/package.json ./repository_after/

# Install app dependencies
WORKDIR /app/repository_after
RUN npm install

# Copy application code to current directory (repository_after)
COPY repository_after/ ./

# Build the Next.js application
RUN npm run build

# Go back to root
WORKDIR /app

# Copy tests
COPY tests/ ./tests/

# Copy evaluation
COPY evaluation/ ./evaluation/

# Expose port
EXPOSE 3000

# Default command (can be overridden)
CMD ["npm", "test"]

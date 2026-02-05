FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

# Copy package files
COPY package.json playwright.config.js ./

# Install dependencies with specific playwright version matching docker image
RUN npm install @playwright/test@1.48.0 http-server

# Copy test files
COPY tests/ ./tests/

# Copy repository folders
COPY repository_before/ ./repository_before/
COPY repository_after/ ./repository_after/

# Copy evaluation script
COPY evaluation/ ./evaluation/

# Default command runs tests against repository_after
CMD ["npx", "playwright", "test"]

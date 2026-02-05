FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Copy package files
COPY package.json playwright.config.js ./

# Install dependencies
RUN npm install

# Copy test files
COPY tests/ ./tests/

# Copy repository folders
COPY repository_before/ ./repository_before/
COPY repository_after/ ./repository_after/

# Copy evaluation script
COPY evaluation/ ./evaluation/

# Default command runs tests against repository_after
CMD ["npx", "playwright", "test"]

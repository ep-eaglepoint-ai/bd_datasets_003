
FROM node:18-alpine
WORKDIR /app

# Root test runner (Jest + Babel) so tests/ and repository_after/ run without CRA
COPY package.json package-lock.json jest.config.js babel.config.js ./
RUN npm ci

# Copy repository_before (React app under test)
COPY repository_before/package*.json ./repository_before/
RUN cd repository_before && npm ci

# Copy tests and meta-tests
COPY tests/ ./tests/
COPY repository_after/ ./repository_after/
COPY evaluation/ ./evaluation/
COPY instances/ ./instances/

# Copy full repo for runtime (component source, etc.)
COPY repository_before/ ./repository_before/

# Set up test environment
ENV NODE_ENV=test

CMD ["npx", "--yes", "jest", "tests/", "repository_after/", "--config=jest.config.js", "--watchAll=false"]

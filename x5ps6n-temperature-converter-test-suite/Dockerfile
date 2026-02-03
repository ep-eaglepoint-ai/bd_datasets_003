
FROM node:18-alpine
WORKDIR /app

# Copy repository_before (React app)
COPY repository_before/package*.json ./repository_before/
RUN cd repository_before && npm ci

# Copy tests and meta-tests
COPY tests/ ./tests/
COPY repository_after/ ./repository_after/

# Install test dependencies globally
RUN npm install -g jest

# Set up test environment
ENV NODE_ENV=test

CMD ["npm", "test", "--", "--testPathPattern=tests"]
